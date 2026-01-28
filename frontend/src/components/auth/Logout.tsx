import { Button } from "../ui/button";
import { useAuthStore } from "@/stores/useAuthStore";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router";

const Logout = () => {
  const { signOut, loading } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const success = await signOut();
      if (success) {
        navigate("/signin");
      }
    } catch (error) {
      console.error("❌ Logout handler error:", error);
    }
  };

  return (
    <Button variant="completeGhost" onClick={handleLogout} disabled={loading}>
      <LogOut className="text-destructive" />
      {loading ? "Logging out..." : "Log out"}
    </Button>
  );
};

export default Logout;
