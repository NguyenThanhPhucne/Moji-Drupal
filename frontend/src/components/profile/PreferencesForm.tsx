import { Sun, Moon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { userService } from "@/services/userService";
import { toast } from "sonner";
import { useEffect, useState } from "react";

const PreferencesForm = () => {
  const { isDark, toggleTheme } = useThemeStore();
  const { user, setUser } = useAuthStore();

  const [onlineStatus, setOnlineStatus] = useState(
    user?.showOnlineStatus !== false,
  );
  const [updatingOnlineStatus, setUpdatingOnlineStatus] = useState(false);

  useEffect(() => {
    setOnlineStatus(user?.showOnlineStatus !== false);
  }, [user?.showOnlineStatus]);

  const handleOnlineStatusChange = async (checked: boolean) => {
    const previous = onlineStatus;
    setOnlineStatus(checked);

    try {
      setUpdatingOnlineStatus(true);
      const response = await userService.updateOnlineStatusVisibility(checked);

      if (response?.user) {
        setUser(response.user);
      }

      toast.success("Online status preference updated");
    } catch (error) {
      console.error("Failed to update online status preference", error);
      setOnlineStatus(previous);
      toast.error("Could not update online status preference");
    } finally {
      setUpdatingOnlineStatus(false);
    }
  };

  return (
    <Card className="settings-card">
      <CardHeader className="settings-card-header">
        <CardTitle className="settings-card-title flex items-center gap-2">
          <Sun className="h-4.5 w-4.5 text-primary" />
          App preferences
        </CardTitle>
        <CardDescription className="settings-card-desc">Customize your chat experience</CardDescription>
      </CardHeader>

      <CardContent className="settings-card-body p-0">
        <div className="settings-toggle-row">
          <div>
            <Label htmlFor="theme-toggle" className="text-sm font-medium">
              Dark mode
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Switch between light and dark appearance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4 text-muted-foreground" />
            <Switch
              id="theme-toggle"
              checked={isDark}
              onCheckedChange={toggleTheme}
              className="data-[state=checked]:bg-primary-glow"
            />
            <Moon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        <div className="settings-toggle-row">
          <div>
            <Label htmlFor="online-status" className="text-sm font-medium">
              Show online status
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Allow others to see when you are online
            </p>
          </div>
          <Switch
            id="online-status"
            checked={onlineStatus}
            onCheckedChange={handleOnlineStatusChange}
            disabled={updatingOnlineStatus}
            className="data-[state=checked]:bg-primary-glow"
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default PreferencesForm;
