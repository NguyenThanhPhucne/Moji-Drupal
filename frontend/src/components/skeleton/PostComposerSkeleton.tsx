import type { CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type PostComposerSkeletonProps = {
  compact?: boolean;
  staggerIndex?: number;
};

const PostComposerSkeleton = ({
  compact = false,
  staggerIndex = 0,
}: PostComposerSkeletonProps) => {
  return (
    <section
      className="stagger-enter elevated-card space-y-3 p-3 sm:space-y-4 sm:p-4"
      style={{ "--stagger-index": staggerIndex } as CSSProperties}
    >
      <Skeleton className={`h-6 ${compact ? "w-32" : "w-40"}`} />

      <Skeleton className={compact ? "h-20 w-full" : "h-24 w-full"} />

      <div className="grid gap-2 sm:grid-cols-2">
        <Skeleton className="h-10 w-full" />
        {!compact && <Skeleton className="h-10 w-full" />}
      </div>

      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-24" />
        {!compact && <Skeleton className="h-9 w-28" />}
        <Skeleton className="ml-auto h-9 w-20" />
      </div>
    </section>
  );
};

export default PostComposerSkeleton;
