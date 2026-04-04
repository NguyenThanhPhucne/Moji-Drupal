import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import { useChatStore } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import FriendListModal from "../createNewChat/FriendListModal";
import NewGroupChatModal from "./NewGroupChatModal";
import GlobalSearchDialog from "./GlobalSearchDialog";
import { MessageCircleMore, Search, Users } from "lucide-react";

/* ── Direct chat card — opens FriendListModal inline ── */
function NewDirectChatCard() {
  const { getFriends } = useFriendStore();
  return (
    <Dialog onOpenChange={(open) => { if (open) getFriends(); }}>
      <DialogTrigger asChild>
        <button type="button" className="welcome-action-card">
          <div className="welcome-action-icon welcome-action-icon--primary">
            <MessageCircleMore className="size-5" />
          </div>
          <div className="welcome-action-text">
            <span className="welcome-action-title">New Message</span>
            <span className="welcome-action-desc">Start a direct chat</span>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Start a Conversation</DialogTitle>
          <DialogDescription>Choose a friend to message</DialogDescription>
        </DialogHeader>
        <FriendListModal />
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════════════════════════════════════════ */
const ChatWelcomeScreen = () => {
  const { conversations } = useChatStore();
  const hasConversations = conversations.length > 0;

  return (
    <SidebarInset className="flex h-full w-full overflow-hidden rounded-3xl border border-border/70 bg-background/80 shadow-soft backdrop-blur-sm">
      <ChatWindowHeader />

      {/* GlobalSearchDialog is always mounted (manages Ctrl+K itself) */}
      <GlobalSearchDialog />

      <div className="welcome-screen-root">
        {/* Animated background orbs */}
        <div className="welcome-orb welcome-orb--1" />
        <div className="welcome-orb welcome-orb--2" />
        <div className="welcome-orb welcome-orb--3" />

        {/* Center content */}
        <div className="welcome-content">
          {/* Animated icon */}
          <div className="welcome-icon-wrap">
            <div className="welcome-icon-ring" />
            <div className="welcome-icon-inner">
              <MessageCircleMore className="size-10 text-white drop-shadow" />
            </div>
          </div>

          {/* Heading */}
          <h1 className="welcome-title">Welcome to Moji</h1>
          <p className="welcome-subtitle">
            {hasConversations
              ? "Select a conversation from the sidebar to continue"
              : "Connect with friends and start meaningful conversations"}
          </p>

          {/* Quick action cards */}
          <div className="welcome-actions">
            <NewDirectChatCard />

            {/* Search — renders its own DialogTrigger via keyboard shortcut,
                we render a visible card that simulates clicking Ctrl+K    */}
            <button
              type="button"
              className="welcome-action-card"
              onClick={() => {
                // Trigger the existing GlobalSearchDialog keyboard shortcut handler
                window.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
                );
              }}
            >
              <div className="welcome-action-icon welcome-action-icon--secondary">
                <Search className="size-5" />
              </div>
              <div className="welcome-action-text">
                <span className="welcome-action-title">Search</span>
                <span className="welcome-action-desc">Find messages &amp; people</span>
              </div>
            </button>

            {/* New Group — NewGroupChatModal wraps its own trigger button internally,
                so we give it a wrapper card that acts as the trigger */}
            <Dialog>
              <DialogTrigger asChild>
                <button type="button" className="welcome-action-card">
                  <div className="welcome-action-icon welcome-action-icon--accent">
                    <Users className="size-5" />
                  </div>
                  <div className="welcome-action-text">
                    <span className="welcome-action-title">New Group</span>
                    <span className="welcome-action-desc">Create a group chat</span>
                  </div>
                </button>
              </DialogTrigger>
              {/* Render NewGroupChatModal in a passthrough Dialog */}
              <NewGroupChatModal />
            </Dialog>
          </div>

          {/* Tip */}
          <p className="welcome-tip">
            💡 Tip: Press{" "}
            <kbd className="welcome-kbd">Ctrl</kbd>
            {" + "}
            <kbd className="welcome-kbd">K</kbd>
            {" to search anytime"}
          </p>
        </div>
      </div>
    </SidebarInset>
  );
};

export default ChatWelcomeScreen;
