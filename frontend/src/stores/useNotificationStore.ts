import { create } from "zustand";
import type { FriendRequest } from "@/types/user";
import type { SocialNotification } from "@/types/social";

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
  // Data
  unreadFriendRequestCount: number;
  pendingRequests: FriendRequest[]; // Unseen incoming requests
  acceptanceNotifications: AcceptanceNotification[]; // Notifications when a request is accepted
  socialNotifications: SocialNotification[];
  unreadSocialCount: number;

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
  setSocialNotifications: (notifications: SocialNotification[]) => void;
  addSocialNotification: (notification: SocialNotification) => void;
  markSocialNotificationRead: (notificationId: string) => void;
  markAllSocialNotificationsRead: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadFriendRequestCount: 0,
  pendingRequests: [],
  acceptanceNotifications: [],
  socialNotifications: [],
  unreadSocialCount: 0,

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

  setSocialNotifications: (notifications) =>
    set({
      socialNotifications: notifications,
      unreadSocialCount: notifications.filter((item) => !item.isRead).length,
    }),

  addSocialNotification: (notification) =>
    set((state) => ({
      socialNotifications: [notification, ...state.socialNotifications],
      unreadSocialCount:
        state.unreadSocialCount + (notification.isRead ? 0 : 1),
    })),

  markSocialNotificationRead: (notificationId) =>
    set((state) => {
      let decrement = 0;
      const next = state.socialNotifications.map((notification) => {
        if (notification._id !== notificationId || notification.isRead) {
          return notification;
        }

        decrement = 1;
        return {
          ...notification,
          isRead: true,
        };
      });

      return {
        socialNotifications: next,
        unreadSocialCount: Math.max(0, state.unreadSocialCount - decrement),
      };
    }),

  markAllSocialNotificationsRead: () =>
    set((state) => ({
      socialNotifications: state.socialNotifications.map((notification) => ({
        ...notification,
        isRead: true,
      })),
      unreadSocialCount: 0,
    })),
}));
