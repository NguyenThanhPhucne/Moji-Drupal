import { friendService } from "@/services/friendService";
import type { FriendState } from "@/types/store";
import { create } from "zustand";
import { useNotificationStore } from "./useNotificationStore";

export const useFriendStore = create<FriendState>((set) => ({
  friends: [],
  loading: false,
  receivedList: [],
  sentList: [],
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
      useNotificationStore.getState().setUnreadCount(received.length);
    } catch (error) {
      console.error("Error fetching friend requests", error);
    } finally {
      set({ loading: false });
    }
  },
  acceptRequest: async (requestId) => {
    try {
      set({ loading: true });
      await friendService.acceptRequest(requestId);

      set((state) => ({
        receivedList: state.receivedList.filter((r) => r._id !== requestId),
      }));

      // Decrement notification count
      useNotificationStore.getState().decrementUnreadCount();
    } catch (error) {
      console.error("Error accepting request", error);
    } finally {
      set({ loading: false });
    }
  },
  declineRequest: async (requestId) => {
    try {
      set({ loading: true });
      await friendService.declineRequest(requestId);

      set((state) => ({
        receivedList: state.receivedList.filter((r) => r._id !== requestId),
      }));

      // Decrement notification count
      useNotificationStore.getState().decrementUnreadCount();
    } catch (error) {
      console.error("Error declining request", error);
    } finally {
      set({ loading: false });
    }
  },
  getFriends: async () => {
    try {
      set({ loading: true });
      const friends = await friendService.getFriendList();
      console.log("[useFriendStore][ok] Friends loaded:", friends);
      console.log("[useFriendStore][debug] First friend details:", friends[0]);
      set({ friends: friends });
    } catch (error) {
      console.error("Error loading friends", error);
      set({ friends: [] });
    } finally {
      set({ loading: false });
    }
  },
}));
