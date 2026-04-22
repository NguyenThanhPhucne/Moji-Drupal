export type VoiceMemoOutboxScope = "direct" | "group";

export interface VoiceMemoOutboxItem {
  id: string;
  userId: string;
  scope: VoiceMemoOutboxScope;
  conversationId: string;
  recipientId?: string;
  groupChannelId?: string;
  content: string;
  imgUrl?: string;
  audioDataUrl: string;
  replyToId?: string;
  threadRootId?: string;
  queuedAt: string;
  attemptCount: number;
  lastError?: string | null;
  nextRetryAt?: string | null;
}

export const MAX_VOICE_MEMO_OUTBOX_BYTES = 8 * 1024 * 1024;
export const MAX_VOICE_MEMO_OUTBOX_ATTEMPTS = 8;
const MAX_VOICE_MEMO_OUTBOX_BASE64_CHARS = Math.ceil(
  (MAX_VOICE_MEMO_OUTBOX_BYTES * 4) / 3,
);
const BASE_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

const DB_NAME = "moji-voice-memo-outbox-v1";
const DB_VERSION = 1;
const STORE_NAME = "voice-memo-items";
const USER_ID_INDEX = "by-user-id";

let dbPromise: Promise<IDBDatabase> | null = null;
const memoryFallback = new Map<string, VoiceMemoOutboxItem>();

const hasIndexedDb = () => {
  return typeof globalThis !== "undefined" && "indexedDB" in globalThis;
};

const toError = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
};

const openDatabase = async () => {
  if (!hasIndexedDb()) {
    throw new Error("IndexedDB is unavailable");
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex(USER_ID_INDEX, "userId", { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      reject(toError(request.error, "Failed to open voice memo outbox database"));
    };
  });

  return dbPromise;
};

const waitForTransaction = (tx: IDBTransaction) => {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(toError(tx.error, "Voice memo outbox transaction failed"));
    tx.onabort = () =>
      reject(toError(tx.error, "Voice memo outbox transaction aborted"));
  });
};

const runWithMemoryFallback = async <T>(
  action: () => Promise<T>,
  fallback: () => T,
): Promise<T> => {
  try {
    return await action();
  } catch {
    return fallback();
  }
};

const estimateAudioDataUrlBytes = (audioDataUrl: string) => {
  const payload = String(audioDataUrl || "").split(",")[1] || "";
  const normalizedPayload = payload.replaceAll(/\s+/g, "");

  if (!normalizedPayload) {
    return 0;
  }

  // Base64 expands binary payload by 4/3.
  return Math.floor((normalizedPayload.length * 3) / 4);
};

const validateVoiceMemoOutboxItem = (item: VoiceMemoOutboxItem) => {
  const audioDataUrl = String(item.audioDataUrl || "").trim();
  if (!/^data:audio\//i.test(audioDataUrl)) {
    throw new Error("Voice memo outbox requires a data:audio payload");
  }

  const payload = audioDataUrl.split(",")[1] || "";
  const normalizedPayload = payload.replaceAll(/\s+/g, "");
  if (!normalizedPayload) {
    throw new Error("Voice memo outbox payload is empty");
  }

  if (normalizedPayload.length > MAX_VOICE_MEMO_OUTBOX_BASE64_CHARS) {
    throw new Error("Voice memo payload exceeds outbox size limit");
  }

  const estimatedBytes = estimateAudioDataUrlBytes(audioDataUrl);
  if (!Number.isFinite(estimatedBytes) || estimatedBytes <= 0) {
    throw new Error("Voice memo outbox payload is invalid");
  }

  if (estimatedBytes > MAX_VOICE_MEMO_OUTBOX_BYTES) {
    throw new Error("Voice memo payload exceeds outbox size limit");
  }
};

export const addVoiceMemoOutboxItem = async (item: VoiceMemoOutboxItem) => {
  if (!item.id || !item.userId) {
    throw new Error("Invalid voice memo outbox item");
  }

  validateVoiceMemoOutboxItem(item);

  return runWithMemoryFallback(
    async () => {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(item);
      await waitForTransaction(tx);
    },
    () => {
      memoryFallback.set(item.id, item);
    },
  );
};

export const removeVoiceMemoOutboxItem = async (id: string) => {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    return;
  }

  return runWithMemoryFallback(
    async () => {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(normalizedId);
      await waitForTransaction(tx);
    },
    () => {
      memoryFallback.delete(normalizedId);
    },
  );
};

export const listVoiceMemoOutboxItemsByUser = async (userId: string) => {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return [] as VoiceMemoOutboxItem[];
  }

  return runWithMemoryFallback(
    async () => {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index(USER_ID_INDEX);
      const request = index.getAll(normalizedUserId);

      const items = await new Promise<VoiceMemoOutboxItem[]>((resolve, reject) => {
        request.onsuccess = () => {
          resolve((request.result || []) as VoiceMemoOutboxItem[]);
        };
        request.onerror = () => {
          reject(
            toError(
              request.error,
              "Failed to list queued voice memos from outbox",
            ),
          );
        };
      });

      await waitForTransaction(tx);

      return items.sort(
        (left, right) =>
          new Date(left.queuedAt).getTime() - new Date(right.queuedAt).getTime(),
      );
    },
    () => {
      return [...memoryFallback.values()]
        .filter((item) => item.userId === normalizedUserId)
        .sort(
          (left, right) =>
            new Date(left.queuedAt).getTime() - new Date(right.queuedAt).getTime(),
        );
    },
  );
};

export const markVoiceMemoOutboxItemFailed = async ({
  item,
  errorMessage,
}: {
  item: VoiceMemoOutboxItem;
  errorMessage?: string;
}) => {
  const currentAttemptCount = Number(item.attemptCount || 0);
  const nextAttemptCount = currentAttemptCount + 1;
  const cappedBackoffExp = Math.max(0, Math.min(nextAttemptCount - 1, 8));
  const nextRetryDelayMs = Math.min(
    MAX_RETRY_DELAY_MS,
    BASE_RETRY_DELAY_MS * 2 ** cappedBackoffExp,
  );
  const nextRetryAt = new Date(Date.now() + nextRetryDelayMs).toISOString();
  const exhaustedAttempts = nextAttemptCount >= MAX_VOICE_MEMO_OUTBOX_ATTEMPTS;

  await addVoiceMemoOutboxItem({
    ...item,
    attemptCount: nextAttemptCount,
    lastError: String(errorMessage || "Voice memo outbox retry failed"),
    nextRetryAt: exhaustedAttempts ? null : nextRetryAt,
  });
};

export const buildVoiceMemoOutboxId = () => {
  return `vmo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};
