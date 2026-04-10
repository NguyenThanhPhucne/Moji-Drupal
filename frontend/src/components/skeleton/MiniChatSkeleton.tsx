

export function MiniChatSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-3 py-4 opacity-80 h-full justify-end">
      {/* Received message */}
      <div className="flex items-end gap-2">
        <div className="size-6 rounded-full bg-muted skeleton-shimmer flex-shrink-0" />
        <div className="h-8 w-3/4 rounded-[14px] rounded-bl-[4px] bg-muted skeleton-shimmer" />
      </div>

      {/* Sent message (cluster) */}
      <div className="flex flex-col gap-1 items-end pl-8">
        <div className="h-8 w-2/3 rounded-[14px] rounded-br-[4px] bg-primary/20 skeleton-shimmer" />
        <div className="h-7 w-1/2 rounded-[14px] rounded-br-[4px] bg-primary/20 skeleton-shimmer" />
      </div>

      {/* Received message */}
      <div className="flex items-end gap-2 mt-1">
        <div className="size-6 rounded-full bg-muted skeleton-shimmer flex-shrink-0" />
        <div className="h-8 w-4/5 rounded-[14px] rounded-bl-[4px] bg-muted skeleton-shimmer" />
      </div>
    </div>
  );
}

export default MiniChatSkeleton;
