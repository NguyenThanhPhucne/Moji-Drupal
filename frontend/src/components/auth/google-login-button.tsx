import { useGoogleLogin } from "@react-oauth/google";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useChatStore } from "@/stores/useChatStore";
import api from "@/lib/axios";
import { memo, useCallback, useState } from "react";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function GoogleLoginButtonBase() {
  const { setAccessToken, setUser } = useAuthStore();
  const navigate = useNavigate();
  const { fetchConversations } = useChatStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSuccess = useCallback(
    async (tokenResponse: { access_token?: string; code?: string; credential?: string }) => {
      const token = tokenResponse.access_token ?? tokenResponse.code ?? (tokenResponse as { credential?: string }).credential;
      if (!token) {
        toast.error("Invalid Google credential");
        return;
      }

      setIsLoading(true);
      try {
        const response = await api.post("/auth/google", { token });
        const { accessToken, user } = response.data;

        if (!accessToken || !user) {
          toast.error("Invalid server response");
          return;
        }

        setAccessToken(accessToken);
        setUser(user);
        await fetchConversations();
        toast.success("Signed in with Google successfully!");
        navigate("/");
      } catch {
        toast.error("Google sign-in failed. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [fetchConversations, navigate, setAccessToken, setUser],
  );

  const login = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => toast.error("Google sign-in failed"),
    flow: "implicit",
  });

  if (!GOOGLE_CLIENT_ID) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => login()}
      disabled={isLoading}
      className="google-signin-btn"
    >
      {isLoading ? (
        <span className="google-signin-spinner" />
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="google-signin-icon"
          aria-hidden="true"
        >
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
      )}
      <span className="google-signin-label">
        {isLoading ? "Signing in..." : "Continue with Google"}
      </span>
    </button>
  );
}

export const GoogleLoginButton = memo(GoogleLoginButtonBase);
