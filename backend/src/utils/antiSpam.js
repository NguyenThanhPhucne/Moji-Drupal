const RATE_LIMIT_RULES = {
  "message:direct": {
    windowMs: 12 * 1000,
    maxEvents: 8,
  },
  "message:group": {
    windowMs: 10 * 1000,
    maxEvents: 10,
  },
  "social:post": {
    windowMs: 60 * 1000,
    maxEvents: 4,
  },
  "social:comment": {
    windowMs: 20 * 1000,
    maxEvents: 8,
  },
};

const bucketByKey = new Map();

const toBucketKey = ({ userId, scope, conversationId, postId }) => {
  const normalizedUserId = String(userId || "").trim();
  const normalizedScope = String(scope || "").trim();
  const normalizedConversationId = String(conversationId || "").trim();
  const normalizedPostId = String(postId || "").trim();

  return [normalizedUserId, normalizedScope, normalizedConversationId, normalizedPostId]
    .filter(Boolean)
    .join(":");
};

const trimExpiredEvents = (timestamps, now, windowMs) => {
  return timestamps.filter((timestamp) => now - timestamp < windowMs);
};

const sweepStaleBuckets = (now) => {
  bucketByKey.forEach((bucket, bucketKey) => {
    const trimmed = trimExpiredEvents(
      bucket.timestamps,
      now,
      bucket.windowMs,
    );

    if (trimmed.length === 0) {
      bucketByKey.delete(bucketKey);
      return;
    }

    bucket.timestamps = trimmed;
  });
};

let lastSweepAt = 0;

export const registerRateLimitHit = ({
  userId,
  scope,
  conversationId,
  postId,
}) => {
  const rule = RATE_LIMIT_RULES[String(scope || "")];

  if (!rule) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Infinity,
    };
  }

  const now = Date.now();

  // Bound in-memory growth by sweeping stale buckets every ~30 seconds.
  if (now - lastSweepAt > 30 * 1000) {
    sweepStaleBuckets(now);
    lastSweepAt = now;
  }

  const bucketKey = toBucketKey({ userId, scope, conversationId, postId });
  const existingBucket = bucketByKey.get(bucketKey) || {
    windowMs: rule.windowMs,
    maxEvents: rule.maxEvents,
    timestamps: [],
  };

  const activeTimestamps = trimExpiredEvents(
    existingBucket.timestamps,
    now,
    rule.windowMs,
  );

  if (activeTimestamps.length >= rule.maxEvents) {
    const oldestTimestamp = activeTimestamps[0] || now;
    const retryAfterMs = Math.max(0, rule.windowMs - (now - oldestTimestamp));

    bucketByKey.set(bucketKey, {
      ...existingBucket,
      windowMs: rule.windowMs,
      maxEvents: rule.maxEvents,
      timestamps: activeTimestamps,
    });

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      remaining: 0,
    };
  }

  const nextTimestamps = [...activeTimestamps, now];
  bucketByKey.set(bucketKey, {
    ...existingBucket,
    windowMs: rule.windowMs,
    maxEvents: rule.maxEvents,
    timestamps: nextTimestamps,
  });

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, rule.maxEvents - nextTimestamps.length),
  };
};
