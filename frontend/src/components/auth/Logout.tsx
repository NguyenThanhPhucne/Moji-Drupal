import { Button } from "../ui/button";
import { useAuthStore } from "@/stores/useAuthStore";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router";
import { useRef } from "react";

const Logout = () => {
  const { signOut, loading } = useAuthStore();
  const navigate = useNavigate();
  const logoutInProgressRef = useRef(false);

  const handleLogout = async (e: React.MouseEvent) => {
    // Prevent multiple clicks
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;

    e.preventDefault();
    e.stopPropagation();

    try {
      // Fire logout request but don't wait for it
      signOut().catch(() => {
        // Silence errors, still navigate
      });

      // Navigate immediately for smooth UX
      setTimeout(() => {
        navigate("/signin");
      }, 100);
    } catch (error) {
      console.error("❌ Logout handler error:", error);
      logoutInProgressRef.current = false;
    }
  };

  return (
    <Button
      variant="completeGhost"
      onClick={handleLogout}
      disabled={loading || logoutInProgressRef.current}
    >
      <LogOut className="text-destructive" />
      {loading ? "Logging out..." : "Log out"}
    </Button>
  );
};

export default Logout;
