//
import api from "@/lib/axios"; // Đảm bảo import đúng file vừa sửa ở trên

export const authService = {
  signUp: async (
    username: string,
    password: string,
    email: string,
    firstName: string,
    lastName: string,
  ) => {
    const res = await api.post("/auth/signup", {
      username,
      password,
      email,
      firstName,
      lastName,
    });
    return res.data;
  },

  signIn: async (username: string, password: string) => {
    // Lưu ý: URL bắt đầu bằng dấu / để khớp với bộ lọc trong axios.ts
    const res = await api.post("/auth/signin", {
      username,
      password,
    });
    return res.data;
  },

  googleAuth: async (token: string) => {
    const res = await api.post("/auth/google", {
      token,
    });
    return res.data;
  },

  signOut: async () => {
    return api.post("/auth/signout");
  },

  fetchMe: async () => {
    // API này sẽ tự động mang theo Cookie Session sang Drupal
    const res = await api.get("/users/me");
    return res.data.user; // Hoặc res.data tùy vào cấu trúc trả về của bạn
  },

  refresh: async () => {
    const res = await api.post("/auth/refresh");
    return res.data.accessToken;
  },
};
