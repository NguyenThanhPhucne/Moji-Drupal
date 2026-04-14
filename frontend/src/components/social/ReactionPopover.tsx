import { useCallback, useRef } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { ReactionGlyph } from "@/components/social/FacebookReactionIcons";
import type { SocialReactionType } from "@/types/social";

interface ReactionPopoverProps {
  activeReaction: SocialReactionType | null;
  onSelect: (reaction: SocialReactionType) => void;
  open?: boolean;
  disabled?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const reactions: Array<{
  type: SocialReactionType;
  label: string;
}> = [
  { type: "like", label: "Like" },
  { type: "love", label: "Love" },
  { type: "haha", label: "Haha" },
  { type: "wow", label: "Wow" },
  { type: "sad", label: "Sad" },
  { type: "angry", label: "Angry" },
];

const ReactionPopover = ({
  activeReaction,
  onSelect,
  open = false,
  disabled = false,
  onMouseEnter,
  onMouseLeave,
}: ReactionPopoverProps) => {
  const reactionButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusReactionByIndex = useCallback((index: number) => {
    if (reactions.length === 0) {
      return;
    }

    const safeIndex = (index + reactions.length) % reactions.length;
    reactionButtonRefs.current[safeIndex]?.focus();
  }, []);

  const handlePopoverKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }

      const activeElement = globalThis.document?.activeElement;
      const focusedIndex = reactionButtonRefs.current.indexOf(
        activeElement as HTMLButtonElement,
      );

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        focusReactionByIndex(focusedIndex + 1);
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        focusReactionByIndex(focusedIndex - 1);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        focusReactionByIndex(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        focusReactionByIndex(reactions.length - 1);
      }
    },
    [disabled, focusReactionByIndex],
  );

  return (
    <div
      className={cn(
        "absolute -top-14 left-1/2 z-30 -translate-x-1/2 rounded-2xl border border-border/70 bg-popover/95 px-2.5 py-1.5 shadow-[0_10px_28px_hsl(var(--foreground)/0.18)] backdrop-blur-[2px] transition-all duration-150",
        open
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-1 scale-95 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100",
        disabled && "opacity-90",
      )}
      role="toolbar"
      aria-label="Choose reaction"
      aria-disabled={disabled}
      tabIndex={-1}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={handlePopoverKeyDown}
    >
      <div className="flex items-center gap-1">
        {reactions.map((reaction, index) => {
          const isActive = activeReaction === reaction.type;
          return (
            <button
              key={reaction.type}
              ref={(element) => {
                reactionButtonRefs.current[index] = element;
              }}
              type="button"
              className={cn(
                  "group/icon inline-flex h-9 w-9 items-center justify-center rounded-full text-base transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1",
                !disabled && "hover:-translate-y-1 hover:scale-[1.22]",
                isActive ? "bg-primary/12" : "hover:bg-muted/70",
                disabled && "cursor-not-allowed",
              )}
              onClick={() => {
                if (disabled) {
                  return;
                }

                onSelect(reaction.type);
              }}
              disabled={disabled}
              title={reaction.label}
              aria-label={reaction.label}
            >
              <span className="transition-transform duration-150 group-hover/icon:-translate-y-0.5">
                <ReactionGlyph reaction={reaction.type} className="h-6 w-6" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ReactionPopover;
