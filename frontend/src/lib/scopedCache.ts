import type { Conversation } from "@/types/chat";
import type { SocialProfile } from "@/types/social";
import type { ProfileLite } from "@/types/chat";

type CacheNamespace = "conversations" | "profile" | "mediaThumb";

type CacheEntry<TValue> = {
  value: TValue;
  createdAt: number;
  expiresAt: number;
};

const TTL_BY_NAMESPACE_MS: Record<CacheNamespace, number> = {
  conversations: 15_000,
  profile: 60_000,
  mediaThumb: 5 * 60_000,
};

const cacheStore: Record<CacheNamespace, Map<string, CacheEntry<unknown>>> = {
  conversations: new Map(),
  profile: new Map(),
  mediaThumb: new Map(),
};

const normalizeCacheKey = (key: string) => {
  return String(key || "").trim();
};

const getValidCacheEntry = <TValue>(
  namespace: CacheNamespace,
  cacheKey: string,
): CacheEntry<TValue> | null => {
  const normalizedKey = normalizeCacheKey(cacheKey);
  if (!normalizedKey) {
    return null;
  }

  const entry = cacheStore[namespace].get(normalizedKey) as
    | CacheEntry<TValue>
    | undefined;
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cacheStore[namespace].delete(normalizedKey);
    return null;
  }

  return entry;
};

// Persistence helpers (localStorage)
const PERSIST_PREFIX = "moji:cache:v2:";
const PERSIST_VERSION = 2;

type PersistedEntry<T> = {
  version: number;
  namespace: CacheNamespace;
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
  etag?: string | null;
  lastModified?: string | null;
};

const buildPersistKey = (namespace: CacheNamespace, cacheKey: string) =>
  `${PERSIST_PREFIX}${namespace}:${cacheKey}`;

const safeLocalStorageGet = (k: string) => {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
};

const safeLocalStorageSet = (k: string, v: string) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(k, v);
  } catch (e) {
    // ignore
  }
};

const safeLocalStorageRemove = (k: string) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(k);
  } catch (e) {
    // ignore
  }
};

const persistEntry = <T>(namespace: CacheNamespace, cacheKey: string, entry: PersistedEntry<T>) => {
  try {
    const pk = buildPersistKey(namespace, cacheKey);
    safeLocalStorageSet(pk, JSON.stringify(entry));
  } catch (e) {
    // noop
  }
};

const loadPersistedEntry = <T>(namespace: CacheNamespace, cacheKey: string): PersistedEntry<T> | null => {
  try {
    const pk = buildPersistKey(namespace, cacheKey);
    const raw = safeLocalStorageGet(pk);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedEntry<T>;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (e) {
    return null;
  }
};

const removePersistedEntry = (namespace: CacheNamespace, cacheKey: string) => {
  try {
    const pk = buildPersistKey(namespace, cacheKey);
    safeLocalStorageRemove(pk);
  } catch (e) {
    // noop
  }
};

const setCacheEntry = <TValue>(
  namespace: CacheNamespace,
  cacheKey: string,
  value: TValue,
  ttlMs?: number,
) => {
  const normalizedKey = normalizeCacheKey(cacheKey);
  if (!normalizedKey) {
    return;
  }

  const effectiveTtlMs =
    typeof ttlMs === "number" && Number.isFinite(ttlMs) && ttlMs > 0
      ? ttlMs
      : TTL_BY_NAMESPACE_MS[namespace];

  const now = Date.now();

  cacheStore[namespace].set(normalizedKey, {
    value,
    createdAt: now,
    expiresAt: now + effectiveTtlMs,
  });

  // persist to localStorage (basic persistence without meta)
  try {
    const persisted: PersistedEntry<TValue> = {
      version: PERSIST_VERSION,
      namespace,
      key: normalizedKey,
      value,
      createdAt: now,
      expiresAt: now + effectiveTtlMs,
    };
    persistEntry(namespace, normalizedKey, persisted);
  } catch (e) {
    // ignore
  }
};

const invalidateCacheEntry = (namespace: CacheNamespace, cacheKey: string) => {
  const normalizedKey = normalizeCacheKey(cacheKey);
  if (!normalizedKey) {
    return;
  }

  cacheStore[namespace].delete(normalizedKey);
  removePersistedEntry(namespace, normalizedKey);
};

const invalidateCachePrefix = (namespace: CacheNamespace, prefix: string) => {
  const normalizedPrefix = normalizeCacheKey(prefix);
  if (!normalizedPrefix) {
    return;
  }

  cacheStore[namespace].forEach((_, cacheKey) => {
    if (cacheKey.startsWith(normalizedPrefix)) {
      cacheStore[namespace].delete(cacheKey);
    }
  });

  // Also drop persisted keys with prefix
  try {
    if (typeof localStorage !== "undefined") {
      const prefixKey = `${PERSIST_PREFIX}${namespace}:${normalizedPrefix}`;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || "";
        if (key.startsWith(prefixKey)) {
          safeLocalStorageRemove(key);
        }
      }
    }
  } catch (e) {
    // ignore
  }
};

const clearNamespace = (namespace: CacheNamespace) => {
  cacheStore[namespace].clear();
};

const buildConversationKey = (userId: string) => `conversation-list:${userId}`;
const buildProfileKey = (userId: string) => `profile:${userId}`;
const buildProfileLiteKey = (userId: string) => `profile-lite:${userId}`;
const buildMediaThumbKey = (mediaUrl: string) => `thumb:${mediaUrl}`;

export const getCachedConversationList = (userId: string) => {
  const entry = getValidCacheEntry<Conversation[]>(
    "conversations",
    buildConversationKey(userId),
  );

  if (entry) {
    return entry.value || null;
  }

  // Try loading from persisted localStorage and rehydrate in-memory cache
  try {
    const persist = loadPersistedEntry<Conversation[]>("conversations", buildConversationKey(userId));
    if (!persist) return null;
    if (persist.expiresAt <= Date.now()) {
      removePersistedEntry("conversations", buildConversationKey(userId));
      return null;
    }

    // rehydrate memory
    cacheStore.conversations.set(buildConversationKey(userId), {
      value: persist.value,
      createdAt: persist.createdAt,
      expiresAt: persist.expiresAt,
    });

    return persist.value || null;
  } catch (e) {
    return null;
  }
};

export const setCachedConversationList = (
  userId: string,
  conversations: Conversation[],
  meta?: { etag?: string | null; lastModified?: string | null; ttlMs?: number },
) => {
  setCacheEntry("conversations", buildConversationKey(userId), conversations, meta?.ttlMs);
  // update persisted meta if provided
  try {
    if (meta && (meta.etag || meta.lastModified)) {
      const pk = buildConversationKey(userId);
      const persisted = loadPersistedEntry<Conversation[]>("conversations", pk) || null;
      const now = Date.now();
      const expiresAt = (persisted?.expiresAt && persisted.expiresAt > now)
        ? persisted.expiresAt
        : (now + (meta.ttlMs || TTL_BY_NAMESPACE_MS.conversations));
      const toPersist: PersistedEntry<Conversation[]> = {
        version: PERSIST_VERSION,
        namespace: "conversations",
        key: pk,
        value: conversations,
        createdAt: now,
        expiresAt,
        etag: meta.etag || null,
        lastModified: meta.lastModified || null,
      };
      persistEntry("conversations", pk, toPersist);
    }
  } catch (e) {
    // ignore
  }
};

export const invalidateCachedConversationList = (userId: string) => {
  invalidateCacheEntry("conversations", buildConversationKey(userId));
};

export const getCachedProfile = (userId: string) => {
  const entry = getValidCacheEntry<SocialProfile>("profile", buildProfileKey(userId));
  if (entry) return entry.value || null;

  try {
    const persist = loadPersistedEntry<SocialProfile>("profile", buildProfileKey(userId));
    if (!persist) return null;
    if (persist.expiresAt <= Date.now()) {
      removePersistedEntry("profile", buildProfileKey(userId));
      return null;
    }

    cacheStore.profile.set(buildProfileKey(userId), {
      value: persist.value,
      createdAt: persist.createdAt,
      expiresAt: persist.expiresAt,
    });

    return persist.value || null;
  } catch (e) {
    return null;
  }
};

export const setCachedProfile = (userId: string, profile: SocialProfile) => {
  setCacheEntry("profile", buildProfileKey(userId), profile);
};

export const setCachedProfileWithMeta = (
  userId: string,
  profile: SocialProfile,
  meta?: { etag?: string | null; lastModified?: string | null; ttlMs?: number },
) => {
  setCacheEntry("profile", buildProfileKey(userId), profile, meta?.ttlMs);
  try {
    if (meta && (meta.etag || meta.lastModified)) {
      const pk = buildProfileKey(userId);
      const persisted = loadPersistedEntry<SocialProfile>("profile", pk) || null;
      const now = Date.now();
      const expiresAt = (persisted?.expiresAt && persisted.expiresAt > now)
        ? persisted.expiresAt
        : (now + (meta.ttlMs || TTL_BY_NAMESPACE_MS.profile));
      const toPersist: PersistedEntry<SocialProfile> = {
        version: PERSIST_VERSION,
        namespace: "profile",
        key: pk,
        value: profile,
        createdAt: now,
        expiresAt,
        etag: meta.etag || null,
        lastModified: meta.lastModified || null,
      };
      persistEntry("profile", pk, toPersist);
    }
  } catch (e) {
    // ignore
  }
};

export const invalidateCachedProfile = (userId: string) => {
  invalidateCacheEntry("profile", buildProfileKey(userId));
};

export const getCachedProfileLite = (userId: string) => {
  const entry = getValidCacheEntry<ProfileLite>("profile", buildProfileLiteKey(userId));
  if (entry) return entry.value || null;

  try {
    const persist = loadPersistedEntry<ProfileLite>("profile", buildProfileLiteKey(userId));
    if (!persist) return null;
    if (persist.expiresAt <= Date.now()) {
      removePersistedEntry("profile", buildProfileLiteKey(userId));
      return null;
    }

    cacheStore.profile.set(buildProfileLiteKey(userId), {
      value: persist.value,
      createdAt: persist.createdAt,
      expiresAt: persist.expiresAt,
    });

    return persist.value || null;
  } catch (e) {
    return null;
  }
};

export const setCachedProfileLite = (userId: string, profile: ProfileLite) => {
  setCacheEntry("profile", buildProfileLiteKey(userId), profile);
};

export const invalidateCachedProfileLite = (userId: string) => {
  invalidateCacheEntry("profile", buildProfileLiteKey(userId));
};

export const getCachedMediaThumb = (mediaUrl: string) => {
  const entry = getValidCacheEntry<string>("mediaThumb", buildMediaThumbKey(mediaUrl));
  if (entry) return entry.value || null;

  try {
    const persist = loadPersistedEntry<string>("mediaThumb", buildMediaThumbKey(mediaUrl));
    if (!persist) return null;
    if (persist.expiresAt <= Date.now()) {
      removePersistedEntry("mediaThumb", buildMediaThumbKey(mediaUrl));
      return null;
    }

    cacheStore.mediaThumb.set(buildMediaThumbKey(mediaUrl), {
      value: persist.value,
      createdAt: persist.createdAt,
      expiresAt: persist.expiresAt,
    });

    return persist.value || null;
  } catch (e) {
    return null;
  }
};

export const setCachedMediaThumb = (mediaUrl: string, thumbnailUrl: string) => {
  setCacheEntry("mediaThumb", buildMediaThumbKey(mediaUrl), thumbnailUrl);
};

export const invalidateCachedMediaThumb = (mediaUrl: string) => {
  invalidateCacheEntry("mediaThumb", buildMediaThumbKey(mediaUrl));
};

export const getPersistedConversationMeta = (userId: string) => {
  try {
    const pk = buildConversationKey(userId);
    const persisted = loadPersistedEntry<Conversation[]>("conversations", pk);
    if (!persisted) return null;
    return {
      etag: persisted.etag || null,
      lastModified: persisted.lastModified || null,
      expiresAt: persisted.expiresAt,
    };
  } catch (e) {
    return null;
  }
};

export const getPersistedProfileMeta = (userId: string) => {
  try {
    const pk = buildProfileKey(userId);
    const persisted = loadPersistedEntry<SocialProfile>("profile", pk);
    if (!persisted) return null;
    return {
      etag: persisted.etag || null,
      lastModified: persisted.lastModified || null,
      expiresAt: persisted.expiresAt,
    };
  } catch (e) {
    return null;
  }
};

export const invalidateAllCachedProfiles = () => {
  invalidateCachePrefix("profile", "profile:");
  invalidateCachePrefix("profile", "profile-lite:");
};

export const clearRealtimeScopedCaches = () => {
  clearNamespace("conversations");
};
