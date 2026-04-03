import { Skeleton } from "@/components/ui/skeleton";

type DialogFriendListSkeletonProps = {
  count?: number;
  showActions?: boolean;
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
}: DialogFriendListSkeletonProps) => {
  return (
    <div className="space-y-2" aria-hidden="true">
      {SKELETON_KEYS.slice(0, count).map((key) => (
        <div
          key={`dialog-friend-skeleton-${key}`}
          className="rounded-xl border border-border/70 bg-card/80 p-3"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            {showActions && (
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-16 rounded-lg" />
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default DialogFriendListSkeleton;
