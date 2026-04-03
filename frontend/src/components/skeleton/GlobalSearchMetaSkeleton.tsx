import { Skeleton } from "@/components/ui/skeleton";

const TAG_KEYS = ["one", "two", "three", "four"];
const ROW_KEYS = ["row-one", "row-two", "row-three"];

const GlobalSearchMetaSkeleton = () => {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <div className="flex flex-wrap gap-2">
          {TAG_KEYS.map((key) => (
            <Skeleton
              key={`recent-tag-${key}`}
              className="h-7 w-24 rounded-full"
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <div className="space-y-1.5">
          {ROW_KEYS.map((key) => (
            <div
              key={`pinned-item-${key}`}
              className="rounded-md border border-border/70 p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3.5 w-44" />
                <Skeleton className="h-4 w-4 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearchMetaSkeleton;
