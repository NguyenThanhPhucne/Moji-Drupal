import { GoogleLogin } from "@react-oauth/google";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useChatStore } from "@/stores/useChatStore";
import api from "@/lib/axios";

type CredentialResponse = {
  credential?: string;
  clientId?: string;
};

export function GoogleLoginButton() {
  const { setAccessToken, setUser } = useAuthStore();
  const navigate = useNavigate();
  const { fetchConversations } = useChatStore();

  const handleGoogleLoginSuccess = async (
    credentialResponse: CredentialResponse,
  ) => {
    try {
      if (!credentialResponse.credential) {
        toast.error("Google credential không hợp lệ");
        return;
      }

      // Gửi token Google đến backend
      const response = await api.post("/auth/google", {
        token: credentialResponse.credential,
      });

      const { accessToken, user } = response.data;

      // Lưu token và user thông tin
      if (accessToken) {
        setAccessToken(accessToken);
      }
      setUser(user);

      // Fetch conversations
      await fetchConversations();

      toast.success("Đăng nhập bằng Google thành công! 🎉");
      navigate("/");
    } catch (error) {
      console.error("Google login error:", error);
      toast.error("Đăng nhập bằng Google thất bại. Vui lòng thử lại.");
    }
  };

  const handleGoogleLoginError = () => {
    toast.error("Đăng nhập bằng Google thất bại");
  };

  return (
    <div className="w-full">
      <GoogleLogin
        onSuccess={handleGoogleLoginSuccess}
        onError={handleGoogleLoginError}
        theme="dark"
        size="large"
      />
    </div>
  );
}
