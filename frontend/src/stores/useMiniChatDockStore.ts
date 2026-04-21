import type { Friend } from "@/types/user";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_DOCK_WINDOWS = 8;
const MAX_EXPANDED_WINDOWS = 2;
const COMPACT_VIEWPORT_MAX_WIDTH = 1279;

const POPPED_HEIGHT_LIMITS = {
  desktop: {
    min: 420,
    max: 820,
    defaultValue: 500,
  },
  compact: {
    min: 340,
    max: 680,
    defaultValue: 460,
  },
} as const;

type PoppedLayoutMode = keyof typeof POPPED_HEIGHT_LIMITS;

const resolvePoppedLayoutMode = (): PoppedLayoutMode => {
  if (typeof globalThis.window === "undefined") {
    return "desktop";
  }

  return globalThis.window.innerWidth <= COMPACT_VIEWPORT_MAX_WIDTH
    ? "compact"
    : "desktop";
};

const clampPoppedHeight = (rawHeight: number, mode: PoppedLayoutMode) => {
  const limits = POPPED_HEIGHT_LIMITS[mode];
  const normalized = Number(rawHeight);

  if (!Number.isFinite(normalized)) {
    return limits.defaultValue;
  }

  return Math.max(limits.min, Math.min(normalized, limits.max));
};

export interface MiniChatDockWindow {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  conversationId: string | null;
  minimized: boolean;
  pinned: boolean;
  poppedOut: boolean;
  unreadCount: number;
  pulseUntil: number;
  poppedHeight: number;
  poppedHeightDesktop: number;
  poppedHeightCompact: number;
  lastActiveAt: number;
  draft: string;
  imagePreview: string | null;
}

interface MiniChatDockState {
  windows: MiniChatDockWindow[];
  focusedWindowId: string | null;
  openWindow: (user: Friend) => void;
  focusWindow: (userId: string) => void;
  focusNextWindow: () => void;
  focusPreviousWindow: () => void;
  closeFocusedWindow: () => void;
  closeLeastPriorityUnpinnedWindow: () => void;
  closeWindow: (userId: string) => void;
  toggleMinimized: (userId: string) => void;
  togglePinned: (userId: string) => void;
  togglePoppedOut: (userId: string) => void;
  setDraft: (userId: string, draft: string) => void;
  setImagePreview: (userId: string, imagePreview: string | null) => void;
  setConversationId: (userId: string, conversationId: string) => void;
  setUnread: (userId: string, unreadCount: number) => void;
  clearUnread: (userId: string) => void;
  setPoppedHeight: (userId: string, height: number) => void;
  reorderWindows: (draggedUserId: string, targetUserId: string) => void;
  minimizeAll: () => void;
}

const resolveNormalizedPoppedHeights = (
  windowItem: Partial<MiniChatDockWindow>,
) => {
  const desktopHeight = clampPoppedHeight(
    Number(windowItem.poppedHeightDesktop ?? windowItem.poppedHeight),
    "desktop",
  );
  const compactHeight = clampPoppedHeight(
    Number(windowItem.poppedHeightCompact ?? windowItem.poppedHeight),
    "compact",
  );

  const layoutMode = resolvePoppedLayoutMode();

  return {
    poppedHeightDesktop: desktopHeight,
    poppedHeightCompact: compactHeight,
    poppedHeight: layoutMode === "compact" ? compactHeight : desktopHeight,
  };
};

const normalizePersistedWindow = (
  rawWindow: unknown,
): MiniChatDockWindow | null => {
  if (!rawWindow || typeof rawWindow !== "object") {
    return null;
  }

  const candidate = rawWindow as Partial<MiniChatDockWindow>;
  const userId = String(candidate.userId || "").trim();
  if (!userId) {
    return null;
  }

  const username = String(candidate.username || "").trim() || userId;
  const displayName =
    String(candidate.displayName || "").trim() || username;
  const normalizedHeights = resolveNormalizedPoppedHeights(candidate);

  return {
    userId,
    username,
    displayName,
    avatarUrl: candidate.avatarUrl,
    conversationId:
      typeof candidate.conversationId === "string" && candidate.conversationId.trim()
        ? candidate.conversationId
        : null,
    minimized: Boolean(candidate.minimized),
    pinned: Boolean(candidate.pinned),
    poppedOut: Boolean(candidate.poppedOut),
    unreadCount: Number.isFinite(candidate.unreadCount)
      ? Math.max(0, Number(candidate.unreadCount))
      : 0,
    pulseUntil: Number.isFinite(candidate.pulseUntil)
      ? Math.max(0, Number(candidate.pulseUntil))
      : 0,
    poppedHeight: normalizedHeights.poppedHeight,
    poppedHeightDesktop: normalizedHeights.poppedHeightDesktop,
    poppedHeightCompact: normalizedHeights.poppedHeightCompact,
    lastActiveAt: Number.isFinite(candidate.lastActiveAt)
      ? Number(candidate.lastActiveAt)
      : 0,
    draft: typeof candidate.draft === "string" ? candidate.draft : "",
    imagePreview:
      typeof candidate.imagePreview === "string" ? candidate.imagePreview : null,
  };
};

const normalizePersistedWindows = (rawWindows: unknown) => {
  if (!Array.isArray(rawWindows)) {
    return [] as MiniChatDockWindow[];
  }

  const deduped = new Map<string, MiniChatDockWindow>();

  rawWindows.forEach((rawWindow) => {
    const normalizedWindow = normalizePersistedWindow(rawWindow);
    if (!normalizedWindow) {
      return;
    }

    const existingWindow = deduped.get(normalizedWindow.userId);
    if (
      !existingWindow ||
      normalizedWindow.lastActiveAt >= existingWindow.lastActiveAt
    ) {
      deduped.set(normalizedWindow.userId, normalizedWindow);
    }
  });

  return Array.from(deduped.values());
};

const sortPinnedFirst = (windows: MiniChatDockWindow[]) => {
  return [...windows].sort((a, b) => Number(b.pinned) - Number(a.pinned));
};

const sortByWindowPriority = (windows: MiniChatDockWindow[]) => {
  return [...windows].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return Number(b.pinned) - Number(a.pinned);
    }

    if (a.poppedOut !== b.poppedOut) {
      return Number(b.poppedOut) - Number(a.poppedOut);
    }

    return (b.lastActiveAt || 0) - (a.lastActiveAt || 0);
  });
};

const trimWindows = (windows: MiniChatDockWindow[]) => {
  if (windows.length <= MAX_DOCK_WINDOWS) {
    return windows;
  }

  const pinnedWindows = sortByWindowPriority(
    windows.filter((windowItem) => windowItem.pinned),
  );
  if (pinnedWindows.length >= MAX_DOCK_WINDOWS) {
    return pinnedWindows.slice(0, MAX_DOCK_WINDOWS);
  }

  const unpinnedWindows = sortByWindowPriority(
    windows.filter((windowItem) => !windowItem.pinned),
  );

  const slotsForUnpinned = MAX_DOCK_WINDOWS - pinnedWindows.length;
  return [...pinnedWindows, ...unpinnedWindows.slice(0, slotsForUnpinned)];
};

const enforceExpandedLimit = (windows: MiniChatDockWindow[]) => {
  const expandedWindows = windows.filter((windowItem) => !windowItem.minimized);
  if (expandedWindows.length <= MAX_EXPANDED_WINDOWS) {
    return windows;
  }

  const keepExpandedIds = new Set(
    sortByWindowPriority(expandedWindows)
      .slice(0, MAX_EXPANDED_WINDOWS)
      .map((windowItem) => windowItem.userId),
  );

  return windows.map((windowItem) => {
    if (windowItem.minimized || keepExpandedIds.has(windowItem.userId)) {
      return windowItem;
    }

    return {
      ...windowItem,
      minimized: true,
    };
  });
};

const applyWindowPolicy = (windows: MiniChatDockWindow[]) => {
  const constrained = enforceExpandedLimit(trimWindows(sortPinnedFirst(windows)));
  return sortPinnedFirst(constrained);
};

const resolveFocusedWindowId = (
  windows: MiniChatDockWindow[],
  preferredUserId: string | null,
) => {
  if (!windows.length) {
    return null;
  }

  if (
    preferredUserId &&
    windows.some((windowItem) => windowItem.userId === preferredUserId)
  ) {
    return preferredUserId;
  }

  const expandedWindow = sortByWindowPriority(
    windows.filter((windowItem) => !windowItem.minimized),
  )[0];
  if (expandedWindow?.userId) {
    return expandedWindow.userId;
  }

  return sortByWindowPriority(windows)[0]?.userId || null;
};

const focusWindowInCollection = (
  windows: MiniChatDockWindow[],
  userId: string,
) => {
  const now = Date.now();
  const nextWindows = windows.map((windowItem) => {
    if (windowItem.userId !== userId) {
      return windowItem;
    }

    const normalizedHeights = resolveNormalizedPoppedHeights(windowItem);
    return {
      ...windowItem,
      ...normalizedHeights,
      minimized: false,
      pulseUntil: 0,
      lastActiveAt: now,
    };
  });

  const constrainedWindows = applyWindowPolicy(nextWindows);

  return {
    windows: constrainedWindows,
    focusedWindowId: resolveFocusedWindowId(constrainedWindows, userId),
  };
};

const cycleWindowFocus = ({
  windows,
  focusedWindowId,
  direction,
}: {
  windows: MiniChatDockWindow[];
  focusedWindowId: string | null;
  direction: "next" | "previous";
}) => {
  const orderedWindows = sortByWindowPriority(windows);
  if (!orderedWindows.length) {
    return {
      windows,
      focusedWindowId: null,
    };
  }

  const currentIndex = orderedWindows.findIndex(
    (windowItem) => windowItem.userId === focusedWindowId,
  );

  const nextIndex =
    currentIndex < 0
      ? 0
      : direction === "next"
        ? (currentIndex + 1) % orderedWindows.length
        : (currentIndex - 1 + orderedWindows.length) % orderedWindows.length;

  const targetUserId = orderedWindows[nextIndex]?.userId;
  if (!targetUserId) {
    return {
      windows,
      focusedWindowId: resolveFocusedWindowId(windows, focusedWindowId),
    };
  }

  return focusWindowInCollection(windows, targetUserId);
};

const createMiniChatWindow = (user: Friend): MiniChatDockWindow => {
  const layoutMode = resolvePoppedLayoutMode();
  const poppedHeightDesktop = POPPED_HEIGHT_LIMITS.desktop.defaultValue;
  const poppedHeightCompact = POPPED_HEIGHT_LIMITS.compact.defaultValue;

  return {
    userId: user._id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    conversationId: null,
    minimized: false,
    pinned: false,
    poppedOut: false,
    unreadCount: 0,
    pulseUntil: 0,
    poppedHeight:
      layoutMode === "compact" ? poppedHeightCompact : poppedHeightDesktop,
    poppedHeightDesktop,
    poppedHeightCompact,
    lastActiveAt: Date.now(),
    draft: "",
    imagePreview: null,
  };
};

export const useMiniChatDockStore = create<MiniChatDockState>()(
  persist(
    (set) => ({
      windows: [],
      focusedWindowId: null,
      openWindow: (user) => {
        set((state) => {
          const existing = state.windows.find((windowItem) => windowItem.userId === user._id);
          if (existing) {
            const nextWindows = state.windows.map((windowItem) => {
              if (windowItem.userId !== user._id) {
                return windowItem;
              }

              const normalizedHeights = resolveNormalizedPoppedHeights(windowItem);

              return {
                ...windowItem,
                ...normalizedHeights,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
              };
            });

            return focusWindowInCollection(nextWindows, user._id);
          }

          const nextWindow = createMiniChatWindow(user);
          const nextWindows = applyWindowPolicy([...state.windows, nextWindow]);

          return {
            windows: nextWindows,
            focusedWindowId: resolveFocusedWindowId(nextWindows, user._id),
          };
        });
      },
      focusWindow: (userId) => {
        set((state) => focusWindowInCollection(state.windows, userId));
      },
      focusNextWindow: () => {
        set((state) =>
          cycleWindowFocus({
            windows: state.windows,
            focusedWindowId: state.focusedWindowId,
            direction: "next",
          }),
        );
      },
      focusPreviousWindow: () => {
        set((state) =>
          cycleWindowFocus({
            windows: state.windows,
            focusedWindowId: state.focusedWindowId,
            direction: "previous",
          }),
        );
      },
      closeFocusedWindow: () => {
        set((state) => {
          const focusedWindowId = state.focusedWindowId;
          if (!focusedWindowId) {
            return state;
          }

          const nextWindows = state.windows.filter(
            (windowItem) => windowItem.userId !== focusedWindowId,
          );

          return {
            windows: nextWindows,
            focusedWindowId: resolveFocusedWindowId(nextWindows, null),
          };
        });
      },
      closeLeastPriorityUnpinnedWindow: () => {
        set((state) => {
          const unpinnedWindows = sortByWindowPriority(
            state.windows.filter((windowItem) => !windowItem.pinned),
          );
          const evictionTarget = unpinnedWindows[unpinnedWindows.length - 1];
          if (!evictionTarget) {
            return state;
          }

          const nextWindows = state.windows.filter(
            (windowItem) => windowItem.userId !== evictionTarget.userId,
          );

          return {
            windows: nextWindows,
            focusedWindowId: resolveFocusedWindowId(
              nextWindows,
              state.focusedWindowId,
            ),
          };
        });
      },
      closeWindow: (userId) => {
        set((state) => ({
          windows: state.windows.filter((windowItem) => windowItem.userId !== userId),
          focusedWindowId: resolveFocusedWindowId(
            state.windows.filter((windowItem) => windowItem.userId !== userId),
            state.focusedWindowId === userId ? null : state.focusedWindowId,
          ),
        }));
      },
      toggleMinimized: (userId) => {
        set((state) => {
          const nextWindows = state.windows.map((windowItem) => {
            if (windowItem.userId !== userId) {
              return windowItem;
            }

            const normalizedHeights = resolveNormalizedPoppedHeights(windowItem);
            const nextMinimized = !windowItem.minimized;

            return {
              ...windowItem,
              ...normalizedHeights,
              minimized: nextMinimized,
              pulseUntil: 0,
              lastActiveAt: nextMinimized ? windowItem.lastActiveAt : Date.now(),
            };
          });

          const constrainedWindows = applyWindowPolicy(nextWindows);

          return {
            windows: constrainedWindows,
            focusedWindowId: resolveFocusedWindowId(
              constrainedWindows,
              state.focusedWindowId === userId
                ? null
                : state.focusedWindowId || userId,
            ),
          };
        });
      },
      togglePinned: (userId) => {
        set((state) => {
          const nextWindows = state.windows.map((windowItem) =>
            windowItem.userId === userId
              ? { ...windowItem, pinned: !windowItem.pinned }
              : windowItem,
          );

          return {
            windows: applyWindowPolicy(nextWindows),
            focusedWindowId: resolveFocusedWindowId(
              applyWindowPolicy(nextWindows),
              state.focusedWindowId,
            ),
          };
        });
      },
      togglePoppedOut: (userId) => {
        set((state) => {
          const nextWindows = state.windows.map((windowItem) =>
            windowItem.userId === userId
              ? {
                  ...windowItem,
                  ...resolveNormalizedPoppedHeights(windowItem),
                  poppedOut: !windowItem.poppedOut,
                  minimized: false,
                  lastActiveAt: Date.now(),
                }
              : windowItem,
          );

          const constrainedWindows = applyWindowPolicy(nextWindows);

          return {
            windows: constrainedWindows,
            focusedWindowId: resolveFocusedWindowId(constrainedWindows, userId),
          };
        });
      },
      setDraft: (userId, draft) => {
        set((state) => ({
          windows: state.windows.map((windowItem) =>
            windowItem.userId === userId ? { ...windowItem, draft } : windowItem,
          ),
        }));
      },
      setImagePreview: (userId, imagePreview) => {
        set((state) => ({
          windows: state.windows.map((windowItem) =>
            windowItem.userId === userId ? { ...windowItem, imagePreview } : windowItem,
          ),
        }));
      },
      setConversationId: (userId, conversationId) => {
        set((state) => ({
          windows: state.windows.map((windowItem) =>
            windowItem.userId === userId ? { ...windowItem, conversationId } : windowItem,
          ),
        }));
      },
      setUnread: (userId, unreadCount) => {
        set((state) => {
          let changed = false;

          const windows = state.windows.map((windowItem) => {
            if (windowItem.userId !== userId) {
              return windowItem;
            }

            if ((windowItem.unreadCount || 0) === unreadCount) {
              return windowItem;
            }

            changed = true;
            const shouldPulse = unreadCount > (windowItem.unreadCount || 0);

            return {
              ...windowItem,
              unreadCount,
              pulseUntil: shouldPulse ? Date.now() + 1600 : windowItem.pulseUntil,
            };
          });

          if (!changed) {
            return state;
          }

          return { windows: applyWindowPolicy(windows) };
        });
      },
      clearUnread: (userId) => {
        set((state) => ({
          windows: state.windows.map((windowItem) =>
            windowItem.userId === userId
              ? { ...windowItem, unreadCount: 0, pulseUntil: 0 }
              : windowItem,
          ),
        }));
      },
      setPoppedHeight: (userId, height) => {
        const layoutMode = resolvePoppedLayoutMode();
        const nextHeight = clampPoppedHeight(height, layoutMode);

        set((state) => ({
          windows: state.windows.map((windowItem) =>
            windowItem.userId === userId
              ? {
                  ...windowItem,
                  poppedHeight: nextHeight,
                  poppedHeightDesktop:
                    layoutMode === "desktop"
                      ? nextHeight
                      : resolveNormalizedPoppedHeights(windowItem).poppedHeightDesktop,
                  poppedHeightCompact:
                    layoutMode === "compact"
                      ? nextHeight
                      : resolveNormalizedPoppedHeights(windowItem).poppedHeightCompact,
                }
              : windowItem,
          ),
        }));
      },
      reorderWindows: (draggedUserId, targetUserId) => {
        if (!draggedUserId || !targetUserId || draggedUserId === targetUserId) {
          return;
        }

        set((state) => {
          const ordered = [...state.windows];
          const draggedIndex = ordered.findIndex((windowItem) => windowItem.userId === draggedUserId);
          const targetIndex = ordered.findIndex((windowItem) => windowItem.userId === targetUserId);

          if (draggedIndex < 0 || targetIndex < 0) {
            return state;
          }

          const [draggedWindow] = ordered.splice(draggedIndex, 1);
          ordered.splice(targetIndex, 0, draggedWindow);

          const constrainedWindows = applyWindowPolicy(ordered);

          return {
            windows: constrainedWindows,
            focusedWindowId: resolveFocusedWindowId(
              constrainedWindows,
              state.focusedWindowId,
            ),
          };
        });
      },
      minimizeAll: () => {
        set((state) => ({
          windows: state.windows.map((windowItem) => ({
            ...windowItem,
            minimized: true,
            pulseUntil: 0,
          })),
          focusedWindowId: null,
        }));
      },
    }),
    {
      name: "mini-chat-dock-storage",
      version: 2,
      partialize: (state) => ({
        focusedWindowId: state.focusedWindowId,
        windows: state.windows.map((windowItem) => ({
          userId: windowItem.userId,
          username: windowItem.username,
          displayName: windowItem.displayName,
          avatarUrl: windowItem.avatarUrl,
          conversationId: windowItem.conversationId,
          minimized: windowItem.minimized,
          pinned: windowItem.pinned,
          poppedOut: windowItem.poppedOut,
          unreadCount: 0,
          pulseUntil: 0,
          poppedHeight: resolveNormalizedPoppedHeights(windowItem).poppedHeight,
          poppedHeightDesktop:
            resolveNormalizedPoppedHeights(windowItem).poppedHeightDesktop,
          poppedHeightCompact:
            resolveNormalizedPoppedHeights(windowItem).poppedHeightCompact,
          lastActiveAt: windowItem.lastActiveAt || 0,
          draft: "",
          imagePreview: null,
        })),
      }),
      merge: (persistedState, currentState) => {
        const typedPersistedState =
          persistedState && typeof persistedState === "object"
            ? (persistedState as Partial<MiniChatDockState>)
            : {};

        const normalizedWindows = applyWindowPolicy(
          normalizePersistedWindows(typedPersistedState.windows),
        );

        const preferredFocusedWindowId =
          typeof typedPersistedState.focusedWindowId === "string" &&
          typedPersistedState.focusedWindowId.trim()
            ? typedPersistedState.focusedWindowId
            : null;

        return {
          ...currentState,
          windows: normalizedWindows,
          focusedWindowId: resolveFocusedWindowId(
            normalizedWindows,
            preferredFocusedWindowId,
          ),
        };
      },
    },
  ),
);
