import { Shield, Bell, ShieldBan } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userService } from "@/services/userService";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";

const getErrorMessage = (error: unknown, fallback: string) => {
  const maybeAxios = error as {
    response?: { data?: { message?: string } };
    message?: string;
  };

  return maybeAxios?.response?.data?.message || maybeAxios?.message || fallback;
};

const PrivacySettings = () => {
  const { user } = useAuthStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleChangePassword = async (event?: FormEvent) => {
    event?.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Vui lòng nhập đầy đủ thông tin");
      return;
    }

    if (newPassword.length < 5) {
      toast.error("Mật khẩu mới phải có ít nhất 5 ký tự");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp");
      return;
    }

    setIsSubmitting(true);
    try {
      await userService.changePassword(currentPassword, newPassword);
      toast.success("Đổi mật khẩu thành công");
      resetForm();
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Đổi mật khẩu thất bại"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="settings-card">
      <CardHeader className="settings-card-header">
        <CardTitle className="settings-card-title flex items-center gap-2">
          <Shield className="h-4.5 w-4.5 text-primary" />
          Privacy & Security
        </CardTitle>
        <CardDescription className="settings-card-desc">
          Manage your privacy and security preferences
        </CardDescription>
      </CardHeader>

      <CardContent className="settings-card-body p-0">
        <div className="p-4 space-y-3 border-b border-border/30">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start border-border/50 bg-background hover:bg-muted/60"
              >
                <Shield className="h-4 w-4 mr-2" />
                Change password
              </Button>
            </DialogTrigger>
            <DialogContent
              dismissible={!isSubmitting}
              showCloseButton={!isSubmitting}
            >
              <DialogHeader className="modal-stagger-item">
                <DialogTitle>Change password</DialogTitle>
                <DialogDescription>
                  Enter your current password and choose a new one.
                </DialogDescription>
              </DialogHeader>

              <form
                className="space-y-4 modal-stagger-item"
                onSubmit={handleChangePassword}
                autoComplete="on"
              >
                <Input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={user?.username || user?.email || "current-user"}
                  readOnly
                  tabIndex={-1}
                  className="sr-only"
                  aria-hidden="true"
                />

                <div className="space-y-2">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input
                    id="current-password"
                    data-autofocus="true"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                <DialogFooter className="modal-stagger-item">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetForm();
                      setIsDialogOpen(false);
                    }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save new password"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            className="w-full justify-start border-border/50 bg-background hover:bg-muted/60"
          >
            <Bell className="h-4 w-4 mr-2" />
            Notification settings
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start border-border/50 bg-background hover:bg-muted/60"
          >
            <ShieldBan className="size-4 mr-2" />
            Block & Report
          </Button>
        </div>

        <div className="p-4 bg-destructive/5">
          <h4 className="font-medium mb-3 text-destructive">Danger zone</h4>
          <Button variant="destructive" className="w-full shadow-sm">
            Delete account
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PrivacySettings;
