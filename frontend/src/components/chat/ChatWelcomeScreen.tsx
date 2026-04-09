import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import { MessageSquareDashed } from "lucide-react";

const ChatWelcomeScreen = () => {
  return (
    <SidebarInset className="app-shell-panel glass-strong flex h-full min-h-0 flex-1 md:border md:border-border/80 md:rounded-2xl overflow-hidden shadow-soft">
      <ChatWindowHeader />

      <div className="flex-1 flex flex-col items-center justify-center bg-background px-6 text-center select-none">
        <div className="animate-in fade-in slide-in-from-bottom-3 duration-700 ease-out flex flex-col items-center gap-4">
          <div className="relative flex size-[72px] items-center justify-center rounded-[22px] bg-primary/[0.07] text-primary shadow-sm ring-1 ring-primary/12">
            <MessageSquareDashed className="size-9" strokeWidth={1.4} />
            {/* single gentle pulse */}
            <span className="absolute inset-0 rounded-[22px] ring-1 ring-primary/20 animate-ping opacity-25" />
          </div>

          <div>
            <h1 className="text-[18px] font-bold tracking-tight text-foreground">
              Your messages
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground/70 max-w-[200px]">
              Select a conversation to start chatting
            </p>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
};

export default ChatWelcomeScreen;
