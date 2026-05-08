import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../ui/dialog";
import { Button } from "../../ui/button";
import { useChatStore } from "../../../stores/useChatStore";
import { Flame, Clock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface SecretModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentTimer: number;
}

const TIMERS = [
  { label: "Off", value: 0 },
  { label: "10 seconds", value: 10 },
  { label: "1 minute", value: 60 },
  { label: "1 hour", value: 3600 },
  { label: "1 day", value: 86400 },
];

export function SecretModeDialog({
  open,
  onOpenChange,
  conversationId,
  currentTimer,
}: SecretModeDialogProps) {
  const setDisappearingMessageTimer = useChatStore((state) => state.setDisappearingMessageTimer);
  const [selectedTimer, setSelectedTimer] = useState(currentTimer);
  const [isUpdating, setIsUpdating] = useState(false);

  // Update local state when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedTimer(currentTimer);
    }
  }, [open, currentTimer]);

  const handleSave = async () => {
    setIsUpdating(true);
    try {
      const success = await setDisappearingMessageTimer(conversationId, selectedTimer);
      if (success) {
        toast.success("Secret mode updated");
        onOpenChange(false);
      } else {
        toast.error("Failed to update secret mode");
      }
    } catch (error) {
      toast.error("An error occurred");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            Secret Mode
          </DialogTitle>
          <DialogDescription>
            Messages will automatically disappear after the selected time once they are sent.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 flex flex-col gap-3">
          <div className="bg-orange-500/10 p-4 rounded-lg flex items-start gap-3 mb-2">
            <ShieldCheck className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
            <p className="text-sm text-orange-800 dark:text-orange-200">
              Secret mode applies to all new messages in this conversation. Existing messages are not affected.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Message expiration timer
            </label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {TIMERS.map((timer) => (
                <button
                  key={timer.value}
                  onClick={() => setSelectedTimer(timer.value)}
                  className={`px-3 py-2 text-sm rounded-md border transition-all duration-200 flex items-center justify-center
                    ${selectedTimer === timer.value 
                      ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-500/20 dark:text-orange-100 font-medium' 
                      : 'border-input bg-transparent hover:bg-accent text-foreground'
                    }
                  `}
                >
                  {timer.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isUpdating || selectedTimer === currentTimer} className="bg-orange-600 hover:bg-orange-700 text-white">
            {isUpdating ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
