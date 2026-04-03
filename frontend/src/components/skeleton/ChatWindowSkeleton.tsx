/**
 * ChatWindowSkeleton — Shimmer skeleton matching the real message layout.
 * Shows alternating sent/received bubbles so the layout shift is minimal
 * when real messages arrive.
 */

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
      className={`flex items-end gap-2 px-3 py-0.5 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar placeholder (received only, first of cluster) */}
      <div className="w-8 flex-shrink-0">
        {!isOwn && hasAvatar && (
          <div className="size-8 rounded-full skeleton-shimmer" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}
      >
        <div
          className={`h-9 ${widthClass} rounded-2xl skeleton-shimmer`}
          style={{
            borderRadius: isOwn
              ? "1rem 1rem 0.25rem 1rem"
              : "1rem 1rem 1rem 0.25rem",
          }}
        />
        {/* Timestamp */}
        <div className="w-10 h-2.5 rounded skeleton-shimmer opacity-60" />
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
