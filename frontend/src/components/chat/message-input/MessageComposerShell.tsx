import { cn } from "@/lib/utils";
import type { DragEvent, ReactNode } from "react";

interface MessageComposerShellProps {
  isDragOver: boolean;
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  children: ReactNode;
}

const MessageComposerShell = ({
  isDragOver,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  children,
}: MessageComposerShellProps) => {
  return (
    <section
      className={cn(
        "chat-input-shell--command relative z-10 flex w-full shrink-0 flex-col border-t border-border/30 bg-background transition-[border-color,background-color,box-shadow] duration-200",
        isDragOver && "drop-zone-active",
      )}
      aria-label="Message input area"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl animate-in fade-in duration-150">
          <p className="text-[13px] font-semibold text-primary">Drop image to attach</p>
        </div>
      )}

      {children}
    </section>
  );
};

export default MessageComposerShell;