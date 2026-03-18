import ChatWindowLayout from "@/components/chat/ChatWindowLayout";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

const ChatAppPage = () => {
  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="relative flex h-svh w-full overflow-hidden bg-gradient-to-br from-sky-100 via-white to-cyan-100 p-2 md:p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_15%,rgba(14,165,233,0.14),transparent_35%),radial-gradient(circle_at_85%_10%,rgba(6,182,212,0.12),transparent_30%),radial-gradient(circle_at_50%_90%,rgba(56,189,248,0.10),transparent_40%)]" />
        <div className="relative z-10 flex h-full w-full">
          <ChatWindowLayout />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ChatAppPage;
