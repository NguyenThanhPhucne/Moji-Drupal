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

  setPrivatePin: async (pin: string, currentPin?: string) => {
    const res = await api.post("/users/private-pin", {
      pin,
      ...(currentPin ? { currentPin } : {}),
    });
    return res.data;
  },

  verifyPrivatePin: async (pin: string) => {
    const res = await api.post("/users/private-pin/verify", { pin });
    return res.data as { allowed: boolean };
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

  updateUserRole: async (userId: string, role: string) => {
    const res = await api.patch(`/admin/users/${userId}/role`, { role });
    return res.data;
  },

  toggleUserBan: async (userId: string, isBanned: boolean) => {
    const res = await api.patch(`/admin/users/${userId}/ban`, { isBanned });
    return res.data;
  },

  toggleUserVerify: async (userId: string, isVerified: boolean) => {
    const res = await api.patch(`/admin/users/${userId}/verify`, { isVerified });
    return res.data;
  },

  deleteAccount: async () => {
    const res = await api.delete("/users/me");
    return res.data;
  },

  updateCustomStatus: async (payload: {
    statusEmoji?: string;
    statusText?: string;
    statusClearAt?: string | null;
  }) => {
    const res = await api.patch("/users/custom-status", payload);
    return res.data;
  },

  /**
   * Get active sessions for the current user.
   * Returns a list of devices/tokens (stub — requires backend support).
   */
  getUserSessions: async () => {
    const res = await api.get("/users/me/sessions");
    return res.data as {
      sessions: Array<{
        id: string;
        device: string;
        lastActive: string;
        current: boolean;
        ipAddress?: string;
        location?: string;
      }>;
    };
  },

  /**
   * Revoke a specific session token.
   * @param sessionId - the session ID to revoke
   */
  revokeSession: async (sessionId: string) => {
    const res = await api.delete(`/users/me/sessions/${sessionId}`);
    return res.data;
  },

  /**
   * Revoke all sessions except the current one (log out everywhere).
   */
  revokeAllOtherSessions: async () => {
    const res = await api.delete("/users/me/sessions");
    return res.data;
  },
};
