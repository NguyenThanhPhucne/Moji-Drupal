import { Skeleton } from "@/components/ui/skeleton";

const SECTION_KEYS = ["people", "groups", "messages"] as const;
const ROW_KEYS = ["one", "two", "three"];

const GlobalSearchResultsSkeleton = () => {
  return (
    <div className="space-y-4" aria-hidden="true">
      {SECTION_KEYS.map((sectionKey, sectionIndex) => (
        <section key={sectionKey} className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <div className="space-y-2">
            {ROW_KEYS.slice(0, sectionIndex === 2 ? 2 : 3).map((rowKey) => (
              <div
                key={`${sectionKey}-${rowKey}`}
                className="rounded-lg border border-border/70 p-2.5"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-44" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default GlobalSearchResultsSkeleton;
