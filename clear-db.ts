import { db } from "./server/db";
import {
  users,
  conversations,
  conversationParticipants,
  messages,
  sessions,
} from "./shared/schema";
import { sql } from "drizzle-orm";

async function clearDatabase() {
  console.log("🗑️ Clearing all data from database...");

  try {
    // Delete in order to respect foreign key constraints
    await db.delete(messages);
    console.log("  ✓ Deleted all messages");

    await db.delete(conversationParticipants);
    console.log("  ✓ Deleted all conversation participants");

    await db.delete(conversations);
    console.log("  ✓ Deleted all conversations");

    await db.delete(sessions);
    console.log("  ✓ Deleted all sessions");

    await db.delete(users);
    console.log("  ✓ Deleted all users");

    console.log("\n✅ All data cleared successfully! Tables are now empty.");
  } catch (error) {
    console.error("❌ Error clearing database:", error);
  }

  process.exit(0);
}

clearDatabase();
