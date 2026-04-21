import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import {
  ArrowRight,
  Clock3,
  Command,
  Hash,
  Heart,
  Lock,
  MessageCircle,
  MessageSquareDashed,
  PartyPopper,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useChatStore } from "@/stores/useChatStore";
import { useMemo, useState } from "react";
import NewGroupChatModal from "./NewGroupChatModal";
import { cn } from "@/lib/utils";
import { Dialog } from "../ui/dialog";
import { useFriendStore } from "@/stores/useFriendStore";
import FriendListModal from "../createNewChat/FriendListModal";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";

const ICON_PARTICLES = [
  { Icon: MessageCircle, style: "absolute -top-5 -left-6 size-4 animate-float opacity-60" },
  { Icon: Sparkles, style: "absolute -top-3 -right-7 size-3.5 animate-float-delayed opacity-50" },
  { Icon: PartyPopper, style: "absolute -bottom-4 -left-4 size-4 animate-float opacity-55" },
  { Icon: Heart, style: "absolute -bottom-2 -right-5 size-3.5 animate-float-delayed opacity-45" },
];

const FEATURE_PILLS = [
  { label: "End-to-end messaging", Icon: Lock },
  { label: "Realtime sync", Icon: Zap },
  { label: "Forward with privacy", Icon: ShieldCheck },
];

const PRODUCTIVITY_SHORTCUTS = [
  { label: "Search", hint: "Ctrl+K", Icon: Command },
  { label: "Switch channel", hint: "Alt+↑/↓", Icon: Hash },
  { label: "Jump latest", hint: "1 tap", Icon: Clock3 },
];

const toConversationTimestamp = (conversation: {
  lastMessage?: { createdAt?: string } | null;
  updatedAt?: string;
  createdAt?: string;
}) => {
  const candidate =
    conversation.lastMessage?.createdAt ||
    conversation.updatedAt ||
    conversation.createdAt ||
    "";

  const ts = Date.parse(String(candidate));
  return Number.isFinite(ts) ? ts : 0;
};

const resolveConversationName = (
  conversation: Conversation,
  currentUserId: string,
) => {
  if (conversation.type === "group") {
    return conversation.group?.name || "Unnamed group";
  }

  const directPeer = (conversation.participants || []).find(
    (participant) => String(participant._id) !== currentUserId,
  );

  if (!directPeer) {
    return "Direct chat";
  }

  return directPeer.displayName || directPeer.username || "Direct chat";
};

const resolveConversationPreview = (conversation: Conversation) => {
  const content = String(conversation.lastMessage?.content || "").trim();
  if (content) {
    return content;
  }

  if (conversation.lastMessage) {
    return "Shared media";
  }

  return "No messages yet";
};

const resolveConversationUnread = (
  conversation: Conversation,
  currentUserId: string,
) => {
  if (!currentUserId) {
    return 0;
  }

  return Number(conversation.unreadCounts?.[currentUserId] || 0);
};

const ChatWelcomeScreen = () => {
  const conversations = useChatStore((state) => state.conversations);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const fetchMessages = useChatStore((state) => state.fetchMessages);
  const userId = useAuthStore((state) => String(state.user?._id || ""));
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewDirect, setShowNewDirect] = useState(false);
  const { getFriends } = useFriendStore();

  const directConvos = conversations.filter((c) => c.type === "direct");
  const groupConvos = conversations.filter((c) => c.type === "group");
  const conversationLabel = conversations.length === 1 ? "conversation" : "conversations";

  const recentConversations = useMemo(
    () =>
      [...conversations]
        .sort(
          (left, right) =>
            toConversationTimestamp(right) - toConversationTimestamp(left),
        )
        .slice(0, 4),
    [conversations],
  );
  const latestConversation = recentConversations[0] ?? null;

  const handleOpenNewDirectChat = async () => {
    await getFriends();
    setShowNewDirect(true);
  };

  const handleOpenConversation = async (conversationId: string) => {
    const normalizedConversationId = String(conversationId || "").trim();
    if (!normalizedConversationId) {
      return;
    }

    setActiveConversation(normalizedConversationId);
    await fetchMessages(normalizedConversationId);
  };

  const handleResumeLatestConversation = async () => {
    if (!latestConversation?._id) {
      return;
    }

    await handleOpenConversation(String(latestConversation._id));
  };

  return (
    <SidebarInset className="chat-shell-panel">
      <ChatWindowHeader />

      <div className="welcome-mesh-bg relative flex flex-1 items-center justify-center overflow-hidden bg-background px-4 py-6 sm:px-6 sm:py-8 lg:px-8">

        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/[0.05] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-accent/[0.05] blur-3xl" />

        <div className="relative z-10 grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-[1.4rem] border border-border/55 bg-background/75 p-4 text-left shadow-[0_26px_58px_-46px_hsl(222_37%_10%_/_0.45)] backdrop-blur-lg sm:p-6">
            <div className="mb-4 inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/[0.08] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-primary/85">
              Workspace messages
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="animate-icon-breath relative flex size-[78px] shrink-0 items-center justify-center rounded-[22px] bg-primary/[0.08] text-primary shadow-md ring-1 ring-primary/12">
                <MessageSquareDashed className="size-8" strokeWidth={1.35} />

                <span className="welcome-ring" />
                <span className="welcome-ring welcome-ring-2" />
                <span className="welcome-ring welcome-ring-3" />

                {ICON_PARTICLES.map(({ Icon, style }) => (
                  <span key={`${Icon.displayName || "icon"}-${style}`} className={style} aria-hidden="true">
                    <Icon className="size-full" />
                  </span>
                ))}
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <h1 className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150 text-[1.35rem] font-bold leading-tight tracking-tight text-foreground sm:text-[1.6rem]">
                  Pick up where you left off
                </h1>
                <p className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 max-w-[38ch] text-[13px] leading-relaxed text-muted-foreground/80 sm:text-[13.5px]">
                  Continue your latest thread, open a new chat, or spin up a focused group in seconds.
                </p>
              </div>
            </div>

            <div className="animate-in fade-in duration-700 delay-350 mt-5 flex flex-wrap items-center gap-2">
              {FEATURE_PILLS.map(({ label, Icon }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full border border-border/45 bg-muted/35 px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground/80 backdrop-blur-sm"
                >
                  <Icon className="size-3" aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-1 duration-500 delay-500 mt-5 flex flex-wrap items-center gap-2.5">
              {latestConversation && (
                <button
                  type="button"
                  onClick={handleResumeLatestConversation}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold",
                    "bg-foreground text-background shadow-sm",
                    "hover:bg-foreground/90 active:scale-[0.97]",
                    "transition-all duration-150",
                  )}
                >
                  <MessageCircle className="size-3.5" />
                  Resume Latest
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenNewDirectChat}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold",
                  "bg-primary text-primary-foreground shadow-sm",
                  "hover:bg-primary/90 active:scale-[0.97]",
                  "transition-all duration-150",
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
                  "border border-border/55 bg-background/75 text-foreground/90",
                  "hover:border-border hover:bg-muted/65 hover:text-foreground active:scale-[0.97]",
                  "transition-all duration-150",
                )}
              >
                <Users className="size-3.5" />
                New Group
              </button>
            </div>

            <div className="animate-in fade-in duration-700 delay-600 mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border/45 bg-background/70 px-2.5 py-1 text-[10.5px] font-semibold tracking-wide text-muted-foreground/70">
                {conversations.length} {conversationLabel}
              </span>
              <span className="rounded-full border border-border/45 bg-background/70 px-2.5 py-1 text-[10.5px] font-medium tracking-wide text-muted-foreground/70">
                {directConvos.length} direct
              </span>
              <span className="rounded-full border border-border/45 bg-background/70 px-2.5 py-1 text-[10.5px] font-medium tracking-wide text-muted-foreground/70">
                {groupConvos.length} group
              </span>
            </div>

            <div className="animate-in fade-in duration-700 delay-700 mt-4 flex flex-wrap items-center gap-2">
              {PRODUCTIVITY_SHORTCUTS.map(({ label, hint, Icon }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground/85"
                >
                  <Icon className="size-3" aria-hidden="true" />
                  <span>{label}</span>
                  <span className="rounded-full border border-border/60 bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold text-foreground/80">
                    {hint}
                  </span>
                </span>
              ))}
            </div>
          </section>

          <aside className="rounded-[1.2rem] border border-border/55 bg-background/78 p-3.5 text-left shadow-[0_22px_42px_-40px_hsl(222_37%_10%_/_0.44)] backdrop-blur-lg sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-foreground/90">Jump back in</h2>
              <span className="rounded-full border border-border/55 bg-muted/40 px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground/80">
                {recentConversations.length}
              </span>
            </div>

            <div className="space-y-2">
              {recentConversations.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/70 bg-muted/25 px-3 py-3 text-[12px] leading-relaxed text-muted-foreground/80">
                  No recent conversations yet. Start a direct message to build your quick list.
                </div>
              )}

              {recentConversations.map((conversation) => {
                const conversationId = String(conversation._id);
                const unread = resolveConversationUnread(conversation, userId);

                return (
                  <button
                    key={conversationId}
                    type="button"
                    onClick={() => {
                      void handleOpenConversation(conversationId);
                    }}
                    className="group flex w-full items-center justify-between gap-2 rounded-xl border border-border/55 bg-background/70 px-2.5 py-2 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.06]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-muted-foreground/85">
                        {conversation.type === "group" ? (
                          <Users className="size-3.5" aria-hidden="true" />
                        ) : (
                          <MessageCircle className="size-3.5" aria-hidden="true" />
                        )}
                      </span>

                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-foreground/95">
                          {resolveConversationName(conversation, userId)}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground/75">
                          {resolveConversationPreview(conversation)}
                        </p>
                      </div>
                    </div>

                    {unread > 0 ? (
                      <span className="inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        {Math.min(unread, 99)}
                      </span>
                    ) : (
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/55 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>

      {/* New Direct Chat Modal */}
      <Dialog open={showNewDirect} onOpenChange={setShowNewDirect}>
        <FriendListModal />
      </Dialog>

      {/* New Group Modal */}
      <NewGroupChatModal
        isOpen={showNewGroup}
        onClose={() => setShowNewGroup(false)}
      />
    </SidebarInset>
  );
};

export default ChatWelcomeScreen;

