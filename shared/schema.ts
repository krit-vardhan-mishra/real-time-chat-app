import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  boolean,
  json,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name"),
  email: text("email"),
  avatar: text("avatar"),
  gender: text("gender"), // 'male', 'female', or 'other'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  identityPublicKey: text("identity_public_key"),
  // Encrypted key recovery: secret key encrypted with user's recovery PIN
  encryptedSecretKey: text("encrypted_secret_key"), // AES-GCM encrypted
  keySalt: text("key_salt"), // PBKDF2 salt (base64)
  keyIv: text("key_iv"), // AES-GCM IV (base64)
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  identityPublicKey: true, // Set via API
  encryptedSecretKey: true, // Set via key-bundle API
  keySalt: true,
  keyIv: true,
});

export const selectUserSchema = createSelectSchema(users);

// Conversations table
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  name: text("name"), // For group chats
  isGroup: boolean("is_group").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export const selectConversationSchema = createSelectSchema(conversations);

// Conversation participants table
export const conversationParticipants = pgTable("conversation_participants", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Conversation state from this participant's perspective:
  // 'accepted' -> normal chat
  // 'pending'  -> awaiting this participant's approval to continue
  // 'blocked'  -> this participant rejected; other cannot send further messages
  state: text("state").notNull().default("accepted"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const insertConversationParticipantSchema = createInsertSchema(
  conversationParticipants
).omit({
  id: true,
  joinedAt: true,
});

export const selectConversationParticipantSchema = createSelectSchema(
  conversationParticipants
);

// Messages table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  senderId: integer("sender_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  delivered: boolean("delivered").default(false).notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const selectMessageSchema = createSelectSchema(messages);

// Session table for connect-pg-simple
export const sessions = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  })
);

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type ConversationParticipant =
  typeof conversationParticipants.$inferSelect;
export type InsertConversationParticipant = z.infer<
  typeof insertConversationParticipantSchema
>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
