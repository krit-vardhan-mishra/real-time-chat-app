import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";
import dotenv from "dotenv";

dotenv.config();
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });

// Lightweight runtime guard to surface clear errors when DB schema is outdated.
// We don't auto-migrate in code, but we log a helpful message instead of silent 500s.
export async function ensureSchema() {
  try {
    const result = await pool.query(
      `select column_name from information_schema.columns where table_name = 'conversation_participants' and column_name = 'state'`
    );

    if (!result?.rowCount) {
      // eslint-disable-next-line no-console
      console.warn(
        "Database schema is missing conversation_participants.state column. Run 'npm run db:push' locally (or your migration process) to apply the latest schema."
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Schema check failed (non-fatal):", (err as Error).message);
  }
}
