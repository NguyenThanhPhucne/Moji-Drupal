/**
 * ChatWindowSkeleton — Shimmer skeleton matching the real message layout.
 * Shows alternating sent/received bubbles so the layout shift is minimal
 * when real messages arrive.
 */
import { cn } from "@/lib/utils";

type BubbleVariant = {
  isOwn: boolean;
  widthClass: string;
  hasAvatar?: boolean;
};

const BUBBLE_PATTERN: BubbleVariant[] = [
  { isOwn: false, widthClass: "w-48", hasAvatar: true },
  { isOwn: false, widthClass: "w-64" },
  { isOwn: true,  widthClass: "w-56" },
  { isOwn: true,  widthClass: "w-40" },
  { isOwn: false, widthClass: "w-72", hasAvatar: true },
  { isOwn: true,  widthClass: "w-32" },
  { isOwn: false, widthClass: "w-52" },
  { isOwn: true,  widthClass: "w-60" },
];

function ShimmerBubble({ isOwn, widthClass, hasAvatar }: BubbleVariant) {
  return (
    <div
      className={`flex items-end gap-2 px-3 py-0.5 mt-0.5 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar placeholder (received only, first of cluster) */}
      <div className="w-8 flex-shrink-0 flex items-end">
        {!isOwn && hasAvatar && (
          <div className="size-8 rounded-full skeleton-shimmer bg-muted" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`flex flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}
      >
        <div
          className={cn(
            "h-[34px] rounded-[18px] skeleton-shimmer opacity-70",
            widthClass,
            isOwn ? "rounded-br-[4px] bg-[hsl(var(--chat-bubble-sent))]" : "rounded-bl-[4px] bg-[hsl(var(--chat-bubble-received))]"
          )}
        />
        {/* Timestamp */}
        <div className="w-8 h-2 rounded skeleton-shimmer opacity-30 mt-0.5" />
      </div>
    </div>
  );
}

export function ChatWindowSkeleton() {
  return (
    <div className="flex flex-col-reverse gap-0.5 h-full py-4 overflow-hidden">
      {/* Date divider skeleton */}
      <div className="flex items-center gap-2 my-3 px-4">
        <div className="flex-1 h-px bg-border/40" />
        <div className="w-16 h-4 rounded-full skeleton-shimmer" />
        <div className="flex-1 h-px bg-border/40" />
      </div>

      {BUBBLE_PATTERN.map((variant, i) => (
        <ShimmerBubble key={i} {...variant} />
      ))}
    </div>
  );
}

export default ChatWindowSkeleton;
