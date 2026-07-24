import { Server as IOServer, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createLogger } from "../shared/logger";
import { db } from "./db";
import { messages, conversationParticipants } from "@shared/schema";
import { eq, and, ne, count } from "drizzle-orm";
import { redisPub, redisSub, setUserOnline, setUserOffline, getOnlineUsers } from "./redis";
import { messageQueue } from "./queues/messageQueue";
import { incrementActiveSockets, decrementActiveSockets, recordMessageSent } from "./metrics/prometheus";

interface SocketWithUser extends Socket {
  userId?: number;
}

/**
 * Socket.IO setup with distributed Redis PubSub adapter, presence engine,
 * metrics recording, and write-behind message buffer.
 */
export function setupSocket(io: IOServer) {
  const log = createLogger("socket");

  // Attach Redis adapter if Redis PubSub connections are available
  if (redisPub && redisSub) {
    try {
      io.adapter(createAdapter(redisPub, redisSub));
      log.info("⚡ Socket.IO Redis Adapter configured for horizontal scaling.");
    } catch (err) {
      log.error("Failed to attach Redis Adapter:", (err as Error).message);
    }
  }

  io.on("connection", (socket: SocketWithUser) => {
    log.info("User connected:", socket.id);
    incrementActiveSockets();

    // Auto-authenticate from socket auth
    const userId = (socket.handshake.auth as any).userId;
    if (userId) {
      socket.userId = userId;
      socket.join(`user:${userId}`);
      setUserOnline(userId).then(async () => {
        io.emit("user_online", { userId });
        const onlineUsers = await getOnlineUsers();
        socket.emit("online_users", onlineUsers);
      });
      log.info(`User ${userId} authenticated on connection`);
    }

    // Step 1: authenticate socket connection (backup)
    socket.on("authenticate", async (userId: number) => {
      socket.userId = userId;
      socket.join(`user:${userId}`);
      await setUserOnline(userId);
      io.emit("user_online", { userId });
      const onlineUsers = await getOnlineUsers();
      socket.emit("online_users", onlineUsers);
      log.info(`User ${userId} authenticated and joined personal room`);
    });

    // Step 2: join conversation
    socket.on("join_conversation", async (conversationId: number) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }

        const [participant] = await db
          .select()
          .from(conversationParticipants)
          .where(
            and(
              eq(conversationParticipants.conversationId, conversationId),
              eq(conversationParticipants.userId, socket.userId)
            )
          );

        if (!participant) {
          socket.emit("error", { message: "Access denied" });
          return;
        }

        socket.join(`conversation:${conversationId}`);
        log.info(`User ${socket.userId} joined conversation ${conversationId}`);
      } catch (error) {
        log.error("Error joining conversation:", error);
        socket.emit("error", { message: "Failed to join conversation" });
      }
    });

    // Step 3: leave conversation
    socket.on("leave_conversation", (conversationId: number) => {
      socket.leave(`conversation:${conversationId}`);
      log.info(`User ${socket.userId} left conversation ${conversationId}`);
    });

    // Step 4: send message (just relay encrypted data)
    socket.on(
      "send_message",
      async (data: { conversationId: number; content: string }) => {
        try {
          if (!socket.userId) {
            socket.emit("error", { message: "Not authenticated" });
            return;
          }

          const { conversationId, content } = data;

          // Confirm sender is part of conversation
          const [participant] = await db
            .select()
            .from(conversationParticipants)
            .where(
              and(
                eq(conversationParticipants.conversationId, conversationId),
                eq(conversationParticipants.userId, socket.userId)
              )
            );

          if (!participant) {
            socket.emit("error", { message: "Access denied" });
            return;
          }

          // Fetch other participants to evaluate their states (pending/blocked)
          const others = await db
            .select({
              userId: conversationParticipants.userId,
              state: conversationParticipants.state,
            })
            .from(conversationParticipants)
            .where(
              and(
                eq(conversationParticipants.conversationId, conversationId),
                ne(conversationParticipants.userId, socket.userId)
              )
            );

          // If any participant has blocked, reject sending
          const someoneBlocked = others.some((p) => p.state === "blocked");
          if (someoneBlocked) {
            socket.emit("error", {
              message: "The recipient has blocked this conversation",
            });
            return;
          }

          // If others are pending, allow only the first message from this sender
          const someonePending = others.some((p) => p.state === "pending");
          if (someonePending) {
            const [{ value: sentCount } = { value: 0 }] = await db
              .select({ value: count(messages.id) })
              .from(messages)
              .where(
                and(
                  eq(messages.conversationId, conversationId),
                  eq(messages.senderId, socket.userId)
                )
              );
            if ((sentCount as unknown as number) >= 1) {
              socket.emit("error", {
                message: "Please wait until the recipient accepts your request",
              });
              return;
            }
          }

          // Enqueue message via Write-Behind Queue for sub-millisecond real-time relay
          recordMessageSent();
          const messageId = await messageQueue.enqueue({
            conversationId,
            senderId: socket.userId,
            content,
            delivered: true,
          });

          const newMessage = {
            id: messageId,
            createdAt: new Date(),
          };

          // If this is a request message (recipient is pending), notify them
          if (someonePending) {
            for (const p of others) {
              if (p.state === "pending") {
                io.to(`user:${p.userId}`).emit("chat_request", {
                  conversationId,
                  fromUserId: socket.userId,
                  messageId: newMessage.id,
                  content,
                  createdAt: newMessage.createdAt,
                });
                log.info(
                  `Chat request sent from user ${socket.userId} to user ${p.userId}`
                );
              }
            }
          }

          // Broadcast message to all participants in the conversation
          io.to(`conversation:${conversationId}`).emit("new_message", {
            id: newMessage.id,
            conversationId,
            senderId: socket.userId,
            content,
            delivered: true,
            read: false,
            createdAt: newMessage.createdAt,
          });

          // Also notify participants' personal rooms to refresh conversation list
          const allParticipants = await db
            .select({ userId: conversationParticipants.userId })
            .from(conversationParticipants)
            .where(eq(conversationParticipants.conversationId, conversationId));

          for (const p of allParticipants) {
            io.to(`user:${p.userId}`).emit("conversation_activity", {
              conversationId,
              messageId: newMessage.id,
            });

            // For pending conversations, also send the message directly to personal room
            // This ensures User 2 sees the message even if not viewing the conversation
            if (p.userId !== socket.userId) {
              io.to(`user:${p.userId}`).emit("new_message", {
                id: newMessage.id,
                conversationId,
                senderId: socket.userId,
                content,
                delivered: true,
                read: false,
                createdAt: newMessage.createdAt,
              });
            }
          }

          log.info(
            `Message sent in conversation ${conversationId} by user ${socket.userId}`
          );
        } catch (error) {
          log.error("Error sending message:", error);
          socket.emit("error", { message: "Failed to send message" });
        }
      }
    );

    // Typing indicator (unchanged)
    socket.on(
      "typing",
      (data: { conversationId: number; isTyping: boolean }) => {
        if (!socket.userId) return;

        socket.to(`conversation:${data.conversationId}`).emit("user_typing", {
          userId: socket.userId,
          isTyping: data.isTyping,
        });
      }
    );

    // ========== WebRTC signaling events ==========
    // Map: forward events to a specific user's personal room: `user:${id}`
    // Client emits with a target `toUserId`, server relays and annotates with `fromUserId`.

    // Initiate a call by sending an SDP offer to the callee
    socket.on(
      "call_user",
      (payload: {
        toUserId: number;
        offer: RTCSessionDescriptionInit;
        media: { audio: boolean; video: boolean };
      }) => {
        try {
          if (!socket.userId)
            return socket.emit("error", { message: "Not authenticated" });
          const { toUserId, offer, media } = payload;
          log.info("[signaling] call_user", {
            fromUserId: socket.userId,
            toUserId,
            media,
            hasSdp: !!offer?.type,
          });
          io.to(`user:${toUserId}`).emit("incoming_call", {
            fromUserId: socket.userId,
            offer,
            media,
          });
        } catch (err) {
          log.error("call_user error:", err);
          socket.emit("error", { message: "Failed to initiate call" });
        }
      }
    );

    // Callee answers with SDP answer
    socket.on(
      "answer_call",
      (payload: { toUserId: number; answer: RTCSessionDescriptionInit }) => {
        try {
          if (!socket.userId)
            return socket.emit("error", { message: "Not authenticated" });
          const { toUserId, answer } = payload;
          log.info("[signaling] answer_call", {
            fromUserId: socket.userId,
            toUserId,
            hasSdp: !!answer?.type,
          });
          io.to(`user:${toUserId}`).emit("call_answer", {
            fromUserId: socket.userId,
            answer,
          });
        } catch (err) {
          log.error("answer_call error:", err);
          socket.emit("error", { message: "Failed to answer call" });
        }
      }
    );

    // Optional: callee rejects call
    socket.on(
      "reject_call",
      (payload: { toUserId: number; reason?: string }) => {
        try {
          if (!socket.userId)
            return socket.emit("error", { message: "Not authenticated" });
          const { toUserId, reason } = payload;
          log.info("[signaling] reject_call", {
            fromUserId: socket.userId,
            toUserId,
            reason,
          });
          io.to(`user:${toUserId}`).emit("call_rejected", {
            fromUserId: socket.userId,
            reason,
          });
        } catch (err) {
          log.error("reject_call error:", err);
        }
      }
    );

    // Exchange ICE candidates
    socket.on(
      "ice_candidate",
      (payload: { toUserId: number; candidate: RTCIceCandidateInit }) => {
        try {
          if (!socket.userId)
            return socket.emit("error", { message: "Not authenticated" });
          const { toUserId, candidate } = payload;
          log.info("[signaling] ice_candidate", {
            fromUserId: socket.userId,
            toUserId,
            hasCandidate: !!candidate?.candidate,
          });
          io.to(`user:${toUserId}`).emit("ice_candidate", {
            fromUserId: socket.userId,
            candidate,
          });
        } catch (err) {
          log.error("ice_candidate error:", err);
        }
      }
    );

    // End an ongoing call
    socket.on("end_call", (payload: { toUserId: number }) => {
      try {
        if (!socket.userId)
          return socket.emit("error", { message: "Not authenticated" });
        const { toUserId } = payload;
        log.info("[signaling] end_call", {
          fromUserId: socket.userId,
          toUserId,
        });
        io.to(`user:${toUserId}`).emit("call_ended", {
          fromUserId: socket.userId,
        });
      } catch (err) {
        log.error("end_call error:", err);
      }
    });

    // Mark message as read
    socket.on("mark_as_read", async (data: { messageId: number }) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }

        const { messageId } = data;

        // Update message read status
        const [updatedMessage] = await db
          .update(messages)
          .set({ read: true })
          .where(eq(messages.id, messageId))
          .returning();

        if (updatedMessage) {
          // Notify the sender that their message was read
          io.to(`user:${updatedMessage.senderId}`).emit("message_read", {
            messageId: updatedMessage.id,
          });

          log.info(
            `Message ${messageId} marked as read by user ${socket.userId}`
          );
        }
      } catch (error) {
        log.error("Error marking message as read:", error);
        socket.emit("error", { message: "Failed to mark message as read" });
      }
    });

    socket.on("disconnect", async () => {
      decrementActiveSockets();
      if (socket.userId) {
        await setUserOffline(socket.userId);
        // Notify all clients about user going offline
        io.emit("user_offline", { userId: socket.userId });
      }
      log.info("User disconnected:", socket.id);
    });
  });
}
