import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import { MessageCircleMore } from "lucide-react";

const ChatWelcomeScreen = () => {
  return (
    <SidebarInset className="flex h-full w-full overflow-hidden rounded-3xl border border-border/70 bg-background/80 shadow-soft backdrop-blur-sm">
      <ChatWindowHeader />
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-primary-foreground/80 px-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(14,165,233,0.12),transparent_35%),radial-gradient(circle_at_82%_18%,rgba(6,182,212,0.10),transparent_30%)]" />
        <div className="relative z-10 text-center">
          <div className="pulse-ring mx-auto mb-6 flex size-24 items-center justify-center rounded-3xl bg-gradient-chat shadow-glow">
            <MessageCircleMore className="size-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-2 bg-gradient-chat bg-clip-text text-transparent">
            Welcome to Coming!
          </h2>
          <p className="mx-auto max-w-md text-muted-foreground">
            Choose a conversation to start chatting!
          </p>
        </div>
      </div>
    </SidebarInset>
  );
};

export default ChatWelcomeScreen;
