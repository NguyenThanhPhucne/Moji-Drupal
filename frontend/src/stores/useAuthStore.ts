import { create } from "zustand";
import { toast } from "sonner";
import { authService } from "@/services/authService";
import type { AuthState } from "@/types/store";
import { persist } from "zustand/middleware";
import { useChatStore } from "./useChatStore";
import { useSocketStore } from "./useSocketStore";

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      loading: false,

      setAccessToken: (accessToken) => {
        set({ accessToken });
      },
      setUser: (user) => {
        set({ user });
      },
      clearState: () => {
        // Disconnect socket first
        useSocketStore.getState().disconnectSocket();

        set({ accessToken: null, user: null, loading: false });
        useChatStore.getState().reset();
        localStorage.clear();
        sessionStorage.clear();
      },
      signUp: async (username, password, email, firstName, lastName) => {
        try {
          set({ loading: true });

          //  gọi api
          await authService.signUp(
            username,
            password,
            email,
            firstName,
            lastName,
          );

          toast.success(
            "Đăng ký thành công! Bạn sẽ được chuyển sang trang đăng nhập.",
          );
        } catch (error) {
          console.error(error);
          toast.error("Đăng ký không thành công");
        } finally {
          set({ loading: false });
        }
      },
      signIn: async (username, password) => {
        try {
          get().clearState();
          set({ loading: true });

          // Lấy toàn bộ data trả về
          const data = await authService.signIn(username, password);

          // Chỉ set token nếu có (đề phòng Drupal chỉ trả về Cookie mà không có token)
          if (data.accessToken) {
            get().setAccessToken(data.accessToken);
          }

          // Quan trọng: Gọi fetchMe để lấy thông tin user từ Cookie vừa nhận
          await get().fetchMe();

          // Sau khi có user, mới gọi chat
          useChatStore.getState().fetchConversations();

          toast.success("Chào mừng bạn quay lại với Moji 🎉");
        } catch (error) {
          console.error(error);
          toast.error("Đăng nhập không thành công!");
        } finally {
          set({ loading: false });
        }
      },
      signOut: async () => {
        try {
          set({ loading: true });

          // Call API first (BEFORE clearing state)
          await authService.signOut();

          // Only clear state if API succeeded
          get().clearState();

          toast.success("Logout thành công!");
          return true;
        } catch (error) {
          console.error("❌ Logout error:", error);
          toast.error("Lỗi xảy ra khi logout. Hãy thử lại!");
          return false;
        } finally {
          set({ loading: false });
        }
      },
      fetchMe: async () => {
        try {
          set({ loading: true });
          const user = await authService.fetchMe();
          set({ user });
        } catch (error) {
          console.error("Chưa đăng nhập hoặc lỗi mạng:", error);
          // Reset state lặng lẽ, KHÔNG HIỆN TOAST để tránh làm phiền user lúc mới vào trang
          set({ user: null, accessToken: null });
        } finally {
          set({ loading: false });
        }
      },
      refresh: async () => {
        try {
          set({ loading: true });
          const { user, fetchMe, setAccessToken } = get();
          const accessToken = await authService.refresh();

          setAccessToken(accessToken);

          if (!user) {
            await fetchMe();
          }
        } catch (error) {
          console.error(error);
          toast.error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!");
          get().clearState();
        } finally {
          set({ loading: false });
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user }), // chỉ persist user
    },
  ),
);
