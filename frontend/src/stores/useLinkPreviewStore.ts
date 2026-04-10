import { create } from "zustand";
import type { LinkPreviewPayload } from "@/services/chatService";

interface LinkPreviewEntry {
  preview: LinkPreviewPayload;
  expiresAt: number;
}

interface LinkPreviewState {
  cache: Record<string, LinkPreviewEntry>;
  getPreview: (url: string) => LinkPreviewPayload | null;
  setPreview: (url: string, preview: LinkPreviewPayload, ttlMs?: number) => void;
  pruneExpired: () => void;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 200; // max unique URLs to keep in memory

const normalizeUrlKey = (url: string) => String(url || "").trim();

export const useLinkPreviewStore = create<LinkPreviewState>((set, get) => ({
  cache: {},

  getPreview: (url) => {
    const key = normalizeUrlKey(url);
    if (!key) {
      return null;
    }

    const entry = get().cache[key];
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      set((state) => {
        const next = { ...state.cache };
        delete next[key];
        return { cache: next };
      });
      return null;
    }

    return entry.preview;
  },

  setPreview: (url, preview, ttlMs = DEFAULT_TTL_MS) => {
    const key = normalizeUrlKey(url);
    if (!key) {
      return;
    }

    const expiresAt = Date.now() + Math.max(1000, ttlMs);

    set((state) => {
      const next = { ...state.cache, [key]: { preview, expiresAt } };

      // LRU-lite eviction: if over cap, remove the soonest-expiring entries first
      const entries = Object.entries(next);
      if (entries.length > MAX_CACHE_SIZE) {
        entries.sort(([, a], [, b]) => a.expiresAt - b.expiresAt);
        const pruned = Object.fromEntries(entries.slice(entries.length - MAX_CACHE_SIZE));
        return { cache: pruned };
      }

      return { cache: next };
    });
  },

  pruneExpired: () => {
    const now = Date.now();
    set((state) => {
      const next = Object.fromEntries(
        Object.entries(state.cache).filter(([, entry]) => entry.expiresAt > now),
      );

      // Only trigger re-render if something actually changed
      if (Object.keys(next).length === Object.keys(state.cache).length) {
        return state;
      }

      return { cache: next };
    });
  },
}));

// Auto-prune every 5 minutes to reclaim memory without waiting for cache hits
if (typeof globalThis.setInterval === "function") {
  globalThis.setInterval(() => {
    useLinkPreviewStore.getState().pruneExpired();
  }, 5 * 60 * 1000);
}

