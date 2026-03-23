import { create } from "zustand";
import { toast } from "sonner";
import { authService } from "@/services/authService";
import type { AuthState } from "@/types/store";
import { persist } from "zustand/middleware";
import { useChatStore } from "./useChatStore";
import { useSocketStore } from "./useSocketStore";

const getErrorMessage = (error: unknown, fallback: string) => {
  const maybeAxios = error as {
    response?: { data?: { message?: string } };
    message?: string;
  };

  return maybeAxios?.response?.data?.message || maybeAxios?.message || fallback;
};

const getErrorStatus = (error: unknown) => {
  const maybeAxios = error as {
    response?: { status?: number };
  };

  return maybeAxios?.response?.status;
};

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

          // Call API
          await authService.signUp(
            username,
            password,
            email,
            firstName,
            lastName,
          );

          toast.success(
            "Sign-up successful! You will be redirected to sign-in.",
          );
        } catch (error) {
          console.error(error);
          toast.error(getErrorMessage(error, "Sign-up failed"));
          throw error;
        } finally {
          set({ loading: false });
        }
      },
      signIn: async (username, password) => {
        try {
          get().clearState();
          set({ loading: true });

          // Get full response payload
          const data = await authService.signIn(username, password);

          // Set token if present (Drupal may return only cookie in some cases)
          if (data.accessToken) {
            get().setAccessToken(data.accessToken);
          }

          // Important: call fetchMe to resolve user info from the fresh cookie
          await get().fetchMe();

          // Load chats after user is available
          useChatStore.getState().fetchConversations();

          toast.success("Welcome back to Coming");
        } catch (error) {
          console.error(error);
          toast.error(getErrorMessage(error, "Sign-in failed!"));
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

          toast.success("Logged out successfully!");
        } catch (error) {
          console.error("[auth][error] Logout error:", error);
          toast.error("Logout failed. Please try again!");
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
          console.error("Not signed in or network error:", error);
          // Quiet reset without toast to avoid noisy UX on initial load
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
          const status = getErrorStatus(error);

          // 401/403 means no usable refresh session; this is expected for signed-out users.
          if (status === 401 || status === 403) {
            get().clearState();
            return;
          }

          console.error(error);
          toast.error("Cannot restore your session. Please sign in again!");
          get().clearState();
        } finally {
          set({ loading: false });
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user }), // persist user only
    },
  ),
);
