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
      // Wait for logout to complete
      await signOut();
      // Navigate after logout completes
      navigate("/signin");
    } catch (error) {
      console.error("❌ Logout error:", error);
      // Still navigate even if logout fails
      navigate("/signin");
    } finally {
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
