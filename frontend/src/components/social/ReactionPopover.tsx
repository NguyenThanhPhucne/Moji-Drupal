import { cn } from "@/lib/utils";
import { ReactionGlyph } from "@/components/social/FacebookReactionIcons";
import type { SocialReactionType } from "@/types/social";

interface ReactionPopoverProps {
  activeReaction: SocialReactionType | null;
  onSelect: (reaction: SocialReactionType) => void;
  open?: boolean;
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
  onMouseEnter,
  onMouseLeave,
}: ReactionPopoverProps) => {
  return (
    <div
      className={cn(
        "absolute -top-14 left-1/2 z-30 -translate-x-1/2 rounded-2xl border border-[#E4E6EB] bg-white/95 px-2.5 py-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.18)] backdrop-blur-[2px] transition-all duration-150",
        open
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-1 scale-95 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100",
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center gap-1">
        {reactions.map((reaction) => {
          const isActive = activeReaction === reaction.type;
          return (
            <button
              key={reaction.type}
              type="button"
              className={cn(
                  "group/icon inline-flex h-9 w-9 items-center justify-center rounded-full text-base transition-all duration-150 hover:-translate-y-1 hover:scale-[1.22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1",
                isActive ? "bg-[#E7F3FF]" : "hover:bg-[#F0F2F5]",
              )}
              onClick={() => onSelect(reaction.type)}
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
