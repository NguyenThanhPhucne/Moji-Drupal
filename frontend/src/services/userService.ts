import api from "@/lib/axios";
import type { ProfileLite } from "@/types/chat";

export const userService = {
  uploadAvatar: async (formData: FormData) => {
    // Do not set multipart Content-Type manually; axios/browser will set it with boundary.
    const res = await api.post("/users/uploadAvatar", formData);

    if (res.status === 400) {
      throw new Error(res.data.message);
    }

    return res.data;
  },

  getProfileLite: async (userId: string): Promise<ProfileLite> => {
    const res = await api.get(`/users/${userId}/profile-lite`);
    return res.data.profile;
  },
};
