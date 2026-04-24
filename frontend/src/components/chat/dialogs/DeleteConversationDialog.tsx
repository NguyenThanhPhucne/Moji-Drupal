import React from "react";
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

export function DeleteConversationDialog({
  open,
  onOpenChange,
  isDeleting,
  onConfirm,
  chatType,
  chatName,
}: DeleteConversationDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-w-md rounded-2xl p-6 gap-6 outline-none bg-background border border-border/50 shadow-2xl transition-[border-color,background-color,box-shadow] duration-200"
        aria-busy={isDeleting}
      >
        <AlertDialogHeader className="items-center text-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/12 ring-8 ring-destructive/10">
            <Trash2 className="size-6 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <AlertDialogTitle className="text-xl font-bold tracking-tight">
              Delete this conversation?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[15px] font-medium leading-relaxed text-muted-foreground/80 px-2">
              This will permanently remove all messages for{" "}
              <strong className="font-semibold text-foreground">
                {chatName}
              </strong>. 
              This action cannot be undone.
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:flex-row gap-3 sm:space-x-0 pt-2 w-full">
          <AlertDialogCancel disabled={isDeleting} className="flex-1 h-11 rounded-full border-border/60 font-semibold transition-colors hover:bg-muted/55">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
            className={cn(
              "flex-1 h-11 rounded-full bg-destructive font-semibold text-white transition-colors",
              "hover:bg-destructive/90",
              isDeleting && "opacity-70 pointer-events-none"
            )}
          >
            {isDeleting ? "Deleting..." : "Yes, delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
