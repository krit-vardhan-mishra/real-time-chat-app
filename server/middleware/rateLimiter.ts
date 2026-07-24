import { type Request, type Response, type NextFunction } from "express";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

/**
 * High-performance sliding window rate limiter middleware.
 * Prevents credential brute-forcing, spam, and DoS attacks.
 */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const { windowMs, max, message = "Too many requests, please try again later." } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-ip";
    const key = `${req.path}:${Array.isArray(ip) ? ip[0] : ip}`;
    const now = Date.now();

    const record = memoryStore.get(key);

    if (!record || now > record.resetAt) {
      memoryStore.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return next();
    }

    record.count++;

    if (record.count > max) {
      const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfterSeconds.toString());
      return res.status(429).json({ message, retryAfterSeconds });
    }

    next();
  };
}

// Pre-configured rate limiters
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // max 15 requests/min for login/register
  message: "Too many authentication attempts. Please try again after 1 minute.",
});

export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 180, // max 180 API requests/min
  message: "API rate limit exceeded. Please slow down your requests.",
});
