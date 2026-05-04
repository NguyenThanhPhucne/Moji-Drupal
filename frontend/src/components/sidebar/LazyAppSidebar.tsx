import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";
import type { Sidebar } from "@/components/ui/sidebar";

const AppSidebar = lazy(() =>
  import("@/components/sidebar/app-sidebar").then((module) => ({
    default: module.AppSidebar,
  })),
);

type LazyAppSidebarProps = ComponentProps<typeof Sidebar>;

const AppSidebarFallback = () => (
  <div
    className="hidden md:block w-[280px] shrink-0"
    aria-hidden="true"
  />
);

export const LazyAppSidebar = (props: LazyAppSidebarProps) => {
  return (
    <Suspense fallback={<AppSidebarFallback />}>
      <AppSidebar {...props} />
    </Suspense>
  );
};
