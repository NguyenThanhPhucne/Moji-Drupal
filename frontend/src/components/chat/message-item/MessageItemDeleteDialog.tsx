import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MessageItemDeleteDialogProps {
  open: boolean;
  isOwn: boolean;
  loadingAction: null | "for-me" | "for-everyone";
  onOpenChange: (open: boolean) => void;
  onConfirmRemoveForMe: () => void;
  onConfirmUnsendForEveryone: () => void;
  onClose: () => void;
}

const MessageItemDeleteDialog = ({
  open,
  isOwn,
  loadingAction,
  onOpenChange,
  onConfirmRemoveForMe,
  onConfirmUnsendForEveryone,
  onClose,
}: MessageItemDeleteDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="chat-modal-shell max-w-md rounded-2xl p-6 gap-6 outline-none bg-background border border-border/50 shadow-2xl transition-[border-color,background-color,box-shadow] duration-200"
        showCloseButton={!loadingAction}
        dismissible={!loadingAction}
      >
        <DialogHeader className="items-center text-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/12 ring-8 ring-destructive/10">
            <Trash2 className="size-6 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <DialogTitle className="text-xl font-bold tracking-tight">
              Remove this message?
            </DialogTitle>
            <DialogDescription className="text-[15px] font-medium leading-relaxed text-muted-foreground/80 px-2">
              Choose the scope that fits your intent. Some participants may have
              already seen or forwarded this message.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="grid gap-3">
          {isOwn && (
            <button
              type="button"
              disabled={!!loadingAction}
              onClick={onConfirmUnsendForEveryone}
              className="chat-delete-scope-option chat-delete-scope-option--danger flex flex-col items-start group"
            >
              <p className="text-[15px] font-semibold text-destructive">
                Unsend for everyone
              </p>
              <p className="mt-1.5 text-[13px] text-destructive/80 leading-relaxed font-medium">
                This message will be removed for everyone in this chat. Others
                may have already seen or forwarded it.
              </p>
              {loadingAction === "for-everyone" && (
                <p className="mt-2 text-xs font-semibold animate-pulse text-destructive">
                  Processing...
                </p>
              )}
            </button>
          )}

          <button
            type="button"
            disabled={!!loadingAction}
            onClick={onConfirmRemoveForMe}
            className="chat-delete-scope-option flex flex-col items-start"
          >
            <p className="text-[15px] font-semibold text-foreground">
              Remove for you
            </p>
            <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed font-medium">
              This message will be removed from your devices only. It will
              remain visible to other chat participants.
            </p>
            {loadingAction === "for-me" && (
              <p className="mt-2 text-xs font-semibold animate-pulse text-primary">
                Processing...
              </p>
            )}
          </button>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={!!loadingAction}
            onClick={onClose}
            className="chat-modal-btn flex items-center justify-center rounded-full h-10 px-6 font-semibold"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MessageItemDeleteDialog;
