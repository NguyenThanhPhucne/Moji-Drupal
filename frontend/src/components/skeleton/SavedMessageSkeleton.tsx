import type { CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type SavedMessageSkeletonProps = {
  count?: number;
  staggerFrom?: number;
};

const SKELETON_KEYS = ["one", "two", "three", "four", "five", "six"];

const SavedMessageSkeleton = ({
  count = 4,
  staggerFrom = 0,
}: SavedMessageSkeletonProps) => {
  return (
    <>
      {SKELETON_KEYS.slice(0, count).map((key, index) => {
        const staggerIndex = staggerFrom + index;

        return (
          <div
            key={`${key}-${staggerIndex}`}
            className="stagger-enter elevated-card space-y-3 p-4"
            style={{ "--stagger-index": staggerIndex } as CSSProperties}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-36" />
              </div>
              <Skeleton className="h-9 w-16 rounded-full" />
            </div>

            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-3 w-52" />

            <div className="flex gap-2">
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          </div>
        );
      })}
    </>
  );
};

export default SavedMessageSkeleton;
