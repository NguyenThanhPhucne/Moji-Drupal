import { Skeleton } from "@/components/ui/skeleton";

const LoadingMoreSkeleton = () => {
  return (
    <div className="flex justify-center py-1" aria-hidden="true">
      <Skeleton className="h-10 w-36 rounded-xl" />
    </div>
  );
};

export default LoadingMoreSkeleton;
