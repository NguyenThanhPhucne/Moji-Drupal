import { GoogleLogin } from "@react-oauth/google";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useChatStore } from "@/stores/useChatStore";
import api from "@/lib/axios";
import { memo, useCallback } from "react";

type CredentialResponse = {
  credential?: string;
  clientId?: string;
};

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function GoogleLoginButtonBase() {
  const { setAccessToken, setUser } = useAuthStore();
  const navigate = useNavigate();
  const { fetchConversations } = useChatStore();

  const handleGoogleLoginSuccess = useCallback(
    async (credentialResponse: CredentialResponse) => {
      try {
        if (!credentialResponse.credential) {
          toast.error("Invalid Google credential");
          return;
        }

        // Send Google token to backend.
        const response = await api.post("/auth/google", {
          token: credentialResponse.credential,
        });

        const { accessToken, user } = response.data;

        // Validate both token and user are returned
        if (!accessToken || !user) {
          toast.error("Invalid server response");
          return;
        }

        // Persist access token and user info.
        setAccessToken(accessToken);
        setUser(user);

        // Fetch conversations
        await fetchConversations();

        toast.success("Signed in with Google successfully!");
        navigate("/");
      } catch (error) {
        console.error("Google login error:", error);
        toast.error("Google sign-in failed. Please try again.");
      }
    },
    [fetchConversations, navigate, setAccessToken, setUser],
  );

  const handleGoogleLoginError = useCallback(() => {
    toast.error("Google sign-in failed");
  }, []);

  if (!GOOGLE_CLIENT_ID) {
    return null;
  }

  return (
    <div className="w-full">
      <GoogleLogin
        onSuccess={handleGoogleLoginSuccess}
        onError={handleGoogleLoginError}
        theme="filled_black"
        size="large"
      />
    </div>
  );
}

export const GoogleLoginButton = memo(GoogleLoginButtonBase);
