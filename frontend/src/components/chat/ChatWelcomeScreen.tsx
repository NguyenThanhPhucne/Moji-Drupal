import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import { MessageSquareDashed } from "lucide-react";

const EMOJI_PARTICLES = [
  { emoji: "💬", style: "absolute -top-5 -left-6 text-[18px] animate-float opacity-60" },
  { emoji: "✨", style: "absolute -top-3 -right-7 text-[14px] animate-float-delayed opacity-50" },
  { emoji: "🎉", style: "absolute -bottom-4 -left-4 text-[16px] animate-float opacity-55" },
  { emoji: "💙", style: "absolute -bottom-2 -right-5 text-[13px] animate-float-delayed opacity-45" },
];

const ChatWelcomeScreen = () => {
  return (
    <SidebarInset className="app-shell-panel glass-strong flex h-full min-h-0 flex-1 md:border md:border-border/80 md:rounded-2xl overflow-hidden shadow-soft">
      <ChatWindowHeader />

      <div className="flex-1 flex flex-col items-center justify-center bg-background px-6 text-center select-none">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out flex flex-col items-center gap-5">

          {/* Icon with 3 concentric rings + emoji particles */}
          <div className="relative flex size-[76px] items-center justify-center rounded-[22px] bg-primary/[0.07] text-primary shadow-sm ring-1 ring-primary/12">
            <MessageSquareDashed className="size-9" strokeWidth={1.35} />

            {/* 3 concentric ring animations */}
            <span className="welcome-ring" />
            <span className="welcome-ring welcome-ring-2" />
            <span className="welcome-ring welcome-ring-3" />

            {/* Floating emoji particles */}
            {EMOJI_PARTICLES.map(({ emoji, style }, i) => (
              <span key={i} className={style} aria-hidden="true">
                {emoji}
              </span>
            ))}
          </div>

          {/* Text with stagger animation */}
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150 text-[18px] font-bold tracking-tight text-foreground">
              Your messages
            </h1>
            <p className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 text-[13px] text-muted-foreground/70 max-w-[210px] leading-relaxed">
              Select a conversation to start chatting, or create a new one
            </p>
            <p className="animate-in fade-in duration-700 delay-500 text-[11px] text-muted-foreground/40 mt-1 tracking-wide uppercase font-medium">
              End-to-end messaging
            </p>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
};

export default ChatWelcomeScreen;

