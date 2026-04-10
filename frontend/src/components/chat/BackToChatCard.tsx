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
      className="inline-flex items-center gap-2 select-none cursor-pointer rounded-full border border-primary/25 bg-primary/6 px-4 py-2 text-[13px] font-semibold text-primary shadow-sm transition-all duration-150 hover:bg-primary/12 hover:border-primary/40 hover:shadow hover:-translate-y-px active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1"
      aria-label="Back to chat"
    >
      <MessageSquare className="size-4" />
      Back to chat
    </button>
  );
};

export default BackToChatCard;
