import { MessageSquare } from "lucide-react";
import { useRef } from "react";

type BackToChatCardProps = {
  onClick: () => void;
};

const BackToChatCard = ({ onClick }: BackToChatCardProps) => {
  const activatedFromPointerRef = useRef(false);

  return (
    <button
      type="button"
      onPointerDown={(event) => {
        const isPrimaryPointer = event.button === 0;
        const hasModifier =
          event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;

        if (!isPrimaryPointer || hasModifier) {
          return;
        }

        activatedFromPointerRef.current = true;
        onClick();
      }}
      onClick={() => {
        // Keyboard activation (Enter/Space) and non-primary pointers fallback.
        if (activatedFromPointerRef.current) {
          activatedFromPointerRef.current = false;
          return;
        }
        onClick();
      }}
      className="flex flex-col gap-6 text-body-sm cursor-pointer rounded-xl border px-3 py-2.5 transition-all duration-200 hover:border-border/70 hover:bg-muted/70 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 group select-none border-primary/30 bg-gradient-to-r from-primary/10 to-primary-foreground ring-1 ring-primary/20 shadow-sm"
      aria-label="Back to chat"
    >
      <span className="inline-flex items-center gap-2 font-semibold tracking-[-0.01em] text-foreground">
        <MessageSquare className="size-4 text-primary" />
        Back to chat
      </span>
    </button>
  );
};

export default BackToChatCard;
