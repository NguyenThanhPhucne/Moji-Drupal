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

const DEFAULT_TTL_MS = 10 * 60 * 1000;

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

    set((state) => ({
      cache: {
        ...state.cache,
        [key]: {
          preview,
          expiresAt,
        },
      },
    }));
  },

  pruneExpired: () => {
    const now = Date.now();
    set((state) => {
      const next = Object.fromEntries(
        Object.entries(state.cache).filter(([, entry]) => entry.expiresAt > now),
      );

      return { cache: next };
    });
  },
}));
