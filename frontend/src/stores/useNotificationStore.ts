import { create } from "zustand";
import type { FriendRequest } from "@/types/user";

interface AcceptanceNotification {
  type: "friend-accepted";
  from: {
    _id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  message: string;
  createdAt: Date;
}

interface NotificationState {
  // Dữ liệu
  unreadFriendRequestCount: number;
  pendingRequests: FriendRequest[]; // Requests mới chưa được xem
  acceptanceNotifications: AcceptanceNotification[]; // Notifications khi request được accept

  // Actions
  setUnreadCount: (count: number) => void;
  incrementUnreadCount: () => void;
  decrementUnreadCount: () => void;
  resetUnreadCount: () => void;
  addPendingRequest: (request: FriendRequest) => void;
  removePendingRequest: (requestId: string) => void;
  clearPendingRequests: () => void;
  addAcceptanceNotification: (notification: AcceptanceNotification) => void;
  removeAcceptanceNotification: (index: number) => void;
  clearAcceptanceNotifications: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadFriendRequestCount: 0,
  pendingRequests: [],
  acceptanceNotifications: [],

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

  addAcceptanceNotification: (notification) =>
    set((state) => ({
      acceptanceNotifications: [notification, ...state.acceptanceNotifications],
    })),

  removeAcceptanceNotification: (index) =>
    set((state) => ({
      acceptanceNotifications: state.acceptanceNotifications.filter(
        (_, i) => i !== index,
      ),
    })),

  clearAcceptanceNotifications: () => set({ acceptanceNotifications: [] }),
}));
