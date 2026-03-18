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
import { useState } from "react";

const PreferencesForm = () => {
  const { isDark, toggleTheme } = useThemeStore();

  // Wire online status preference to backend/user settings when available.
  const [onlineStatus, setOnlineStatus] = useState(false);

  return (
    <Card className="glass-strong border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sun className="h-5 w-5 text-primary" />
          App preferences
        </CardTitle>
        <CardDescription>Customize your chat experience</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Dark Mode */}
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="theme-toggle" className="text-base font-medium">
              Dark mode
            </Label>
            <p className="text-sm text-muted-foreground">
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

        {/* Online Status */}
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="online-status" className="text-base font-medium">
              Show online status
            </Label>
            <p className="text-sm text-muted-foreground">
              Allow others to see when you are online
            </p>
          </div>
          <Switch
            id="online-status"
            checked={onlineStatus}
            onCheckedChange={setOnlineStatus}
            className="data-[state=checked]:bg-primary-glow"
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default PreferencesForm;
