import { Skeleton } from "@/components/ui/skeleton";

const ProfileHeaderSkeleton = () => {
  return (
    <div
      className="stagger-enter stagger-0 elevated-card p-4 md:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-20 max-w-[35vw]" />
            <Skeleton className="h-8 w-48 max-w-[70vw]" />
            <Skeleton className="h-4 w-32 max-w-[45vw]" />
            <Skeleton className="h-4 w-full max-w-[80vw] sm:max-w-[28rem]" />
            <div className="mt-3 flex flex-wrap gap-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="h-10 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
};

export default ProfileHeaderSkeleton;
