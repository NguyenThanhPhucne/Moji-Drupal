import { Shield, Bell, ShieldBan, KeyRound, Lock, Eye } from "lucide-react";
import { useNavigate } from "react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { userService } from "@/services/userService";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";

const PrivacySettings = ({
  onOpenNotifications,
}: {
  onOpenNotifications?: () => void;
}) => {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();

  // Private PIN state
  const [pinMode, setPinMode] = useState<"idle" | "set" | "change">("idle");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  const hasPin = Boolean(user?.hasPrivatePin);

  const handleOpenNotifications = () => {
    if (onOpenNotifications) {
      onOpenNotifications();
      return;
    }
    navigate("/settings/notifications");
  };

  const resetPin = () => {
    setPinMode("idle");
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
  };

  const handleSavePin = async () => {
    if (newPin.length < 4) {
      toast.error("PIN must be at least 4 digits");
      return;
    }
    if (newPin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }
    setPinSaving(true);
    try {
      await userService.setPrivatePin(newPin, hasPin ? currentPin : undefined);
      if (user) setUser({ ...user, hasPrivatePin: true });
      toast.success(hasPin ? "PIN updated" : "Private PIN set");
      resetPin();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Failed to set PIN");
    } finally {
      setPinSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Privacy Overview ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3 className="settings-card-title flex items-center gap-2">
            <Shield className="size-4 text-primary" /> Privacy & Security
          </h3>
          <p className="settings-card-desc">
            Manage your privacy controls and security preferences.
          </p>
        </div>
        <div className="settings-card-body divide-y divide-border/40">
          {/* Quick links */}
          <button
            type="button"
            onClick={() => navigate("/settings/security")}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors group"
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center group-hover:bg-primary/12 transition-colors">
              <Lock className="size-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Password & Sessions</p>
              <p className="text-xs text-muted-foreground mt-0.5">Change password, manage active sessions</p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleOpenNotifications}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors group"
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-blue-500/8 flex items-center justify-center group-hover:bg-blue-500/12 transition-colors">
              <Bell className="size-4 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Notification Settings</p>
              <p className="text-xs text-muted-foreground mt-0.5">Control when and how you get notified</p>
            </div>
          </button>

          <div className="flex items-center gap-3 px-4 py-3.5 opacity-50 cursor-not-allowed">
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-amber-500/8 flex items-center justify-center">
              <ShieldBan className="size-4 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Blocked Users</p>
              <p className="text-xs text-muted-foreground mt-0.5">Manage your block list — coming soon</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Private PIN ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3 className="settings-card-title flex items-center gap-2">
            <KeyRound className="size-4 text-primary" /> Private PIN
          </h3>
          <p className="settings-card-desc">
            {hasPin
              ? "Your private PIN is set. It protects hidden conversations and sensitive actions."
              : "Set a PIN to protect hidden conversations and sensitive actions."}
          </p>
        </div>
        <div className="settings-card-body">
          {pinMode === "idle" ? (
            <div className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center",
                  hasPin ? "bg-green-500/10" : "bg-muted/50"
                )}>
                  {hasPin ? (
                    <Eye className="size-4 text-green-500" />
                  ) : (
                    <KeyRound className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {hasPin ? "PIN is active" : "No PIN set"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {hasPin ? "Your hidden chats are protected" : "Hidden conversations are unprotected"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPinMode(hasPin ? "change" : "set")}
                className="settings-field-btn settings-field-btn--save text-xs"
              >
                {hasPin ? "Change PIN" : "Set PIN"}
              </button>
            </div>
          ) : (
            <div className="p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
              {hasPin && pinMode === "change" && (
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="priv-cur-pin">Current PIN</label>
                  <Input
                    id="priv-cur-pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="Enter current PIN"
                    className="settings-field-input"
                    autoComplete="off"
                  />
                </div>
              )}
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="priv-new-pin">
                  {hasPin ? "New PIN" : "Create PIN"}
                </label>
                <Input
                  id="priv-new-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="4–8 digits"
                  className="settings-field-input"
                  autoComplete="off"
                />
              </div>
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="priv-conf-pin">Confirm PIN</label>
                <Input
                  id="priv-conf-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Re-enter PIN"
                  className={cn(
                    "settings-field-input",
                    confirmPin && confirmPin !== newPin && "border-destructive/60",
                    confirmPin && confirmPin === newPin && "border-green-500/60",
                  )}
                  autoComplete="off"
                />
                {confirmPin && confirmPin !== newPin && (
                  <p className="mt-1 text-[11px] text-destructive">PINs do not match</p>
                )}
              </div>
              <div className="settings-field-actions">
                <button type="button" onClick={resetPin} className="settings-field-btn settings-field-btn--cancel">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pinSaving || !newPin || newPin !== confirmPin}
                  onClick={handleSavePin}
                  className="settings-field-btn settings-field-btn--save"
                >
                  {pinSaving ? "Saving…" : hasPin ? "Update PIN" : "Set PIN"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrivacySettings;
