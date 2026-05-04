import { Bell } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import NotificationPreferencesSettings from "../notifications/NotificationPreferencesSettings";

interface NotificationPreferencesDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  triggerClassName?: string;
  triggerTitle?: string;
}

const NotificationPreferencesDialog = ({
  open,
  onOpenChange,
  hideTrigger = false,
  triggerClassName,
  triggerTitle,
}: NotificationPreferencesDialogProps) => {
  const { t } = useI18n();
  const resolvedTriggerTitle =
    triggerTitle || t("notificationPreferences.trigger");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "rounded-full text-muted-foreground hover:text-foreground",
              triggerClassName,
            )}
            title={resolvedTriggerTitle}
            aria-label={resolvedTriggerTitle}
          >
            <Bell className="size-4" />
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="chat-detail-dialog-shell chat-detail-dialog-shell--medium p-0">
        <div className="chat-detail-dialog-header">
          <DialogHeader>
            <DialogTitle className="chat-detail-dialog-title">{t("notificationPreferences.title")}</DialogTitle>
            <DialogDescription className="chat-detail-dialog-description">
              {t("notificationPreferences.description")}
            </DialogDescription>
          </DialogHeader>
        </div>

        <NotificationPreferencesSettings className="chat-detail-dialog-body max-h-[72vh] overflow-y-auto beautiful-scrollbar" />
      </DialogContent>
    </Dialog>
  );
};

export default NotificationPreferencesDialog;
