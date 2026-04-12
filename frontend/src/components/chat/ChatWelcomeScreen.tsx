import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import { MessageSquareDashed, Plus, Users } from "lucide-react";
import { useChatStore } from "@/stores/useChatStore";
import { useState } from "react";
import NewGroupChatModal from "./NewGroupChatModal";
import { cn } from "@/lib/utils";

const EMOJI_PARTICLES = [
  { emoji: "💬", style: "absolute -top-5 -left-6 text-[18px] animate-float opacity-60" },
  { emoji: "✨", style: "absolute -top-3 -right-7 text-[14px] animate-float-delayed opacity-50" },
  { emoji: "🎉", style: "absolute -bottom-4 -left-4 text-[16px] animate-float opacity-55" },
  { emoji: "💙", style: "absolute -bottom-2 -right-5 text-[13px] animate-float-delayed opacity-45" },
];

const FEATURE_PILLS = [
  { label: "End-to-end messaging", emoji: "🔒" },
  { label: "Realtime sync", emoji: "⚡" },
  { label: "Forward with privacy", emoji: "🛡️" },
];

const ChatWelcomeScreen = () => {
  const { conversations } = useChatStore();
  const [showNewGroup, setShowNewGroup] = useState(false);

  const directConvos = conversations.filter((c) => c.type === "direct");

  const handleStartNewChat = () => {
    // Open friend list sidebar or navigate — for now scroll sidebar into view
    const sidebarBtn = document.querySelector("[data-chat-card='true']") as HTMLElement | null;
    if (sidebarBtn) {
      sidebarBtn.focus();
    }
  };

  return (
    <SidebarInset className="app-shell-panel glass-strong flex h-full min-h-0 flex-1 md:border md:border-border/80 md:rounded-2xl overflow-hidden shadow-soft">
      <ChatWindowHeader />

      <div className="welcome-mesh-bg flex-1 flex flex-col items-center justify-center bg-background px-6 text-center select-none relative overflow-hidden">

        {/* Subtle decorative circles in corner */}
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-primary/[0.04] blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-56 h-56 rounded-full bg-accent/[0.04] blur-3xl pointer-events-none" />

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out flex flex-col items-center gap-6 relative z-10">

          {/* Icon with 3 concentric rings + emoji particles + breath */}
          <div className="animate-icon-breath relative flex size-[82px] items-center justify-center rounded-[24px] bg-primary/[0.08] text-primary shadow-md ring-1 ring-primary/12">
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
          <div className="flex flex-col items-center gap-2">
            <h1 className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150 text-[18px] font-bold tracking-tight text-foreground">
              Your messages
            </h1>
            <p className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 text-[13px] text-muted-foreground/70 max-w-[230px] leading-relaxed">
              Select a conversation to start chatting, or create a new one
            </p>
          </div>

          {/* Feature pills */}
          <div className="animate-in fade-in duration-700 delay-400 flex items-center gap-2 flex-wrap justify-center">
            {FEATURE_PILLS.map(({ label, emoji }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-muted/30 px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground/70 backdrop-blur-sm"
              >
                <span className="text-[11px]" aria-hidden>{emoji}</span>
                {label}
              </span>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="animate-in fade-in slide-in-from-bottom-1 duration-500 delay-500 flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleStartNewChat}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold",
                "bg-primary text-primary-foreground shadow-sm",
                "hover:brightness-110 hover:shadow-md hover:scale-105 active:scale-95",
                "transition-all duration-200",
              )}
            >
              <Plus className="size-3.5" />
              New Chat
            </button>

            <button
              type="button"
              onClick={() => setShowNewGroup(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold",
                "bg-muted/70 border border-border/50 text-foreground/80",
                "hover:bg-muted hover:border-border hover:text-foreground hover:scale-105 active:scale-95",
                "transition-all duration-200",
              )}
            >
              <Users className="size-3.5" />
              New Group
            </button>
          </div>

          {/* Stats row — count direct convos to show something useful */}
          {directConvos.length > 0 && (
            <p className="animate-in fade-in duration-700 delay-600 text-[11px] text-muted-foreground/40 tracking-wide">
              You have{" "}
              <span className="font-semibold text-muted-foreground/60">
                {conversations.length}
              </span>{" "}
              conversation{conversations.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* New Group Modal */}
      <NewGroupChatModal
        isOpen={showNewGroup}
        onClose={() => setShowNewGroup(false)}
      />
    </SidebarInset>
  );
};

export default ChatWelcomeScreen;
