import { Bell, Home, MessageCircle, Search, Users2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMiniChatDockStore } from "@/stores/useMiniChatDockStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useChatStore } from "@/stores/useChatStore";

interface SocialTopHeaderProps {
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  metaBadges?: Array<{
    label: string;
    value: string;
  }>;
  keyboardHint?: string;
}

const SocialTopHeader = ({
  title,
  subtitle,
  searchPlaceholder = "Search on Moji",
  searchValue,
  onSearchValueChange,
  metaBadges = [],
  keyboardHint = "Ctrl + Shift + K",
}: SocialTopHeaderProps) => {
  const navigate = useNavigate();
  const [localSearchValue, setLocalSearchValue] = useState("");
  const { setIsHubOpen, unreadFriendRequestCount, unreadSocialCount } =
    useNotificationStore();
  const { windows, focusWindow } = useMiniChatDockStore();
  const { setActiveConversation } = useChatStore();

  const effectiveSearchValue =
    typeof searchValue === "string" ? searchValue : localSearchValue;

  const handleSearchChange = (value: string) => {
    if (typeof searchValue !== "string") {
      setLocalSearchValue(value);
    }
    onSearchValueChange?.(value);
  };

  const chatUnreadCount = useMemo(
    () => windows.reduce((sum, item) => sum + (item.unreadCount || 0), 0),
    [windows],
  );

  const notificationCount = unreadFriendRequestCount + unreadSocialCount;

  const openPreferredChat = useCallback(() => {
    if (!windows.length) {
      navigate("/");
      return;
    }

    const preferredWindow = [...windows].sort((a, b) => {
      if ((b.unreadCount || 0) !== (a.unreadCount || 0)) {
        return (b.unreadCount || 0) - (a.unreadCount || 0);
      }

      return Number(b.pinned) - Number(a.pinned);
    })[0];

    if (!preferredWindow) {
      navigate("/");
      return;
    }

    focusWindow(preferredWindow.userId);
    if (preferredWindow.conversationId) {
      setActiveConversation(preferredWindow.conversationId);
    }
    navigate("/");
  }, [focusWindow, navigate, setActiveConversation, windows]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        Boolean(target?.isContentEditable);

      if (isTypingTarget) {
        return;
      }

      const pressedShortcut =
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "k";

      if (!pressedShortcut) {
        return;
      }

      event.preventDefault();
      openPreferredChat();
    };

    globalThis.window.addEventListener("keydown", onKeyDown);
    return () => {
      globalThis.window.removeEventListener("keydown", onKeyDown);
    };
  }, [openPreferredChat]);

  return (
    <header className="social-topbar social-topbar--command social-card">
      <div className="social-topbar-main">
        <div className="social-topbar-brand">
          <div className="social-topbar-title-row">
            <h1 className="social-topbar-title">{title}</h1>
            <span className="social-topbar-context-pill" title="Enterprise workspace">
              Workspace
            </span>
          </div>
          {subtitle ? (
            <p className="social-topbar-subtitle">{subtitle}</p>
          ) : null}
        </div>

        <div className="social-topbar-search-wrap">
          <Search className="social-topbar-search-icon h-4 w-4" />
          <Input
            value={effectiveSearchValue}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="social-topbar-search-input h-10 border-0 pl-9"
            aria-label="Global social search"
          />
        </div>
      </div>

      <div className="social-topbar-actions">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="social-topbar-action-btn"
          aria-label="Go to home feed"
          onClick={() => navigate("/feed")}
        >
          <Home className="h-4.5 w-4.5" />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="social-topbar-action-btn"
          aria-label="Go to explore feed"
          onClick={() => navigate("/explore")}
        >
          <Users2 className="h-4.5 w-4.5" />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="social-topbar-action-btn social-topbar-action-btn--badge"
          aria-label="Open notifications"
          onClick={() => setIsHubOpen(true)}
        >
          <Bell className="h-4.5 w-4.5" />
          {notificationCount > 0 ? (
            <span className="social-topbar-badge">{notificationCount > 99 ? "99+" : notificationCount}</span>
          ) : null}
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="social-topbar-action-btn social-topbar-action-btn--badge"
          aria-label="Open chat"
          onClick={openPreferredChat}
        >
          <MessageCircle className="h-4.5 w-4.5" />
          {chatUnreadCount > 0 ? (
            <span className="social-topbar-badge">{chatUnreadCount > 99 ? "99+" : chatUnreadCount}</span>
          ) : null}
        </Button>
      </div>

      {(metaBadges.length > 0 || keyboardHint) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/55 pt-2">
          {metaBadges.length > 0 ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {metaBadges.map((badge) => (
                <span
                  key={`${badge.label}-${badge.value}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/35 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground/85"
                >
                  <span className="text-foreground/80">{badge.label}</span>
                  <span className="rounded-full border border-border/70 bg-background/85 px-1.5 py-[1px] text-[10px] font-bold text-foreground/85">
                    {badge.value}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <span />
          )}

          {keyboardHint ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/85 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/80">
              <span className="font-semibold text-foreground/75">Quick chat</span>
              <span>{keyboardHint}</span>
            </span>
          ) : null}
        </div>
      )}
    </header>
  );
};

export default SocialTopHeader;
