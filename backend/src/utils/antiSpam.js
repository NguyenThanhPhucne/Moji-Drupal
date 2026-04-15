const RATE_LIMIT_RULES = {
  "auth:signup": {
    profile: "auth",
    windowMs: 60 * 1000,
    maxEvents: 6,
  },
  "auth:signin": {
    profile: "auth",
    windowMs: 60 * 1000,
    maxEvents: 10,
  },
  "auth:google": {
    profile: "auth",
    windowMs: 60 * 1000,
    maxEvents: 12,
  },
  "auth:drupal-sso": {
    profile: "auth",
    windowMs: 60 * 1000,
    maxEvents: 16,
  },
  "auth:refresh": {
    profile: "auth",
    windowMs: 60 * 1000,
    maxEvents: 40,
  },
  "message:direct": {
    profile: "chat",
    windowMs: 12 * 1000,
    maxEvents: 8,
  },
  "message:group": {
    profile: "chat",
    windowMs: 10 * 1000,
    maxEvents: 10,
  },
  "chat:link-preview": {
    profile: "chat",
    windowMs: 30 * 1000,
    maxEvents: 20,
  },
  "chat:join-link": {
    profile: "chat",
    windowMs: 30 * 1000,
    maxEvents: 12,
  },
  "social:post": {
    profile: "social",
    windowMs: 60 * 1000,
    maxEvents: 4,
  },
  "social:comment": {
    profile: "social",
    windowMs: 20 * 1000,
    maxEvents: 8,
  },
  "social:reaction": {
    profile: "social",
    windowMs: 10 * 1000,
    maxEvents: 16,
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
  const normalizedScope = String(scope || "");
  const rule = RATE_LIMIT_RULES[normalizedScope];
  const profile = rule?.profile || "none";

  if (!rule) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Infinity,
      limit: Infinity,
      windowMs: 0,
      scope: normalizedScope,
      profile,
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
      limit: rule.maxEvents,
      windowMs: rule.windowMs,
      scope: normalizedScope,
      profile,
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
    limit: rule.maxEvents,
    windowMs: rule.windowMs,
    scope: normalizedScope,
    profile,
  };
};

export const applyRateLimitHeaders = (res, rateLimitResult) => {
  if (!res || !rateLimitResult) {
    return;
  }

  const scope = String(rateLimitResult.scope || "").trim();
  const profile = String(rateLimitResult.profile || "").trim();
  const remaining = Number(rateLimitResult.remaining);
  const limit = Number(rateLimitResult.limit);
  const retryAfterSeconds = Number(rateLimitResult.retryAfterSeconds);
  const windowMs = Number(rateLimitResult.windowMs);

  if (scope) {
    res.set("X-RateLimit-Scope", scope);
  }

  if (profile && profile !== "none") {
    res.set("X-RateLimit-Profile", profile);
  }

  if (Number.isFinite(limit)) {
    res.set("X-RateLimit-Limit", String(Math.max(0, Math.floor(limit))));
  }

  if (Number.isFinite(remaining)) {
    res.set(
      "X-RateLimit-Remaining",
      String(Math.max(0, Math.floor(remaining))),
    );
  }

  if (Number.isFinite(windowMs) && windowMs > 0) {
    res.set(
      "X-RateLimit-Window-Seconds",
      String(Math.max(1, Math.ceil(windowMs / 1000))),
    );
  }

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    res.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterSeconds))));
  }
};
