

const ConversationSkeleton = () => {
  return (
    <div className="flex flex-col gap-1 px-1 py-1">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="flex flex-row items-center gap-3 rounded-xl border border-transparent px-3 py-[9px] bg-transparent"
        >
          {/* Avatar skeleton */}
          <div className="size-[42px] rounded-full skeleton-shimmer flex-shrink-0" />

          {/* Info skeleton */}
          <div className="flex flex-col flex-1 justify-center gap-1.5 min-w-0 pr-1">
            <div className="h-3.5 w-24 rounded-md skeleton-shimmer" />
            <div className="h-2.5 w-3/4 rounded-sm skeleton-shimmer opacity-70" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ConversationSkeleton;
