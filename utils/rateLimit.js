const { getRedisConnection, isRedisConfigured } = require('../config/redis');

// Fallback in-memory buckets when REDIS_URL is unset (local only)
const memoryBuckets = new Map();

function pruneMemory(key, windowMs) {
  const now = Date.now();
  const arr = (memoryBuckets.get(key) || []).filter((t) => now - t < windowMs);
  memoryBuckets.set(key, arr);
  return arr;
}

function hitMemory(key, limit, windowMs) {
  const arr = pruneMemory(key, windowMs);
  if (arr.length >= limit) return { allowed: false, remaining: 0 };
  arr.push(Date.now());
  memoryBuckets.set(key, arr);
  return { allowed: true, remaining: limit - arr.length };
}

/**
 * Sliding-window rate limit. Uses Redis when available (multi-instance safe).
 * @returns {Promise<{ allowed: boolean, remaining: number }>}
 */
async function hit(key, limit, windowMs) {
  if (!isRedisConfigured()) {
    return hitMemory(key, limit, windowMs);
  }

  const redis = getRedisConnection();
  if (!redis) return hitMemory(key, limit, windowMs);

  const redisKey = `rl:${key}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  const multi = redis.multi();
  multi.zremrangebyscore(redisKey, 0, windowStart);
  multi.zadd(redisKey, now, `${now}:${Math.random()}`);
  multi.zcard(redisKey);
  multi.pexpire(redisKey, windowMs);
  const results = await multi.exec();

  const count = results?.[2]?.[1] ?? 0;
  if (count > limit) {
    // Remove the entry we just added so we don't inflate the bucket
    await redis.zremrangebyscore(redisKey, now, now);
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: Math.max(0, limit - count) };
}

module.exports = { hit };
