import { Skeleton } from "@/components/ui/skeleton";

type FriendRequestSkeletonProps = {
  count?: number;
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

const FriendRequestSkeleton = ({ count = 3 }: FriendRequestSkeletonProps) => {
  return (
    <div className="space-y-3 mt-4" aria-hidden="true">
      {SKELETON_KEYS.slice(0, count).map((key) => (
        <div
          key={`friend-request-skeleton-${key}`}
          className="rounded-xl border border-border/60 bg-card/70 p-3"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16 rounded-lg" />
              <Skeleton className="h-8 w-16 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default FriendRequestSkeleton;
