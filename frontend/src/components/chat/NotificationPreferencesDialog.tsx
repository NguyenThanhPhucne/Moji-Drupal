import { Bell } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import NotificationPreferencesSettings from "../notifications/NotificationPreferencesSettings";

const NotificationPreferencesDialog = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full text-muted-foreground hover:text-foreground"
          title="Notification preferences"
          aria-label="Notification preferences"
        >
          <Bell className="size-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl p-0 overflow-hidden">
        <div className="border-b border-border/60 px-5 py-4">
          <DialogHeader>
            <DialogTitle>Notification preferences</DialogTitle>
            <DialogDescription>
              Tune chat and social alerts with one-tap presets.
            </DialogDescription>
          </DialogHeader>
        </div>

        <NotificationPreferencesSettings className="max-h-[72vh] overflow-y-auto beautiful-scrollbar p-4" />
      </DialogContent>
    </Dialog>
  );
};

export default NotificationPreferencesDialog;
