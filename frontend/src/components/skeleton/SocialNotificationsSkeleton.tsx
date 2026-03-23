import type { CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type SocialNotificationsSkeletonProps = {
  count?: number;
  staggerFrom?: number;
  compact?: boolean;
};

const SKELETON_KEYS = ["one", "two", "three", "four", "five", "six"];

const SocialNotificationsSkeleton = ({
  count = 4,
  staggerFrom = 0,
  compact = false,
}: SocialNotificationsSkeletonProps) => {
  return (
    <>
      {SKELETON_KEYS.slice(0, count).map((key, index) => {
        const staggerIndex = staggerFrom + index;

        return (
          <div
            key={`${key}-${staggerIndex}`}
            className="stagger-enter rounded-xl border border-border/60 bg-background/60 px-3 py-2"
            style={{ "--stagger-index": staggerIndex } as CSSProperties}
          >
            <Skeleton className={`h-4 ${compact ? "w-24" : "w-28"}`} />
            <Skeleton className="mt-2 h-3 w-full" />
            {!compact && <Skeleton className="mt-1 h-3 w-4/5" />}
            <Skeleton className={`mt-2 h-3 ${compact ? "w-16" : "w-20"}`} />
          </div>
        );
      })}
    </>
  );
};

export default SocialNotificationsSkeleton;
