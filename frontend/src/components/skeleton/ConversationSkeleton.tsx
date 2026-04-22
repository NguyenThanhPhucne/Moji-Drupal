const ConversationSkeleton = ({ count = 5 }: { count?: number }) => {
  return (
    <div className="flex flex-col gap-0.5 px-1 py-0.5">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-row items-center gap-3 rounded-[14px] px-3.5 py-2.5"
          style={{ opacity: 1 - index * 0.14 }}
        >
          {/* Avatar skeleton */}
          <div className="relative flex-shrink-0">
            <div className="size-[42px] rounded-full skeleton-shimmer" />
          </div>

          {/* Content skeleton */}
          <div className="flex flex-1 min-w-0 flex-col gap-[7px]">
            {/* Name row with timestamp */}
            <div className="flex items-center justify-between gap-2">
              <div
                className="h-3 rounded-md skeleton-shimmer"
                style={{ width: `${52 + (index % 3) * 16}px` }}
              />
              <div className="h-2.5 w-8 rounded-sm skeleton-shimmer opacity-60" />
            </div>
            {/* Preview text */}
            <div
              className="h-2.5 rounded-sm skeleton-shimmer opacity-60"
              style={{ width: `${55 + (index % 4) * 12}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ConversationSkeleton;
