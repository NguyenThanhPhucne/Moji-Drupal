import type { Friend } from "@/types/user";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_DOCK_WINDOWS = 4;
const DEFAULT_POPPED_HEIGHT = 500;

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
  draft: string;
  imagePreview: string | null;
}

interface MiniChatDockState {
  windows: MiniChatDockWindow[];
  openWindow: (user: Friend) => void;
  focusWindow: (userId: string) => void;
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

const sortPinnedFirst = (windows: MiniChatDockWindow[]) => {
  return [...windows].sort((a, b) => Number(b.pinned) - Number(a.pinned));
};

const trimWindows = (windows: MiniChatDockWindow[]) => {
  if (windows.length <= MAX_DOCK_WINDOWS) {
    return windows;
  }

  const pinnedWindows = windows.filter((windowItem) => windowItem.pinned);
  const unpinnedWindows = windows.filter((windowItem) => !windowItem.pinned);

  if (pinnedWindows.length >= MAX_DOCK_WINDOWS) {
    return pinnedWindows.slice(0, MAX_DOCK_WINDOWS);
  }

  const allowedUnpinned = MAX_DOCK_WINDOWS - pinnedWindows.length;
  return [...pinnedWindows, ...unpinnedWindows.slice(unpinnedWindows.length - allowedUnpinned)];
};

export const useMiniChatDockStore = create<MiniChatDockState>()(
  persist(
    (set) => ({
      windows: [],
      openWindow: (user) => {
        set((state) => {
          const existing = state.windows.find((windowItem) => windowItem.userId === user._id);
          if (existing) {
            return {
              windows: state.windows.map((windowItem) =>
                windowItem.userId === user._id
                  ? {
                      ...windowItem,
                      username: user.username,
                      displayName: user.displayName,
                      avatarUrl: user.avatarUrl,
                      minimized: false,
                    }
                  : windowItem,
              ),
            };
          }

          const nextWindow: MiniChatDockWindow = {
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
            poppedHeight: DEFAULT_POPPED_HEIGHT,
            draft: "",
            imagePreview: null,
          };

          const nextWindows = trimWindows(sortPinnedFirst([...state.windows, nextWindow]));
          return { windows: nextWindows };
        });
      },
      focusWindow: (userId) => {
        set((state) => ({
          windows: state.windows.map((windowItem) =>
            windowItem.userId === userId
              ? { ...windowItem, minimized: false, pulseUntil: 0 }
              : windowItem,
          ),
        }));
      },
      closeWindow: (userId) => {
        set((state) => ({
          windows: state.windows.filter((windowItem) => windowItem.userId !== userId),
        }));
      },
      toggleMinimized: (userId) => {
        set((state) => ({
          windows: state.windows.map((windowItem) =>
            windowItem.userId === userId
              ? {
                  ...windowItem,
                  minimized: !windowItem.minimized,
                  pulseUntil: 0,
                }
              : windowItem,
          ),
        }));
      },
      togglePinned: (userId) => {
        set((state) => ({
          windows: sortPinnedFirst(
            state.windows.map((windowItem) =>
              windowItem.userId === userId
                ? { ...windowItem, pinned: !windowItem.pinned }
                : windowItem,
            ),
          ),
        }));
      },
      togglePoppedOut: (userId) => {
        set((state) => ({
          windows: state.windows.map((windowItem) =>
            windowItem.userId === userId
              ? { ...windowItem, poppedOut: !windowItem.poppedOut, minimized: false }
              : windowItem,
          ),
        }));
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

          return { windows };
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
        const nextHeight = Math.max(420, Math.min(height, 820));
        set((state) => ({
          windows: state.windows.map((windowItem) =>
            windowItem.userId === userId
              ? { ...windowItem, poppedHeight: nextHeight }
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

          return { windows: ordered };
        });
      },
      minimizeAll: () => {
        set((state) => ({
          windows: state.windows.map((windowItem) => ({
            ...windowItem,
            minimized: true,
            pulseUntil: 0,
          })),
        }));
      },
    }),
    {
      name: "mini-chat-dock-storage",
      partialize: (state) => ({
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
          poppedHeight: windowItem.poppedHeight || DEFAULT_POPPED_HEIGHT,
          draft: "",
          imagePreview: null,
        })),
      }),
    },
  ),
);
