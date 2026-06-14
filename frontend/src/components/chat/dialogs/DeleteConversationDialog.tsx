
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface DeleteConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDeleting: boolean;
  onConfirm: () => void;
  chatType: "direct" | "group";
  chatName: string;
}

export function DeleteConversationDialog(
  props: Readonly<DeleteConversationDialogProps>,
) {
  const {
    open,
    onOpenChange,
    isDeleting,
    onConfirm,
    chatType,
    chatName,
  } = props;
  const dialogLabel = chatType === "group" ? "group conversation" : "direct conversation";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="chat-detail-dialog-shell chat-detail-dialog-shell--compact chat-detail-dialog-destructive-shell p-0 gap-0 outline-none"
        aria-busy={isDeleting}
      >
        <AlertDialogHeader className="chat-detail-dialog-header items-center text-center space-y-4">
          <div className="dialog-danger-icon ring-8 ring-destructive/10">
            <Trash2 className="size-6 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <AlertDialogTitle className="chat-detail-dialog-title">
              Delete this {dialogLabel}?
            </AlertDialogTitle>
            <AlertDialogDescription className="chat-detail-dialog-description px-2">
              This will permanently remove all messages for <strong className="font-semibold text-foreground">{chatName}</strong>.
              This action cannot be undone.
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="chat-detail-dialog-footer chat-detail-dialog-footer--split sm:flex-row w-full pt-2">
          <AlertDialogCancel
            disabled={isDeleting}
            className="chat-modal-btn chat-modal-btn--secondary flex-1 h-11 rounded-full border-border/60 font-semibold"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
            className={cn(
              "chat-modal-btn chat-modal-btn--danger flex-1 h-11 rounded-full font-semibold",
              isDeleting && "opacity-70 pointer-events-none",
            )}
          >
            {isDeleting ? "Deleting..." : "Yes, delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
