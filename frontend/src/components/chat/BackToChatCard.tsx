import { MessageSquare } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

type BackToChatCardProps = {
  onClick: () => void;
  unreadCount?: number;
};

const BackToChatCard = (props: Readonly<BackToChatCardProps>) => {
  const { onClick, unreadCount = 0 } = props;
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
        "chat-back-to-chat-pill relative inline-flex select-none cursor-pointer items-center gap-2 rounded-full px-4 py-2",
        "text-[13px] font-semibold shadow-sm transition-colors duration-150 focus-visible:outline-none",
        "group",
      )}
      aria-label="Back to chat"
    >
      <span className="chat-back-to-chat-pill-icon inline-flex size-7 items-center justify-center rounded-full">
        <MessageSquare className="size-4" />
      </span>
      Back to chat
      {hasUnread && (
        <span className="chat-back-to-chat-pill-badge badge-pop absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold shadow-sm">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
};

export default BackToChatCard;
