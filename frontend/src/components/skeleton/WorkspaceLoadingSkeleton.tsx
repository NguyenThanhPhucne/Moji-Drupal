import { Skeleton } from "@/components/ui/skeleton";

const WorkspaceLoadingSkeleton = () => {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="elevated-card w-full max-w-sm space-y-3 px-5 py-4" aria-hidden="true">
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-2.5 w-full" />
      </div>
    </div>
  );
};

export default WorkspaceLoadingSkeleton;
