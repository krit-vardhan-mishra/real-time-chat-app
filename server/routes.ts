import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as IOServer } from "socket.io";
import { setupAuth } from "./auth";
import { setupSocket } from "./socket";
import { db } from "./db";
import {
  conversations,
  conversationParticipants,
  messages,
  users,
} from "@shared/schema";
import { eq, and, inArray, desc, ne, sql, lt } from "drizzle-orm";
import { metricsHandler, incrementHttpRequests } from "./metrics/prometheus";
import { apiRateLimiter, authRateLimiter } from "./middleware/rateLimiter";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Global HTTP metrics tracking
  app.use((req, _res, next) => {
    if (req.path.startsWith("/api")) {
      incrementHttpRequests();
    }
    next();
  });

  // Prometheus telemetry metrics endpoint
  app.get("/api/metrics", metricsHandler);

  // Apply API rate limiting middleware
  app.use("/api/conversations", apiRateLimiter);
  app.use("/api/users", apiRateLimiter);

  // Get all conversations for the current user (Optimized Batch Queries: 0(1) DB roundtrips)
  app.get("/api/conversations", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user!.id;

      // 1. Get all conversations where user is a participant
      const userConversations = await db
        .select({
          conversation: conversations,
          participant: conversationParticipants,
        })
        .from(conversationParticipants)
        .innerJoin(
          conversations,
          eq(conversationParticipants.conversationId, conversations.id)
        )
        .where(eq(conversationParticipants.userId, userId));

      if (userConversations.length === 0) {
        return res.json([]);
      }

      const convIds = userConversations.map((c) => c.conversation.id);

      // 2. Batch fetch ALL participants for ALL user conversations in 1 query
      const allParticipants = await db
        .select({
          conversationId: conversationParticipants.conversationId,
          user: users,
          state: conversationParticipants.state,
        })
        .from(conversationParticipants)
        .innerJoin(users, eq(conversationParticipants.userId, users.id))
        .where(inArray(conversationParticipants.conversationId, convIds));

      // 3. Batch fetch latest messages per conversation
      const allMessages = await db
        .select()
        .from(messages)
        .where(inArray(messages.conversationId, convIds))
        .orderBy(desc(messages.createdAt));

      // Group data in-memory (O(N) CPU operations instead of O(N) DB I/O)
      const participantsByConv = new Map<number, any[]>();
      for (const p of allParticipants) {
        if (!participantsByConv.has(p.conversationId)) {
          participantsByConv.set(p.conversationId, []);
        }
        participantsByConv.get(p.conversationId)!.push({
          id: p.user.id,
          username: p.user.username,
          fullName: p.user.fullName,
          avatar: p.user.avatar,
          gender: p.user.gender,
          state: p.state,
        });
      }

      const lastMessageByConv = new Map<number, any>();
      const unreadByConv = new Map<number, boolean>();

      for (const msg of allMessages) {
        if (!lastMessageByConv.has(msg.conversationId)) {
          lastMessageByConv.set(msg.conversationId, msg);
        }
        if (!msg.read && msg.senderId !== userId) {
          unreadByConv.set(msg.conversationId, true);
        }
      }

      const result = userConversations.map(({ conversation }) => ({
        ...conversation,
        participants: participantsByConv.get(conversation.id) || [],
        lastMessage: lastMessageByConv.get(conversation.id) || null,
        hasUnread: unreadByConv.get(conversation.id) || false,
      }));

      res.json(result);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // Get or create a conversation between two users
  app.post("/api/conversations", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user!.id;
      const { recipientId } = req.body;

      if (!recipientId || recipientId === userId) {
        return res.status(400).json({ message: "Invalid recipient" });
      }

      // Check if conversation already exists
      const existingConversations = await db
        .select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.userId, userId));

      const conversationIds = existingConversations.map(
        (c) => c.conversationId
      );

      if (conversationIds.length > 0) {
        const sharedConversation = await db
          .select({ conversationId: conversationParticipants.conversationId })
          .from(conversationParticipants)
          .where(
            and(
              eq(conversationParticipants.userId, recipientId),
              inArray(conversationParticipants.conversationId, conversationIds)
            )
          )
          .limit(1);

        if (sharedConversation.length > 0) {
          const [conversation] = await db
            .select()
            .from(conversations)
            .where(eq(conversations.id, sharedConversation[0].conversationId));

          return res.json(conversation);
        }
      }

      // Create new conversation
      const [newConversation] = await db
        .insert(conversations)
        .values({ isGroup: false })
        .returning();

      // Add participants
      await db.insert(conversationParticipants).values([
        {
          conversationId: newConversation.id,
          userId: userId,
          state: "accepted",
        },
        {
          conversationId: newConversation.id,
          userId: recipientId,
          state: "pending",
        },
      ]);

      res.json(newConversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  // Accept or reject a new conversation request (for direct chats)
  app.post("/api/conversations/:conversationId/decision", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const conversationId = parseInt(req.params.conversationId);
      const userId = req.user!.id;
      const { accept } = req.body as { accept: boolean };

      // Verify the user is a participant
      const [participant] = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, userId)
          )
        )
        .limit(1);

      if (!participant) {
        return res.status(403).json({ message: "Access denied" });
      }

      const newState = accept ? "accepted" : "blocked";
      await db
        .update(conversationParticipants)
        .set({ state: newState })
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, userId)
          )
        );

      // Find the other participant (the sender of the request) and notify them
      const otherParticipants = await db
        .select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            ne(conversationParticipants.userId, userId)
          )
        );

      // Emit request_decision event to the sender
      const io = (req.app as any).io;
      if (io) {
        for (const p of otherParticipants) {
          io.to(`user:${p.userId}`).emit("request_decision", {
            conversationId,
            fromUserId: userId,
            accepted: accept,
          });
        }
      }

      res.json({
        message: accept ? "Conversation accepted" : "Conversation blocked",
      });
    } catch (error) {
      console.error("Error updating conversation decision:", error);
      res.status(500).json({ message: "Failed to update conversation" });
    }
  });

  // Get messages for a conversation with pagination
  app.get("/api/conversations/:conversationId/messages", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const conversationId = parseInt(req.params.conversationId);
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 50; // Default 50 messages
      const before = req.query.before
        ? parseInt(req.query.before as string)
        : undefined; // Message ID to load before

      // Verify user is part of the conversation
      const [participant] = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, userId)
          )
        );

      if (!participant) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get messages with sender information and pagination
      let query = db
        .select({
          message: messages,
          sender: users,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(
          before
            ? and(
                eq(messages.conversationId, conversationId),
                lt(messages.id, before)
              )
            : eq(messages.conversationId, conversationId)
        )
        .orderBy(desc(messages.createdAt))
        .limit(limit);

      const conversationMessages = await query;

      const formattedMessages = conversationMessages
        .map(({ message, sender }) => ({
          ...message,
          sender: {
            id: sender.id,
            username: sender.username,
            fullName: sender.fullName,
            avatar: sender.avatar,
          },
        }))
        .reverse(); // Reverse to get chronological order

      res.json(formattedMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Get all users (for starting new conversations)
  app.get("/api/users", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user!.id;
      const allUsers = await db
        .select({
          id: users.id,
          username: users.username,
          fullName: users.fullName,
          avatar: users.avatar,
        })
        .from(users)
        .where(ne(users.id, userId));

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get user's public key
  app.get("/api/users/:userId/public-key", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = parseInt(req.params.userId);
      const [user] = await db
        .select({ identityPublicKey: users.identityPublicKey })
        .from(users)
        .where(eq(users.id, userId));

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ publicKey: user.identityPublicKey });
    } catch (error) {
      console.error("Error fetching public key:", error);
      res.status(500).json({ message: "Failed to fetch public key" });
    }
  });

  // Set user's public key (called once after registration)
  app.post("/api/user/public-key", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        console.log("⚠️ Public key upload failed: User not authenticated");
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user!.id;
      const { publicKey } = req.body;

      if (!publicKey) {
        console.log(
          `⚠️ Public key upload failed for user ${userId}: No public key provided`
        );
        return res.status(400).json({ message: "Public key is required" });
      }

      console.log(`📝 Updating public key for user ${userId}...`);

      await db
        .update(users)
        .set({ identityPublicKey: publicKey })
        .where(eq(users.id, userId));

      console.log(`✅ Public key uploaded successfully for user ${userId}`);
      res.json({ message: "Public key set successfully" });
    } catch (error) {
      console.error(
        `❌ Error setting public key for user ${req.user?.id}:`,
        error
      );
      res.status(500).json({ message: "Failed to set public key" });
    }
  });

  // Debug endpoint to check user's public key status
  app.get("/api/user/public-key/status", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user!.id;
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          identityPublicKey: users.identityPublicKey,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      res.json({
        userId: user.id,
        username: user.username,
        hasPublicKey: !!user.identityPublicKey,
        publicKeyLength: user.identityPublicKey?.length || 0,
      });
    } catch (error) {
      console.error("Error checking public key status:", error);
      res.status(500).json({ message: "Failed to check public key status" });
    }
  });

  // Store encrypted key bundle (for cross-device key recovery)
  app.post("/api/user/key-bundle", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user!.id;
      const { publicKey, encryptedSecretKey, salt, iv } = req.body;

      if (!publicKey || !encryptedSecretKey || !salt || !iv) {
        return res
          .status(400)
          .json({ message: "Missing required key bundle fields" });
      }

      console.log(`🔐 Storing encrypted key bundle for user ${userId}...`);

      await db
        .update(users)
        .set({
          identityPublicKey: publicKey,
          encryptedSecretKey,
          keySalt: salt,
          keyIv: iv,
        })
        .where(eq(users.id, userId));

      console.log(`✅ Key bundle stored successfully for user ${userId}`);
      res.json({ message: "Key bundle stored successfully" });
    } catch (error) {
      console.error(
        `❌ Error storing key bundle for user ${req.user?.id}:`,
        error
      );
      res.status(500).json({ message: "Failed to store key bundle" });
    }
  });

  // Get encrypted key bundle (for key recovery on new device)
  app.get("/api/user/key-bundle", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user!.id;
      const [user] = await db
        .select({
          identityPublicKey: users.identityPublicKey,
          encryptedSecretKey: users.encryptedSecretKey,
          keySalt: users.keySalt,
          keyIv: users.keyIv,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user.encryptedSecretKey) {
        return res.status(404).json({
          message: "No key bundle found",
          hasKeyBundle: false,
        });
      }

      res.json({
        hasKeyBundle: true,
        publicKey: user.identityPublicKey,
        encryptedSecretKey: user.encryptedSecretKey,
        salt: user.keySalt,
        iv: user.keyIv,
      });
    } catch (error) {
      console.error("Error retrieving key bundle:", error);
      res.status(500).json({ message: "Failed to retrieve key bundle" });
    }
  });

  // Update user profile
  app.put("/api/user/profile", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user!.id;
      const { username, fullName, email, gender, avatar } = req.body;

      // Check if username is already taken by another user
      if (username && username !== req.user!.username) {
        const [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.username, username));

        if (existingUser) {
          return res.status(400).json({ message: "Username already taken" });
        }
      }

      // Update user profile
      const [updatedUser] = await db
        .update(users)
        .set({
          username: username || req.user!.username,
          fullName,
          email,
          gender,
          avatar,
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          username: users.username,
          fullName: users.fullName,
          email: users.email,
          gender: users.gender,
          avatar: users.avatar,
        });

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  const httpServer = createServer(app);

  // Setup Socket.IO
  const io = new IOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : "*",
      credentials: true,
    },
  });

  // Store io instance on app for use in routes
  (app as any).io = io;

  setupSocket(io);

  return httpServer;
}
