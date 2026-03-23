import type { CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type SocialPostSkeletonProps = {
  count?: number;
  staggerFrom?: number;
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

const SocialPostSkeleton = ({
  count = 3,
  staggerFrom = 0,
}: SocialPostSkeletonProps) => {
  return (
    <>
      {SKELETON_KEYS.slice(0, count).map((key, index) => {
        const staggerIndex = staggerFrom + index;

        return (
          <article
            key={`${key}-${staggerIndex}`}
            className="stagger-enter elevated-card space-y-4 p-4 md:p-5"
            style={{ "--stagger-index": staggerIndex } as CSSProperties}
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-10/12" />
              <Skeleton className="h-4 w-7/12" />
            </div>

            <Skeleton className="h-56 w-full rounded-2xl" />

            <div className="flex gap-2">
              <Skeleton className="h-9 w-20 rounded-full" />
              <Skeleton className="h-9 w-24 rounded-full" />
              <Skeleton className="h-9 w-16 rounded-full" />
            </div>
          </article>
        );
      })}
    </>
  );
};

export default SocialPostSkeleton;
