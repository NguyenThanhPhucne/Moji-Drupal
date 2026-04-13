import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type DialogFriendListSkeletonProps = {
  count?: number;
  showActions?: boolean;
  className?: string;
};

const SKELETON_KEYS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
];

const DialogFriendListSkeleton = ({
  count = 5,
  showActions = false,
  className,
}: DialogFriendListSkeletonProps) => {
  return (
    <div className={cn("dialog-friend-skeleton space-y-2", className)} aria-hidden="true">
      {SKELETON_KEYS.slice(0, count).map((key, index) => (
        <div
          key={`dialog-friend-skeleton-${key}`}
          className="dialog-friend-skeleton-row rounded-xl border border-border/70 bg-card/80 p-3"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-center gap-3">
            <Skeleton className="dialog-friend-skeleton-blob h-10 w-10 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="dialog-friend-skeleton-blob h-4 w-36" />
              <Skeleton className="dialog-friend-skeleton-blob h-3 w-24" />
            </div>
            {showActions && (
              <div className="flex items-center gap-2">
                <Skeleton className="dialog-friend-skeleton-blob h-8 w-16 rounded-lg" />
                <Skeleton className="dialog-friend-skeleton-blob h-8 w-20 rounded-lg" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default DialogFriendListSkeleton;
