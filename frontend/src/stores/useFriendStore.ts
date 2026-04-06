import { friendService } from "@/services/friendService";
import type { FriendState } from "@/types/store";
import type { FriendRequest } from "@/types/user";
import { create } from "zustand";
import { useNotificationStore } from "./useNotificationStore";

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  loading: false,
  receivedList: [],
  sentList: [],
  seenRequests: [],
  markRequestSeen: (requestId) =>
    set((state) => {
      if (state.seenRequests.includes(requestId)) return state;
      
      // Reduce the badge count in NotificationStore IF it was unread
      useNotificationStore.getState().decrementUnreadCount();
      
      return { seenRequests: [...state.seenRequests, requestId] };
    }),
  addReceivedRequest: (request: FriendRequest) => set((state) => ({ receivedList: [request, ...state.receivedList] })),
  removeReceivedRequest: (requestId: string) => set((state) => ({ receivedList: state.receivedList.filter((r) => r._id !== requestId) })),
  searchByUsername: async (username) => {
    try {
      set({ loading: true });

      const user = await friendService.searchByUsername(username);

      return user;
    } catch (error) {
      console.error("Error searching user by username", error);
      return null;
    } finally {
      set({ loading: false });
    }
  },
  addFriend: async (to, message) => {
    try {
      set({ loading: true });
      const resultMessage = await friendService.sendFriendRequest(to, message);
      return resultMessage;
    } catch (error) {
      console.error("Error adding friend", error);
      return "Failed to send friend request. Please try again";
    } finally {
      set({ loading: false });
    }
  },
  getAllFriendRequests: async () => {
    try {
      set({ loading: true });

      const result = await friendService.getAllFriendRequest();

      if (!result) return;

      const { received, sent } = result;

      set({ receivedList: received, sentList: sent });

      // Update notification count (only unread received requests)
      const unreadCount = received.filter((req: { _id: string }) => !get().seenRequests.includes(req._id)).length;
      useNotificationStore.getState().setUnreadCount(unreadCount);
    } catch (error) {
      console.error("Error fetching friend requests", error);
    } finally {
      set({ loading: false });
    }
  },
  acceptRequest: async (requestId) => {
    const previousReceivedList = get().receivedList;
    const previousUnreadCount = useNotificationStore.getState().unreadFriendRequestCount;

    set((state) => ({
      receivedList: state.receivedList.filter((r) => r._id !== requestId),
    }));
    useNotificationStore.getState().decrementUnreadCount();

    try {
      set({ loading: true });
      await friendService.acceptRequest(requestId);
    } catch (error) {
      set({ receivedList: previousReceivedList });
      useNotificationStore.getState().setUnreadCount(previousUnreadCount);
      console.error("Error accepting request", error);
    } finally {
      set({ loading: false });
    }
  },
  declineRequest: async (requestId) => {
    const previousReceivedList = get().receivedList;
    const previousUnreadCount = useNotificationStore.getState().unreadFriendRequestCount;

    set((state) => ({
      receivedList: state.receivedList.filter((r) => r._id !== requestId),
    }));
    useNotificationStore.getState().decrementUnreadCount();

    try {
      set({ loading: true });
      await friendService.declineRequest(requestId);
    } catch (error) {
      set({ receivedList: previousReceivedList });
      useNotificationStore.getState().setUnreadCount(previousUnreadCount);
      console.error("Error declining request", error);
    } finally {
      set({ loading: false });
    }
  },
  getFriends: async () => {
    try {
      set({ loading: true });
      const friends = await friendService.getFriendList();
      set({ friends: friends });
    } catch (error) {
      console.error("Error loading friends", error);
      set({ friends: [] });
    } finally {
      set({ loading: false });
    }
  },
  removeFriend: async (friendId) => {
    const previousFriends = get().friends;

    set((state) => ({
      friends: state.friends.filter((friend) => friend._id !== friendId),
    }));

    try {
      set({ loading: true });
      const message = await friendService.removeFriend(friendId);

      return {
        ok: true,
        message,
      };
    } catch (error) {
      set({ friends: previousFriends });
      console.error("Error removing friend", error);
      return {
        ok: false,
        message: "Could not remove friend. Please try again.",
      };
    } finally {
      set({ loading: false });
    }
  },
}));
