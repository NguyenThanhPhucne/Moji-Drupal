import Redis from "ioredis";

// Use REDIS_URL if provided, else default to localhost
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Ensure gracefully failing if Redis is not available
export const redisClient = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,      // Don't queue commands indefinitely if connecting fails
  retryStrategy: (times) => {
    // Retry up to 3 times, then stop retrying to avoid spamming the console
    if (times > 3) {
      console.warn("[Redis] Maximum retries reached. Running without cache (Fail-safe mode).");
      return null;
    }
    return Math.min(times * 100, 3000); // Retry after 100ms, 200ms, 300ms...
  },
});

let isRedisConnected = false;

redisClient.on("connect", () => {
  isRedisConnected = true;
  console.log("[Redis] Connected successfully to Redis server.");
});

redisClient.on("error", (err) => {
  isRedisConnected = false;
  // Reduce spam in logs if redis is consistently dead
});

redisClient.on("close", () => {
  isRedisConnected = false;
});

// Utility to attempt first connection automatically when imported
redisClient.connect().catch((err) => {
  console.warn(`[Redis] Initial connection failed: ${err.message}. Cache is disabled.`);
});

/**
 * Get data from cache. Gracefully fails and returns null if Redis is offline.
 * @param {string} key 
 * @returns {Promise<any | null>} Parsed JSON or null
 */
export const getCachedData = async (key) => {
  if (!isRedisConnected) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.warn(`[Redis] Error getting cache for key ${key}`, error);
    return null;
  }
};

/**
 * Set data to cache. Gracefully fails if Redis is offline.
 * @param {string} key 
 * @param {any} value 
 * @param {number} expInSeconds 
 */
export const setCachedData = async (key, value, expInSeconds = 3600) => {
  if (!isRedisConnected) return;
  try {
    const stringValue = JSON.stringify(value);
    await redisClient.setex(key, expInSeconds, stringValue);
  } catch (error) {
    console.warn(`[Redis] Error setting cache for key ${key}`, error);
  }
};

/**
 * Invalidate specific key(s) or patterns.
 * @param {string} pattern - Key pattern (e.g., 'conversations:userId' or 'feed:*')
 */
export const invalidateCache = async (pattern) => {
  if (!isRedisConnected) return;
  try {
    if (pattern.includes("*")) {
      // Find keys via SCAN or KEYS (KEYS is bad for prod, but using simple clear here)
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } else {
      await redisClient.del(pattern);
    }
  } catch (error) {
    console.warn(`[Redis] Error invalidating cache pattern ${pattern}`, error);
  }
};
