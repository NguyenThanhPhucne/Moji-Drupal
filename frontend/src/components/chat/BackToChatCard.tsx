import { MessageSquare } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

type BackToChatCardProps = {
  onClick: () => void;
  unreadCount?: number;
};

const BackToChatCard = ({ onClick, unreadCount = 0 }: BackToChatCardProps) => {
  const activatedFromPointerRef = useRef(false);
  const hasUnread = unreadCount > 0;

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
      className={cn(
        "relative inline-flex items-center gap-2 select-none cursor-pointer",
        "rounded-full border border-primary/25 bg-primary/6 px-4 py-2",
        "text-[13px] font-semibold text-primary shadow-sm",
        "transition-all duration-150 hover:bg-primary/12 hover:border-primary/40 hover:shadow hover:-translate-y-px",
        "active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1",
        "group"
      )}
      aria-label="Back to chat"
    >
      <MessageSquare
        className="size-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-[-6deg]"
      />
      Back to chat
      {hasUnread && (
        <span className="badge-pop absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white px-1 shadow-sm">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
};

export default BackToChatCard;
