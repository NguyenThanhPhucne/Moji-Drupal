import { Skeleton } from "@/components/ui/skeleton";
import { getStaggerEnterClass } from "@/lib/utils";

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
            className={`${getStaggerEnterClass(staggerIndex)} flex items-start gap-3 rounded-xl px-3 py-2.5`}
          >
            {/* Avatar circle */}
            <Skeleton className={`flex-shrink-0 rounded-full ${compact ? "h-9 w-9" : "h-10 w-10"}`} />

            {/* Content lines */}
            <div className="flex-1 space-y-2 pt-0.5">
              <Skeleton className={`h-3.5 ${compact ? "w-1/2" : "w-3/4"}`} />
              <Skeleton className="h-3 w-full" />
              {!compact && <Skeleton className="h-3 w-4/5" />}
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        );
      })}
    </>
  );
};

export default SocialNotificationsSkeleton;
