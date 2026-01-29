import { create } from "zustand";
import type { FriendRequest } from "@/types/user";

interface NotificationState {
  // Dữ liệu
  unreadFriendRequestCount: number;
  pendingRequests: FriendRequest[]; // Requests mới chưa được xem

  // Actions
  setUnreadCount: (count: number) => void;
  incrementUnreadCount: () => void;
  decrementUnreadCount: () => void;
  resetUnreadCount: () => void;
  addPendingRequest: (request: FriendRequest) => void;
  removePendingRequest: (requestId: string) => void;
  clearPendingRequests: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadFriendRequestCount: 0,
  pendingRequests: [],

  setUnreadCount: (count) => set({ unreadFriendRequestCount: count }),

  incrementUnreadCount: () =>
    set((state) => ({
      unreadFriendRequestCount: state.unreadFriendRequestCount + 1,
    })),

  decrementUnreadCount: () =>
    set((state) => ({
      unreadFriendRequestCount: Math.max(state.unreadFriendRequestCount - 1, 0),
    })),

  resetUnreadCount: () => set({ unreadFriendRequestCount: 0 }),

  addPendingRequest: (request) =>
    set((state) => ({
      pendingRequests: [request, ...state.pendingRequests],
      unreadFriendRequestCount: state.unreadFriendRequestCount + 1,
    })),

  removePendingRequest: (requestId) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.filter((r) => r._id !== requestId),
    })),

  clearPendingRequests: () => set({ pendingRequests: [] }),
}));
