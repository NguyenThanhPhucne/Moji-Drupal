import api from "@/lib/axios";
import type { ProfileLite } from "@/types/chat";
import type { PersonalizationPreferences } from "@/types/user";
import {
  getCachedProfileLite,
  setCachedProfileLite,
} from "@/lib/scopedCache";

export const userService = {
  uploadAvatar: async (formData: FormData) => {
    const res = await api.post("/users/uploadAvatar", formData);
    if (res.status === 400) throw new Error(res.data.message);
    return res.data;
  },

  updateProfile: async (data: { displayName?: string; bio?: string; phone?: string }) => {
    const res = await api.patch("/users/me", data);
    return res.data;
  },

  uploadCoverPhoto: async (formData: FormData) => {
    const res = await api.post("/users/cover-photo", formData);
    if (res.status === 400) throw new Error(res.data.message);
    return res.data;
  },

  removeCoverPhoto: async () => {
    const res = await api.delete("/users/cover-photo");
    return res.data;
  },

  getProfileLite: async (userId: string): Promise<ProfileLite> => {
    const cachedProfile = getCachedProfileLite(userId);
    if (cachedProfile) {
      return cachedProfile;
    }

    const res = await api.get(`/users/${userId}/profile-lite`);
    setCachedProfileLite(userId, res.data.profile);
    return res.data.profile;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await api.post("/users/change-password", {
      currentPassword,
      newPassword,
    });
    return res.data;
  },

  updateOnlineStatusVisibility: async (showOnlineStatus: boolean) => {
    const res = await api.patch("/users/online-status-visibility", {
      showOnlineStatus,
    });
    return res.data;
  },

  updateNotificationPreferences: async (payload: {
    message?: boolean;
    sound?: boolean;
    desktop?: boolean;
    social?: {
      muted?: boolean;
      follow?: boolean;
      like?: boolean;
      comment?: boolean;
      mention?: boolean;
      friendAccepted?: boolean;
      system?: boolean;
      mutedUserIds?: string[];
      mutedConversationIds?: string[];
      digestEnabled?: boolean;
      digestWindowHours?: number;
    };
  }) => {
    const res = await api.patch("/users/notification-preferences", payload);
    return res.data;
  },

  updatePersonalizationPreferences: async (
    payload: PersonalizationPreferences,
  ) => {
    const res = await api.patch("/users/personalization-preferences", {
      personalizationPreferences: payload,
    });
    return res.data;
  },
};
