import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation, Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import {
  Reply,
  Smile,
  Trash2,
  Edit2,
  Copy,
  MoreHorizontal,
  Bookmark,
  Link2,
  ZoomIn,
  SendHorizontal,
  Lock,
  Unlock,
  Pin,
  Flag,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, memo, useMemo } from "react";
import { createPortal } from "react-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useBookmarkStore } from "@/stores/useBookmarkStore";
import { chatService, type LinkPreviewPayload } from "@/services/chatService";
import { useLinkPreviewStore } from "@/stores/useLinkPreviewStore";
import { safetyService } from "@/services/safetyService";
import UserAvatar from "./UserAvatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import ImageLightbox from "./ImageLightbox";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "👏"];

const URL_PATTERN = /(https?:\/\/[^\s]+)/i;
const MOBILE_CONTEXT_LONG_PRESS_MS = 420;
const TOUCH_MOVE_CANCEL_THRESHOLD_PX = 14;

type MessageActionHintKind = "neutral" | "success" | "error";

interface MessageActionHint {
  text: string;
  kind: MessageActionHintKind;
}

/* ---------- Date divider ---------- */
export function DateDivider({ date }: Readonly<{ date: Date }>) {
  let label: string;
  if (isToday(date)) label = "Today";
  else if (isYesterday(date)) label = "Yesterday";
  else label = format(date, "MMM d, yyyy");

  return (
    <div className="flex items-center gap-3 my-3 px-2 select-none">
      <div className="flex-1 h-px bg-border/30" />
      <span className="date-divider-pill">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/30" />
    </div>
  );
}


/* ---------- Reaction summary bar ---------- */
const ReactionBar = memo(function ReactionBar({
  reactions,
  onReact,
  isOwn,
}: {
  reactions: NonNullable<Message["reactions"]>;
  onReact: (emoji: string) => void;
  isOwn: boolean;
}) {
  const grouped: Record<string, number> = {};
  for (const r of reactions) grouped[r.emoji] = (grouped[r.emoji] ?? 0) + 1;
  if (Object.keys(grouped).length === 0) return null;
  return (
    <div
      className={cn(
        "chat-reaction-bar-root",
        isOwn ? "chat-reaction-bar-root--own" : "chat-reaction-bar-root--peer",
      )}
    >
      {Object.entries(grouped).map(([emoji, count]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          className={cn(
            "chat-reaction-bar-item",
            isOwn ? "chat-reaction-bar-item--own" : "chat-reaction-bar-item--peer",
          )}
        >
          <span>{emoji}</span>
          <span className="chat-reaction-bar-count">{count}</span>
        </button>
      ))}
    </div>
  );
});

/* ---------- Quick reaction hover bar ---------- */
const QuickReactBar = memo(function QuickReactBar({
  onReact,
  visible,
}: {
  onReact: (e: string) => void;
  visible: boolean;
}) {
  return (
    <div
      className={cn(
        "chat-quick-react-bar",
        visible
          ? "chat-quick-react-bar--visible"
          : "chat-quick-react-bar--hidden",
      )}
    >
      {QUICK_REACTIONS.map((em) => (
        <button
          key={em}
          type="button"
          onClick={() => onReact(em)}
          className="chat-quick-react-item"
        >
          {em}
        </button>
      ))}
    </div>
  );
});

/* ---------- Context menu ---------- */
const ContextMenu = memo(function ContextMenu({ // NOSONAR
  x,
  y,
  isOwn,
  isDeleted,
  canEdit,
  canPinMessage,
  isPinned,
  isForwardable,
  onForward,
  onToggleForwardable,
  onTogglePin,
  onReply,
  onCopy,
  onEdit,
  canReport,
  onReport,
  onOpenDeleteDialog,
  onClose,
}: {
  x: number;
  y: number;
  isOwn: boolean;
  isDeleted: boolean;
  canEdit: boolean;
  canPinMessage?: boolean;
  isPinned?: boolean;
  isForwardable: boolean;
  onForward: () => void;
  onToggleForwardable?: () => void;
  onTogglePin?: () => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  canReport?: boolean;
  onReport?: () => void;
  onOpenDeleteDialog: () => void;
  onClose: () => void;
}) {
  const items = [
    { icon: Reply, label: "Reply", onClick: onReply },
    { icon: Copy, label: "Copy", onClick: onCopy, disabled: isDeleted },
    { icon: SendHorizontal, label: "Forward", onClick: onForward, disabled: isDeleted || (!isForwardable && !isOwn) },
    ...(isOwn && canEdit && !isDeleted
      ? [{ icon: Edit2, label: "Edit", onClick: onEdit }]
      : []),
    ...(isOwn && onToggleForwardable && !isDeleted
      ? [{ icon: isForwardable ? Lock : Unlock, label: isForwardable ? "Disable forwarding" : "Allow forwarding", onClick: onToggleForwardable }]
      : []),
    ...(canPinMessage && onTogglePin && !isDeleted
      ? [{ icon: Pin, label: isPinned ? "Unpin message" : "Pin message", onClick: onTogglePin }]
      : []),
    ...(canReport && onReport && !isDeleted
      ? [{ icon: Flag, label: "Report", onClick: onReport }]
      : []),
    ...(isDeleted
      ? []
      : [
          {
            icon: Trash2,
            label: isOwn ? "Remove / Unsend..." : "Remove for me",
            onClick: onOpenDeleteDialog,
            danger: true,
          },
        ]),
  ];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="chat-context-menu-backdrop">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="chat-context-menu-dismiss"
      />
      <div
        role="menu"
        style={{ left: x, top: y }}
        className="chat-context-menu chat-context-menu--floating animate-in zoom-in-95 fade-in duration-100"
      >
        {items.map(({ icon: Icon, label, onClick, disabled, danger }) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
            onClick={() => {
              onClick();
              onClose();
            }}
            className={cn(
              "chat-context-menu-item",
              danger && "chat-context-menu-item--danger",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
});

const SeenStatus = memo(function SeenStatus({
  isOwn,
  selectedConvoType,
  isSeenAnchorMessage,
  lastMessageStatus,
  seenUser,
  seenUsers,
  visibleSeenUsers,
  remainingSeenUsersCount,
  hiddenSeenUserNames,
  tooltipDelay,
  reduceMotion,
  seenJustUpdated,
  seenUsersStackKey,
}: {
  isOwn: boolean;
  selectedConvoType: Conversation["type"];
  isSeenAnchorMessage: boolean;
  lastMessageStatus: "delivered" | "seen";
  seenUser?: {
    _id: string;
    displayName?: string;
    avatarUrl?: string | null;
  } | null;
  seenUsers: Array<{
    _id: string;
    displayName?: string;
    avatarUrl?: string | null;
  }>;
  visibleSeenUsers: Array<{
    _id: string;
    displayName?: string;
    avatarUrl?: string | null;
  }>;
  remainingSeenUsersCount: number;
  hiddenSeenUserNames: string;
  tooltipDelay: number;
  reduceMotion: boolean;
  seenJustUpdated: boolean;
  seenUsersStackKey: string;
}) {
  if (!isSeenAnchorMessage || lastMessageStatus !== "seen") {
    return null;
  }

  return (
    <div
      className={cn(
        "chat-seen-status",
        !reduceMotion &&
          seenJustUpdated &&
          "animate-in zoom-in-95 fade-in-0 duration-300",
      )}
    >
      <span
        className={cn(
          "transition-all duration-300",
          reduceMotion && "transition-none",
          seenJustUpdated && "text-primary font-semibold",
        )}
      >
        Seen
      </span>

      {selectedConvoType === "direct" &&
        seenUser &&
        (seenUser.avatarUrl ? (
          <Tooltip delayDuration={tooltipDelay}>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <img
                  src={seenUser.avatarUrl}
                  alt={seenUser.displayName || "Seen user"}
                  className="size-3.5 rounded-full border border-border/70 object-cover"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent
              side={isOwn ? "left" : "right"}
              sideOffset={6}
              collisionPadding={12}
            >
              {seenUser.displayName || "Seen user"}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip delayDuration={tooltipDelay}>
            <TooltipTrigger asChild>
              <span className="size-3.5 rounded-full bg-muted border border-border/70 text-[8px] leading-none flex items-center justify-center text-muted-foreground font-semibold">
                {(seenUser.displayName || "?")[0].toUpperCase()}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side={isOwn ? "left" : "right"}
              sideOffset={6}
              collisionPadding={12}
            >
              {seenUser.displayName || "Seen user"}
            </TooltipContent>
          </Tooltip>
        ))}

      {selectedConvoType === "group" && seenUsers.length > 0 && (
        <div
          key={seenUsersStackKey}
          className={cn(
            "flex items-center ml-0.5 animate-in fade-in-0 zoom-in-95 duration-200",
            reduceMotion && "animate-none",
            !reduceMotion &&
              seenJustUpdated &&
              "animate-in slide-in-from-bottom-1 duration-300",
          )}
        >
          {visibleSeenUsers.map((groupSeenUser, avatarIndex) => (
            <Tooltip key={groupSeenUser._id} delayDuration={tooltipDelay}>
              <TooltipTrigger asChild>
                {groupSeenUser.avatarUrl ? (
                  <span
                    className={cn(
                      "inline-flex transition-all duration-200 motion-reduce:transition-none",
                      avatarIndex > 0 && "-ml-1",
                    )}
                  >
                    <img
                      src={groupSeenUser.avatarUrl}
                      alt={groupSeenUser.displayName || "Seen member"}
                      className="size-3.5 rounded-full border border-background object-cover"
                    />
                  </span>
                ) : (
                  <span
                    className={cn(
                      "size-3.5 rounded-full bg-muted border border-background text-[8px] leading-none flex items-center justify-center text-muted-foreground font-semibold transition-all duration-200 motion-reduce:transition-none",
                      avatarIndex > 0 && "-ml-1",
                    )}
                  >
                    {(groupSeenUser.displayName || "?")[0].toUpperCase()}
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent
                side={isOwn ? "left" : "right"}
                sideOffset={6}
                collisionPadding={12}
              >
                {groupSeenUser.displayName || "Seen member"}
              </TooltipContent>
            </Tooltip>
          ))}

          {remainingSeenUsersCount > 0 && (
            <Tooltip delayDuration={tooltipDelay}>
              <TooltipTrigger asChild>
                <span className="ml-1 text-[10px] sm:text-[11px] text-muted-foreground/90 font-medium tabular-nums cursor-default">
                  +{remainingSeenUsersCount}
                </span>
              </TooltipTrigger>
              <TooltipContent
                side={isOwn ? "left" : "right"}
                sideOffset={6}
                collisionPadding={12}
                className="max-w-[240px] leading-relaxed"
              >
                {hiddenSeenUserNames || "Other members have seen this"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
});

function useMessageMotionPrefs() {
  const [tooltipDelay, setTooltipDelay] = useState(120);
  const [maxSeenAvatars, setMaxSeenAvatars] = useState(3);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (!globalThis.window || typeof globalThis.window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = globalThis.window.matchMedia("(pointer: coarse)");
    const viewportQuery = globalThis.window.matchMedia("(max-width: 640px)");
    const motionQuery = globalThis.window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateTooltipDelay = () => {
      setTooltipDelay(mediaQuery.matches ? 360 : 120);
    };
    const updateSeenAvatarLimit = () => {
      setMaxSeenAvatars(viewportQuery.matches ? 2 : 3);
    };
    const updateReduceMotion = () => {
      setReduceMotion(motionQuery.matches);
    };

    updateTooltipDelay();
    updateSeenAvatarLimit();
    updateReduceMotion();
    mediaQuery.addEventListener("change", updateTooltipDelay);
    viewportQuery.addEventListener("change", updateSeenAvatarLimit);
    motionQuery.addEventListener("change", updateReduceMotion);

    return () => {
      mediaQuery.removeEventListener("change", updateTooltipDelay);
      viewportQuery.removeEventListener("change", updateSeenAvatarLimit);
      motionQuery.removeEventListener("change", updateReduceMotion);
    };
  }, []);

  return { tooltipDelay, maxSeenAvatars, reduceMotion };
}

function useSeenStatusPulse({
  lastMessageStatus,
  isSeenAnchorMessage,
  reduceMotion,
}: {
  lastMessageStatus: "delivered" | "seen";
  isSeenAnchorMessage: boolean;
  reduceMotion: boolean;
}) {
  const [seenJustUpdated, setSeenJustUpdated] = useState(false);
  const lastStatusRef = useRef<"delivered" | "seen">(lastMessageStatus);

  useEffect(() => {
    const wasDelivered = lastStatusRef.current === "delivered";
    const becameSeen = lastMessageStatus === "seen";

    if (isSeenAnchorMessage && wasDelivered && becameSeen) {
      setSeenJustUpdated(true);
      const timer = globalThis.setTimeout(
        () => setSeenJustUpdated(false),
        reduceMotion ? 0 : 700,
      );
      lastStatusRef.current = lastMessageStatus;
      return () => globalThis.clearTimeout(timer);
    }

    if (lastMessageStatus !== "seen") {
      setSeenJustUpdated(false);
    }

    lastStatusRef.current = lastMessageStatus;
    return undefined;
  }, [isSeenAnchorMessage, lastMessageStatus, reduceMotion]);

  return seenJustUpdated;
}

const MessageActionToolbar = memo(function MessageActionToolbar({
  editMode,
  isOwn,
  actionBarVisible,
  hiddenActionOffsetClass,
  reactBarVisible,
  bookmarked,
  onReact,
  onToggleReactBar,
  onReply,
  onToggleBookmark,
  onOpenContext,
}: {
  editMode: boolean;
  isOwn: boolean;
  actionBarVisible: boolean;
  hiddenActionOffsetClass: string;
  reactBarVisible: boolean;
  bookmarked: boolean;
  onReact: (emoji: string) => void;
  onToggleReactBar: () => void;
  onReply: () => void;
  onToggleBookmark: () => void;
  onOpenContext: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  if (editMode) {
    return null;
  }

  return (
    <div
      className={cn(
        "chat-message-action-toolbar absolute top-1/2 -translate-y-1/2 flex items-center gap-1 z-30 transition-all duration-150 motion-reduce:transition-none",
        isOwn
          ? "right-[calc(100%+0.35rem)]"
          : "left-[calc(100%+0.35rem)]",
        actionBarVisible
          ? "opacity-100 scale-100 pointer-events-auto"
          : cn("opacity-0 scale-95 pointer-events-none", hiddenActionOffsetClass),
      )}
    >
      <div className="relative">
        {reactBarVisible && (
          <QuickReactBar onReact={onReact} visible={true} />
        )}
        <button
          type="button"
          onClick={onToggleReactBar}
          aria-label="Add reaction"
          className="chat-message-action-btn chat-message-action-btn--icon"
        >
          <Smile className="size-3.5 text-muted-foreground" />
        </button>
      </div>
      <button
        type="button"
        onClick={onReply}
        aria-label="Reply"
        className="chat-message-action-btn chat-message-action-btn--icon"
      >
        <Reply className="size-3.5 text-muted-foreground" />
      </button>
      <button
        type="button"
        onClick={onToggleBookmark}
        aria-label={bookmarked ? "Remove bookmark" : "Save message"}
        className={cn(
          "chat-message-action-btn chat-message-action-btn--icon",
          bookmarked && "chat-bookmark-active",
        )}
      >
        <Bookmark
          className={cn("size-3.5", bookmarked && "fill-current")}
        />
      </button>
      <button
        type="button"
        onClick={onOpenContext}
        aria-label="Open message actions"
        className="chat-message-action-btn chat-message-action-btn--icon"
      >
        <MoreHorizontal className="size-3.5 text-muted-foreground" />
      </button>
    </div>
  );
});

const MessageMetaSection = memo(function MessageMetaSection({
  message,
  isOwn,
  onReact,
  actionHint,
  selectedConvoType,
  isSeenAnchorMessage,
  lastMessageStatus,
  seenUser,
  seenUsers,
  visibleSeenUsers,
  remainingSeenUsersCount,
  hiddenSeenUserNames,
  tooltipDelay,
  reduceMotion,
  seenJustUpdated,
  seenUsersStackKey,
}: {
  message: Message;
  isOwn: boolean;
  onReact: (emoji: string) => void;
  actionHint: MessageActionHint | null;
  selectedConvoType: Conversation["type"];
  isSeenAnchorMessage: boolean;
  lastMessageStatus: "delivered" | "seen";
  seenUser?: {
    _id: string;
    displayName?: string;
    avatarUrl?: string | null;
  } | null;
  seenUsers: Array<{
    _id: string;
    displayName?: string;
    avatarUrl?: string | null;
  }>;
  visibleSeenUsers: Array<{
    _id: string;
    displayName?: string;
    avatarUrl?: string | null;
  }>;
  remainingSeenUsersCount: number;
  hiddenSeenUserNames: string;
  tooltipDelay: number;
  reduceMotion: boolean;
  seenJustUpdated: boolean;
  seenUsersStackKey: string;
}) {
  return (
    <>
      <ReactionBar
        reactions={message.isDeleted ? [] : (message.reactions ?? [])}
        onReact={onReact}
        isOwn={isOwn}
      />

      <div
        className={cn(
          "flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1 px-0.5 sm:px-1",
          "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150",
          isOwn ? "flex-row-reverse" : "flex-row",
        )}
      >
        {message.editedAt && !message.isDeleted && (
          <span className="text-[10px] sm:text-[11px] text-muted-foreground/70 italic leading-none">
            edited
          </span>
        )}
        <span className="flex items-center gap-1 text-[10px] sm:text-[11px] text-muted-foreground/70 font-medium tabular-nums tracking-wide leading-none">
          {message.isForwardable === false && !message.isDeleted && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Lock className="size-2.5 text-muted-foreground/60" />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[10px] py-1 px-2">
                Forwarding disabled
              </TooltipContent>
            </Tooltip>
          )}
          {format(new Date(message.createdAt), "HH:mm")}
        </span>
      </div>

      {actionHint && (
        <div
          className={cn(
            "chat-message-action-hint",
            `chat-message-action-hint--${actionHint.kind}`,
            isOwn ? "self-end text-right" : "self-start text-left",
          )}
        >
          {actionHint.text}
        </div>
      )}

      <SeenStatus
        isOwn={isOwn}
        selectedConvoType={selectedConvoType}
        isSeenAnchorMessage={isSeenAnchorMessage}
        lastMessageStatus={lastMessageStatus}
        seenUser={seenUser}
        seenUsers={seenUsers}
        visibleSeenUsers={visibleSeenUsers}
        remainingSeenUsersCount={remainingSeenUsersCount}
        hiddenSeenUserNames={hiddenSeenUserNames}
        tooltipDelay={tooltipDelay}
        reduceMotion={reduceMotion}
        seenJustUpdated={seenJustUpdated}
        seenUsersStackKey={seenUsersStackKey}
      />
    </>
  );
});

const MessageBubbleSection = memo(function MessageBubbleSection({
  message,
  isOwn,
  selectedConvoType,
  isLastFromSender,
  senderDisplayName,
  bubbleNode,
  previewUrl,
  previewHost,
  linkPreview,
  editMode,
  actionBarVisible,
  hiddenActionOffsetClass,
  reactBarVisible,
  bookmarked,
  onReact,
  onToggleReactBar,
  onReply,
  onToggleBookmark,
  onOpenContext,
  metaNode,
}: {
  message: Message;
  isOwn: boolean;
  selectedConvoType: Conversation["type"];
  isLastFromSender: boolean;
  senderDisplayName?: string;
  bubbleNode: React.ReactNode;
  previewUrl: string | null;
  previewHost: string;
  linkPreview: LinkPreviewPayload | null;
  editMode: boolean;
  actionBarVisible: boolean;
  hiddenActionOffsetClass: string;
  reactBarVisible: boolean;
  bookmarked: boolean;
  onReact: (emoji: string) => void;
  onToggleReactBar: () => void;
  onReply: () => void;
  onToggleBookmark: () => void;
  onOpenContext: (event: React.MouseEvent<HTMLButtonElement>) => void;
  metaNode: React.ReactNode;
}) {
  const replyPreviewText = String(message.replyTo?.content || "").trim() || "Original message unavailable";

  return (
    <div
      className={cn(
        "flex flex-col max-w-[82%] sm:max-w-[75%] md:max-w-[65%]",
        isOwn ? "items-end" : "items-start",
      )}
    >
      {selectedConvoType === "group" && !isOwn && isLastFromSender && (
        <span className="text-[11px] text-muted-foreground mb-0.5 ml-1 font-medium">
          {senderDisplayName}
        </span>
      )}

      {message.replyTo && !message.isDeleted && (
        <div className={cn("chat-reply-preview", isOwn ? "chat-reply-preview--own" : "chat-reply-preview--peer")}>
          <p className="chat-reply-preview__label">Replied to</p>
          <p className="chat-reply-preview__text">{replyPreviewText}</p>
        </div>
      )}

      <div className="relative">
        <MessageActionToolbar
          editMode={editMode}
          isOwn={isOwn}
          actionBarVisible={actionBarVisible}
          hiddenActionOffsetClass={hiddenActionOffsetClass}
          reactBarVisible={reactBarVisible}
          bookmarked={bookmarked}
          onReact={onReact}
          onToggleReactBar={onToggleReactBar}
          onReply={onReply}
          onToggleBookmark={onToggleBookmark}
          onOpenContext={onOpenContext}
        />

        {bubbleNode}

        {!message.isDeleted && previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "chat-link-preview-card chat-link-preview-card--enterprise mt-1.5 block max-w-[320px] rounded-xl border border-border/70 bg-card/80 px-3 py-2.5 shadow-sm transition-colors hover:bg-card",
              isOwn ? "ml-auto" : "mr-auto",
            )}
          >
            <div className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary/85">
              <Link2 className="size-3" />
              Link Preview
            </div>

            {linkPreview?.image && (
              <img
                src={linkPreview.image}
                alt={linkPreview.title || "Link preview"}
                className="mb-2 h-28 w-full rounded-lg border border-border/60 object-cover"
              />
            )}

            <p className="line-clamp-2 text-sm font-semibold text-foreground">
              {linkPreview?.title || previewHost || previewUrl}
            </p>

            {linkPreview?.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {linkPreview.description}
              </p>
            )}

            <p className="mt-1 truncate text-[11px] text-muted-foreground/85">
              {linkPreview?.siteName || previewHost || previewUrl}
            </p>
          </a>
        )}
      </div>

      {metaNode}
    </div>
  );
});

/* ========== Main MessageItem ========== */
interface MessageItemProps {
  message: Message;
  index: number;
  prevSenderId?: string;
  nextSenderId?: string; // for cluster-aware bubble radius
  selectedConvo: Conversation;
  lastMessageStatus: "delivered" | "seen";
  lastOwnMessageId?: string | null;
  seenUser?: {
    _id: string;
    displayName?: string;
    avatarUrl?: string | null;
  } | null;
  seenUsers?: Array<{
    _id: string;
    displayName?: string;
    avatarUrl?: string | null;
  }>;
  showDateDivider?: boolean;
  isNew?: boolean; // only animate truly new messages
  onForward?: () => void;
  canPinMessage?: boolean;
  isPinned?: boolean;
  onTogglePin?: (messageId: string, willPin: boolean) => void;
}

const MessageItem = memo(function MessageItem({ // NOSONAR
  message,
  index,
  prevSenderId,
  nextSenderId,
  selectedConvo,
  lastMessageStatus,
  lastOwnMessageId,
  seenUser,
  seenUsers = [],
  showDateDivider,
  isNew = false,
  onForward,
  canPinMessage = false,
  isPinned = false,
  onTogglePin,
}: MessageItemProps) {
  const { user } = useAuthStore();
  const {
    reactToMessage,
    unsendMessage,
    removeMessageForMe,
    editMessage,
    setReplyingTo,
    toggleMessageForwardable,
    activeConversationId,
  } = useChatStore();
  const { isBookmarked, toggleBookmark } = useBookmarkStore();
  const { getPreview, setPreview } = useLinkPreviewStore();

  const [reactBarVisible, setReactBarVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editValue, setEditValue] = useState(message.content ?? "");
  const { tooltipDelay, maxSeenAvatars, reduceMotion } = useMessageMotionPrefs();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteActionLoading, setDeleteActionLoading] = useState<
    null | "for-me" | "for-everyone"
  >(null);
  const [linkPreview, setLinkPreview] = useState<LinkPreviewPayload | null>(
    null,
  );
  const [isMessageHovered, setIsMessageHovered] = useState(false);
  const [isBubblePressed, setIsBubblePressed] = useState(false);
  const [actionHint, setActionHint] = useState<MessageActionHint | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);
  const actionHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchPeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressContextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const skipBubbleClickRef = useRef(false);
  const isOwn = message.senderId === user?._id;
  const bookmarked = isBookmarked(message._id);

  const canEdit = isOwn;

  const isLastFromSender =
    index === 0 || prevSenderId !== String(message.senderId);


  const senderParticipant = selectedConvo.participants.find(
    (p) => p._id === message.senderId,
  );

  useEffect(() => {
    if (editMode) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editMode]);

  const showActionHint = useCallback(
    (text: string, kind: MessageActionHintKind = "neutral") => {
      setActionHint({ text, kind });

      if (actionHintTimerRef.current) {
        globalThis.clearTimeout(actionHintTimerRef.current);
      }

      actionHintTimerRef.current = globalThis.setTimeout(() => {
        setActionHint(null);
      }, 1300);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (actionHintTimerRef.current) {
        globalThis.clearTimeout(actionHintTimerRef.current);
      }
      if (touchPeekTimerRef.current) {
        globalThis.clearTimeout(touchPeekTimerRef.current);
      }
      if (longPressContextTimerRef.current) {
        globalThis.clearTimeout(longPressContextTimerRef.current);
      }
    };
  }, []);

  const clearLongPressContextTimer = useCallback(() => {
    if (longPressContextTimerRef.current) {
      globalThis.clearTimeout(longPressContextTimerRef.current);
      longPressContextTimerRef.current = null;
    }
  }, []);

  const handleReact = useCallback(
    async (emoji: string) => {
      if (!activeConversationId) return;
      await reactToMessage(activeConversationId, message._id, emoji);
      setReactBarVisible(false);
    },
    [activeConversationId, message._id, reactToMessage],
  );

  const handleDoubleClickBubble = useCallback(() => {
    if (message.isDeleted) {
      return;
    }

    void handleReact("❤️");
  }, [handleReact, message.isDeleted]);

  const handleOpenDeleteDialog = useCallback(() => {
    setContextMenu(null);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmRemoveForMe = useCallback(async () => {
    if (!activeConversationId) return;
    setDeleteActionLoading("for-me");
    try {
      await removeMessageForMe(activeConversationId, message._id);
      setDeleteDialogOpen(false);
    } catch {
      // Toast + rollback are handled inside the chat store.
    } finally {
      setDeleteActionLoading(null);
    }
  }, [activeConversationId, message._id, removeMessageForMe]);

  const handleConfirmUnsendForEveryone = useCallback(async () => {
    if (!activeConversationId || !isOwn) return;
    setDeleteActionLoading("for-everyone");
    try {
      await unsendMessage(activeConversationId, message._id);
      setDeleteDialogOpen(false);
    } catch {
      // Toast + rollback are handled inside the chat store.
    } finally {
      setDeleteActionLoading(null);
    }
  }, [activeConversationId, isOwn, message._id, unsendMessage]);

  const handleCopy = useCallback(async () => {
    if (!message.content) {
      return;
    }

    try {
      await navigator.clipboard.writeText(message.content);
      showActionHint("Copied", "success");
    } catch {
      showActionHint("Copy failed", "error");
    }
  }, [message.content, showActionHint]);

  const handleEditSave = useCallback(() => {
    const normalizedEditValue = editValue.trim();

    if (!normalizedEditValue || normalizedEditValue === message.content) {
      setEditMode(false);
      setEditValue(message.content ?? "");
      return;
    }

    if (!activeConversationId) {
      showActionHint("Unable to save right now", "error");
      return;
    }

    setEditValue(normalizedEditValue);
    setEditMode(false);

    editMessage(
      activeConversationId,
      message._id,
      normalizedEditValue,
    ).catch(() => {
      showActionHint("Edit not saved", "error");
    });
  }, [
    editValue,
    message.content,
    message._id,
    activeConversationId,
    editMessage,
    showActionHint,
  ]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const resolveContextMenuPosition = useCallback((rawX: number, rawY: number) => {
    const menuWidth = 176;
    const viewportPadding = 8;
    const safeAreaBottom =
      globalThis.CSS !== undefined &&
      typeof globalThis.CSS.supports === "function" &&
      globalThis.CSS.supports("padding-bottom: env(safe-area-inset-bottom)")
        ? 44
        : 8;

    const x = Math.max(
      viewportPadding,
      Math.min(rawX, globalThis.window.innerWidth - menuWidth - viewportPadding),
    );
    const y = Math.max(
      viewportPadding,
      Math.min(rawY, globalThis.window.innerHeight - 220 - safeAreaBottom),
    );

    return { x, y };
  }, []);

  const handleOpenContextFromButton = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = e.currentTarget.getBoundingClientRect();
      const rawX = isOwn ? rect.left - 176 + rect.width : rect.right;
      const rawY = rect.bottom + 6;

      setContextMenu(resolveContextMenuPosition(rawX, rawY));
    },
    [isOwn, resolveContextMenuPosition],
  );

  const handleCloseContext = useCallback(() => setContextMenu(null), []);
  const handleDeleteDialogOpenChange = useCallback(
    (open: boolean) => {
      if (deleteActionLoading) return;
      setDeleteDialogOpen(open);
    },
    [deleteActionLoading],
  );
  const handleEnterEditMode = useCallback(() => setEditMode(true), []);
  const handleReply = useCallback(
    () => {
      setReplyingTo(message);
      setContextMenu(null);
    },
    [message, setReplyingTo],
  );

  const handleForward = useCallback(() => {
    if (onForward) onForward();
    setContextMenu(null);
  }, [onForward]);

  const handleToggleForwardable = useCallback(async () => {
    if (!message._id || message.isForwardable === undefined) return;
    try {
      await toggleMessageForwardable(message._id, !message.isForwardable);
      showActionHint(
        message.isForwardable ? "Forwarding disabled" : "Forwarding enabled",
        "success",
      );
    } catch {
      showActionHint("Could not update privacy", "error");
    }
    setContextMenu(null);
  }, [message._id, message.isForwardable, toggleMessageForwardable, showActionHint]);

  const handleTogglePin = useCallback(() => {
    if (!onTogglePin || !message._id || message.isDeleted) {
      return;
    }

    onTogglePin(message._id, !isPinned);
    setContextMenu(null);
  }, [isPinned, message._id, message.isDeleted, onTogglePin]);

  const handleToggleBookmark = useCallback(async () => {
    const result = await toggleBookmark(message._id);
    if (!result.ok) {
      showActionHint("Bookmark failed", "error");
      return;
    }

    showActionHint(
      result.bookmarked ? "Saved to bookmarks" : "Bookmark removed",
      "success",
    );
  }, [message._id, toggleBookmark, showActionHint]);

  const handleReportMessage = useCallback(async () => {
    if (isOwn || message.isDeleted) {
      return;
    }

    try {
      await safetyService.createReport({
        targetType: "message",
        targetId: message._id,
        reason: "harassment",
      });
      showActionHint("Report submitted", "success");
    } catch {
      showActionHint("Could not submit report", "error");
    }

    setContextMenu(null);
  }, [isOwn, message._id, message.isDeleted, showActionHint]);

  const handleTouchPeekActions = useCallback(() => {
    setIsMessageHovered(true);
    if (touchPeekTimerRef.current) {
      globalThis.clearTimeout(touchPeekTimerRef.current);
    }

    touchPeekTimerRef.current = globalThis.setTimeout(() => {
      setIsMessageHovered(false);
    }, 1200);
  }, []);

  const handleBubbleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLButtonElement>) => {
      handleTouchPeekActions();

      const touchPoint = event.touches?.[0];
      if (!touchPoint) {
        return;
      }

      const touchX = touchPoint.clientX;
      const touchY = touchPoint.clientY;
      touchStartPointRef.current = { x: touchX, y: touchY };

      clearLongPressContextTimer();
      longPressContextTimerRef.current = globalThis.setTimeout(() => {
        skipBubbleClickRef.current = true;
        setReactBarVisible(false);
        setContextMenu(resolveContextMenuPosition(touchX, touchY));
      }, MOBILE_CONTEXT_LONG_PRESS_MS);
    },
    [clearLongPressContextTimer, handleTouchPeekActions, resolveContextMenuPosition],
  );

  const handleBubbleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLButtonElement>) => {
      const startPoint = touchStartPointRef.current;
      const touchPoint = event.touches?.[0];

      if (!startPoint || !touchPoint) {
        return;
      }

      const movedX = Math.abs(touchPoint.clientX - startPoint.x);
      const movedY = Math.abs(touchPoint.clientY - startPoint.y);

      if (
        movedX > TOUCH_MOVE_CANCEL_THRESHOLD_PX ||
        movedY > TOUCH_MOVE_CANCEL_THRESHOLD_PX
      ) {
        clearLongPressContextTimer();
      }
    },
    [clearLongPressContextTimer],
  );

  const handleBubbleTouchEnd = useCallback(() => {
    clearLongPressContextTimer();
    touchStartPointRef.current = null;
    setIsBubblePressed(false);
  }, [clearLongPressContextTimer]);

  const handleBubbleTouchCancel = useCallback(() => {
    clearLongPressContextTimer();
    touchStartPointRef.current = null;
    setIsBubblePressed(false);
  }, [clearLongPressContextTimer]);

  const handleBubbleClick = useCallback(() => {
    if (skipBubbleClickRef.current) {
      skipBubbleClickRef.current = false;
      return;
    }

    if (message.imgUrl && !message.isDeleted) {
      setLightboxOpen(true);
    }
  }, [message.imgUrl, message.isDeleted]);

  const isSeenAnchorMessage =
    isOwn && !!lastOwnMessageId && message._id === lastOwnMessageId;
  const seenJustUpdated = useSeenStatusPulse({
    lastMessageStatus,
    isSeenAnchorMessage,
    reduceMotion,
  });

  const messageText = message.content ?? "";
  const urlMatch = URL_PATTERN.exec(messageText);
  const previewUrl = urlMatch?.[1] ?? null;
  const previewHost = useMemo(() => {
    if (!previewUrl) {
      return "";
    }

    try {
      return new URL(previewUrl).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }, [previewUrl]);

  useEffect(() => {
    if (!previewUrl) {
      setLinkPreview(null);
      return;
    }

    const cachedPreview = getPreview(previewUrl);
    if (cachedPreview) {
      setLinkPreview(cachedPreview);
      return;
    }

    let cancelled = false;

    const loadPreview = async () => {
      try {
        const preview = await chatService.getLinkPreview(previewUrl);
        setPreview(previewUrl, preview);
        if (!cancelled) {
          setLinkPreview(preview);
        }
      } catch {
        if (!cancelled) {
          setLinkPreview({
            url: previewUrl,
            siteName: previewHost,
            title: previewHost || previewUrl,
            description: "Preview unavailable",
            image: "",
          });
        }
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [getPreview, previewHost, previewUrl, setPreview]);

  const seenUsersStackKey = useMemo(
    () => seenUsers.map((seen) => seen._id).join("-"),
    [seenUsers],
  );

  const visibleSeenUsers = useMemo(
    () => seenUsers.slice(0, maxSeenAvatars),
    [seenUsers, maxSeenAvatars],
  );

  const remainingSeenUsersCount = Math.max(
    0,
    seenUsers.length - maxSeenAvatars,
  );
  const hiddenSeenUsers = useMemo(
    () => seenUsers.slice(maxSeenAvatars),
    [seenUsers, maxSeenAvatars],
  );
  const hiddenSeenUserNames = useMemo(
    () =>
      hiddenSeenUsers
        .map((seenUserItem) => seenUserItem.displayName || seenUserItem._id)
        .join(", "),
    [hiddenSeenUsers],
  );

  const hiddenActionOffsetClass = isOwn ? "translate-x-1" : "-translate-x-1";
  const canOpenEditMode = isOwn && canEdit && !message.isDeleted;
  const actionBarVisible =
    isMessageHovered || reactBarVisible || Boolean(contextMenu);
  const wrapperClassName = cn(
    "flex gap-2 px-2 group relative",
    isOwn ? "flex-row-reverse" : "flex-row",
    isNew && "message-slide-in",
    isLastFromSender ? "pt-2 pb-[2px]" : "py-[2px]",
  );

  const hasOnlyImage = Boolean(message.imgUrl && !message.content && !message.isDeleted);



  const imageCornerClass = isOwn ? "rounded-br-[4px]" : "rounded-tl-[4px]";
  const senderId = String(message.senderId || "");
  const ownBubbleToneClass =
    "chat-bubble-sent chat-message-bubble-shell chat-message-bubble-shell--own";
  const peerBubbleToneClass =
    "chat-bubble-received chat-message-bubble-shell chat-message-bubble-shell--peer";
  const bubbleToneClass = isOwn ? ownBubbleToneClass : peerBubbleToneClass;

  const isPrevFromSameSender = String(prevSenderId || "") === senderId;
  const isNextFromSameSender = String(nextSenderId || "") === senderId;

  let bubbleClusterToken = "single";
  if (isPrevFromSameSender && isNextFromSameSender) {
    bubbleClusterToken = "middle";
  } else if (!isPrevFromSameSender && isNextFromSameSender) {
    bubbleClusterToken = "start";
  } else if (isPrevFromSameSender && !isNextFromSameSender) {
    bubbleClusterToken = "end";
  }

  const bubbleClusterClass = `chat-message-bubble-shell--cluster-${bubbleClusterToken}`;

  const renderReadOnlyBubble = () => (
    <div
      className={cn(
        "relative leading-[1.35] transition-colors duration-150 mt-0.5",
        hasOnlyImage
          ? "bg-transparent p-0 border-transparent shadow-none"
          : cn(
              "px-3.5 py-2.5",
              bubbleToneClass,
            ),
        !hasOnlyImage && "chat-message-bubble-surface",
        !hasOnlyImage && (isOwn
          ? "chat-message-bubble-surface--own"
          : "chat-message-bubble-surface--peer"),
        !hasOnlyImage && actionBarVisible && "chat-message-bubble-surface--actions-visible",
        bubbleClusterClass,
        message.isDeleted && "chat-message-bubble-shell--deleted opacity-50 italic",
        isBubblePressed && !message.isDeleted && "chat-message-bubble-shell--pressed",
        "select-text",
      )}
    >
      {message.isDeleted ? (
        <span className="text-sm">This message was removed</span>
      ) : (
        <>
          {isPinned && (
            <div
              className={cn(
                "mb-1 inline-flex items-center gap-1 text-[10px] font-semibold",
                isOwn ? "text-white/80" : "text-primary/85",
              )}
            >
              <Pin className="size-2.5" />
              Pinned
            </div>
          )}

          {message.forwardedFrom && (
            <div className="flex items-center gap-1.5 mb-1.5 text-[11.5px] opacity-80 border-b border-foreground/10 pb-1 font-medium">
              <SendHorizontal className="size-3" />
              <span>Forwarded from {message.forwardedFrom.displayName}</span>
            </div>
          )}
          {message.imgUrl && (
            <span
              className={cn("lightbox-thumb-btn block w-full relative", !hasOnlyImage && "mb-1")}
              aria-hidden="true"
            >
              <img 
                src={message.imgUrl} 
                alt={`Sent by ${senderParticipant?.displayName ?? "user"} at ${new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                className={cn(
                  "max-w-[240px] max-h-[320px] w-full object-cover shadow-sm",
                  hasOnlyImage 
                    ? cn(
                        "rounded-[20px] border-[0.5px] border-border/40",
                        imageCornerClass,
                      )
                    : "rounded-xl"
                )} 
              />
              <span className={cn("lightbox-thumb-overlay", hasOnlyImage && "rounded-[20px]")}>
                <ZoomIn className="size-5 text-white" />
              </span>
            </span>
          )}
          {message.content && (
            <p className="chat-message-content whitespace-pre-wrap break-words tracking-tight">{message.content}</p>
          )}
        </>
      )}
    </div>
  );

  const readOnlyBubbleNode = (
    <button
      type="button"
      onClick={handleBubbleClick}
      onDoubleClick={handleDoubleClickBubble}
      onContextMenu={handleContextMenu}
      onTouchStart={handleBubbleTouchStart}
      onTouchMove={handleBubbleTouchMove}
      onTouchEnd={handleBubbleTouchEnd}
      onTouchCancel={handleBubbleTouchCancel}
      onPointerDown={() => setIsBubblePressed(true)}
      onPointerUp={() => setIsBubblePressed(false)}
      onPointerLeave={() => setIsBubblePressed(false)}
      onPointerCancel={() => setIsBubblePressed(false)}
      aria-label="Message bubble"
      className={cn(
        "chat-message-bubble-hit text-left select-none relative p-0 m-0 border-0 bg-transparent",
        isBubblePressed && "chat-message-bubble-hit--pressed",
        !canOpenEditMode && "cursor-default",
      )}
    >
      {renderReadOnlyBubble()}
    </button>
  );

  const bubbleNode = editMode ? (
    <div className="flex gap-2 items-center min-w-[180px]">
      <input
        ref={editInputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleEditSave();
          }
          if (e.key === "Escape") {
            setEditMode(false);
            setEditValue(message.content ?? "");
          }
        }}
        className="chat-edit-input"
      />
      <button
        type="button"
        onClick={handleEditSave}
        className="chat-modal-btn chat-modal-btn--primary"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          setEditMode(false);
          setEditValue(message.content ?? "");
        }}
        className="chat-modal-btn chat-modal-btn--secondary"
      >
        Cancel
      </button>
    </div>
  ) : (
    readOnlyBubbleNode
  );

  return (
    <>
      <article
        className={wrapperClassName}
        onMouseEnter={() => setIsMessageHovered(true)}
        onMouseLeave={() => {
          setIsMessageHovered(false);
          setReactBarVisible(false);
          if (touchPeekTimerRef.current) {
            globalThis.clearTimeout(touchPeekTimerRef.current);
            touchPeekTimerRef.current = null;
          }
        }}
        onTouchStart={handleTouchPeekActions}
        onTouchCancel={() => setIsMessageHovered(false)}
      >
        {/* Avatar */}
        {!isOwn && (
          <div className="w-8 flex-shrink-0 self-end">
            {isLastFromSender && (
              <UserAvatar
                type="chat"
                name={senderParticipant?.displayName ?? "?"}
                avatarUrl={senderParticipant?.avatarUrl ?? undefined}
                className="size-8"
              />
            )}
          </div>
        )}

        <MessageBubbleSection
          message={message}
          isOwn={isOwn}
          selectedConvoType={selectedConvo.type}
          isLastFromSender={isLastFromSender}
          senderDisplayName={senderParticipant?.displayName}
          bubbleNode={bubbleNode}
          previewUrl={previewUrl}
          previewHost={previewHost}
          linkPreview={linkPreview}
          editMode={editMode}
          actionBarVisible={actionBarVisible}
          hiddenActionOffsetClass={hiddenActionOffsetClass}
          reactBarVisible={reactBarVisible}
          bookmarked={bookmarked}
          onReact={handleReact}
          onToggleReactBar={() => setReactBarVisible((v) => !v)}
          onReply={handleReply}
          onToggleBookmark={() => {
            void handleToggleBookmark();
          }}
          onOpenContext={handleOpenContextFromButton}
          metaNode={(
            <MessageMetaSection
              message={message}
              isOwn={isOwn}
              onReact={handleReact}
              selectedConvoType={selectedConvo.type}
              isSeenAnchorMessage={isSeenAnchorMessage}
              lastMessageStatus={lastMessageStatus}
              seenUser={seenUser}
              seenUsers={seenUsers}
              visibleSeenUsers={visibleSeenUsers}
              remainingSeenUsersCount={remainingSeenUsersCount}
              hiddenSeenUserNames={hiddenSeenUserNames}
              tooltipDelay={tooltipDelay}
              reduceMotion={reduceMotion}
              seenJustUpdated={seenJustUpdated}
              seenUsersStackKey={seenUsersStackKey}
              actionHint={actionHint}
            />
          )}
        />
      </article>

      {/* In a reverse column layout, render divider after item so it appears above messages visually. */}
      {showDateDivider && <DateDivider date={new Date(message.createdAt)} />}

      {/* Context Menu Portal */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isOwn={isOwn}
          isDeleted={!!message.isDeleted}
          canEdit={canEdit}
          canPinMessage={canPinMessage}
          isPinned={isPinned}
          isForwardable={message.isForwardable ?? true}
          onForward={handleForward}
          onToggleForwardable={handleToggleForwardable}
          onTogglePin={handleTogglePin}
          onReply={handleReply}
          onCopy={handleCopy}
          onEdit={handleEnterEditMode}
          canReport={!isOwn}
          onReport={handleReportMessage}
          onOpenDeleteDialog={handleOpenDeleteDialog}
          onClose={handleCloseContext}
        />
      )}

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={handleDeleteDialogOpenChange}
      >
        <DialogContent
          aria-describedby={undefined}
          className="chat-modal-shell max-w-md rounded-2xl p-6 gap-6 outline-none bg-background border border-border/50 shadow-2xl transition-all"
          showCloseButton={!deleteActionLoading}
          dismissible={!deleteActionLoading}
        >
          <DialogHeader className="items-center text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/12 ring-8 ring-destructive/10">
              <Trash2 className="size-6 text-destructive" />
            </div>
            <div className="space-y-1.5">
              <DialogTitle className="text-xl font-bold tracking-tight">
                Remove this message?
              </DialogTitle>
              <DialogDescription className="text-[15px] font-medium leading-relaxed text-muted-foreground/80 px-2">
                Choose the scope that fits your intent. Some participants may have
                already seen or forwarded this message.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="grid gap-3">
            {isOwn && (
              <button
                type="button"
                disabled={!!deleteActionLoading}
                onClick={handleConfirmUnsendForEveryone}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-destructive/30 bg-destructive/10 hover:bg-destructive/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed group"
              >
                <p className="text-[15px] font-semibold text-destructive">Unsend for everyone</p>
                <p className="mt-1.5 text-[13px] text-destructive/80 leading-relaxed font-medium">
                  This message will be removed for everyone in this chat. Others
                  may have already seen or forwarded it.
                </p>
                {deleteActionLoading === "for-everyone" && (
                  <p className="mt-2 text-xs font-semibold animate-pulse text-destructive">Processing...</p>
                )}
              </button>
            )}

            <button
              type="button"
              disabled={!!deleteActionLoading}
              onClick={handleConfirmRemoveForMe}
              className="flex flex-col items-start text-left p-4 rounded-xl border border-border/80 bg-background hover:bg-muted/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus:ring-2 focus:ring-ring focus:outline-none"
            >
              <p className="text-[15px] font-semibold text-foreground">Remove for you</p>
              <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed font-medium">
                This message will be removed from your devices only. It will
                remain visible to other chat participants.
              </p>
              {deleteActionLoading === "for-me" && (
                <p className="mt-2 text-xs font-semibold animate-pulse text-primary">Processing...</p>
              )}
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={!!deleteActionLoading}
              onClick={() => setDeleteDialogOpen(false)}
              className="flex items-center justify-center rounded-full h-10 px-6 font-semibold border border-transparent hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Lightbox */}
      {lightboxOpen && message.imgUrl && (
        <ImageLightbox
          src={message.imgUrl}
          alt="Chat image"
          caption={
            senderParticipant
              ? `${senderParticipant.displayName} · ${new Date(message.createdAt).toLocaleString()}`
              : undefined
          }
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
});

export default MessageItem;
