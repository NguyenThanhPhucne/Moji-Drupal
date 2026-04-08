import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import { MessageSquareDashed } from "lucide-react";

const ChatWelcomeScreen = () => {
  return (
    <SidebarInset className="app-shell-panel glass-strong flex h-full min-h-0 flex-1 md:border md:border-border/80 md:rounded-2xl overflow-hidden shadow-soft">
      <ChatWindowHeader />


      <div className="flex-1 flex flex-col items-center justify-center bg-background px-6 text-center select-none relative">
        {/* SaaS-grade look: subtle smooth grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--muted-foreground)/0.05)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--muted-foreground)/0.05)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

        <div className="relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out flex flex-col items-center">
          <div className="relative mx-auto mb-6 flex size-16 items-center justify-center">
            {/* Subtle sonar ping effect for a polished pulse */}
            <div className="chat-welcome-ping chat-welcome-ping-primary" />
            <div className="chat-welcome-ping chat-welcome-ping-secondary" />
            
            <div className="relative flex h-full w-full items-center justify-center rounded-2xl bg-background text-primary ring-1 ring-primary/20 shadow-sm transition-all duration-300 hover:ring-primary/50 hover:shadow-primary/10 hover:shadow-xl">
              <MessageSquareDashed className="size-8" strokeWidth={1.5} />
            </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mb-2">
            Welcome to Moji
          </h1>
          <p className="max-w-xs text-[13px] sm:text-sm font-medium text-muted-foreground/80">
            Select a conversation from the sidebar to continue
          </p>
        </div>
      </div>
    </SidebarInset>
  );
};

export default ChatWelcomeScreen;
