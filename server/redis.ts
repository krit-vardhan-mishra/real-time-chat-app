import { Redis } from "ioredis";
import { createLogger } from "../shared/logger";

const log = createLogger("redis");

const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_DEV_URL;

export let redisClient: Redis | null = null;
export let redisPub: Redis | null = null;
export let redisSub: Redis | null = null;
export let isRedisConnected = false;

// Fallback in-memory presence if Redis is not configured in environment
const localOnlineUsers = new Set<number>();

if (REDIS_URL) {
  try {
    log.info("Initializing Redis connection to cluster/instance...");
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        log.warn(`Redis connection retry #${times} in ${delay}ms`);
        return delay;
      },
    });

    redisPub = redisClient.duplicate();
    redisSub = redisClient.duplicate();

    redisClient.on("connect", () => {
      isRedisConnected = true;
      log.info("⚡ Redis Client connected successfully!");
    });

    redisClient.on("error", (err) => {
      log.error("Redis Client Error:", err.message);
    });
  } catch (err) {
    log.error("Failed to initialize Redis:", (err as Error).message);
  }
} else {
  log.info("REDIS_URL not provided. Running with memory fallback strategy.");
}

/**
 * Presence Engine API (Distributed Redis with Fallback)
 */
export async function setUserOnline(userId: number): Promise<void> {
  if (isRedisConnected && redisClient) {
    await redisClient.sadd("presence:online_users", userId.toString());
    await redisClient.hset("presence:user_last_seen", userId.toString(), Date.now().toString());
  } else {
    localOnlineUsers.add(userId);
  }
}

export async function setUserOffline(userId: number): Promise<void> {
  if (isRedisConnected && redisClient) {
    await redisClient.srem("presence:online_users", userId.toString());
    await redisClient.hset("presence:user_last_seen", userId.toString(), Date.now().toString());
  } else {
    localOnlineUsers.delete(userId);
  }
}

export async function getOnlineUsers(): Promise<number[]> {
  if (isRedisConnected && redisClient) {
    const members = await redisClient.smembers("presence:online_users");
    return members.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
  } else {
    return Array.from(localOnlineUsers);
  }
}

export async function isUserOnline(userId: number): Promise<boolean> {
  if (isRedisConnected && redisClient) {
    return (await redisClient.sismember("presence:online_users", userId.toString())) === 1;
  } else {
    return localOnlineUsers.has(userId);
  }
}
