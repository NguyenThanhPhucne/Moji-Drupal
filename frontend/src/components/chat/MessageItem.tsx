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
  Quote,
  ZoomIn,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, memo, useMemo } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useBookmarkStore } from "@/stores/useBookmarkStore";
import { chatService, type LinkPreviewPayload } from "@/services/chatService";
import { useLinkPreviewStore } from "@/stores/useLinkPreviewStore";
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

/* ---------- Date divider ---------- */
export function DateDivider({ date }: Readonly<{ date: Date }>) {
  let label: string;
  if (isToday(date)) label = "Today";
  else if (isYesterday(date)) label = "Yesterday";
  else label = format(date, "MMM d, yyyy");

  return (
    <div className="chat-date-divider-root">
      <div className="chat-date-divider-line" />
      <span className="chat-date-divider-pill">
        {label}
      </span>
      <div className="chat-date-divider-line" />
    </div>
  );
}

/* ---------- Reaction summary bar ---------- */
const ReactionBar = memo(function ReactionBar({
  reactions,
  onReact,
}: {
  reactions: NonNullable<Message["reactions"]>;
  onReact: (emoji: string) => void;
}) {
  const grouped: Record<string, number> = {};
  for (const r of reactions) grouped[r.emoji] = (grouped[r.emoji] ?? 0) + 1;
  if (Object.keys(grouped).length === 0) return null;
  return (
    <div className="chat-reaction-bar-root">
      {Object.entries(grouped).map(([emoji, count]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          className="chat-reaction-bar-item"
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
const ContextMenu = memo(function ContextMenu({
  x,
  y,
  isOwn,
  isDeleted,
  canEdit,
  onReply,
  onCopy,
  onEdit,
  onOpenDeleteDialog,
  onClose,
}: {
  x: number;
  y: number;
  isOwn: boolean;
  isDeleted: boolean;
  canEdit: boolean;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onOpenDeleteDialog: () => void;
  onClose: () => void;
}) {
  const items = [
    { icon: Reply, label: "Reply", onClick: onReply },
    { icon: Copy, label: "Copy", onClick: onCopy, disabled: isDeleted },
    ...(isOwn && canEdit && !isDeleted
      ? [{ icon: Edit2, label: "Edit", onClick: onEdit }]
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
        style={{ position: "fixed", left: x, top: y, zIndex: 9999 }}
        className="chat-context-menu animate-in zoom-in-95 fade-in duration-100"
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
        "mt-0.5 sm:mt-1 px-0.5 sm:px-1 flex items-center justify-end gap-1 sm:gap-1.5 text-[10px] sm:text-[11px] text-muted-foreground/90",
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
        "absolute top-1/2 -translate-y-1/2 flex items-center gap-1 z-30 transition-all duration-150 motion-reduce:transition-none",
        isOwn
          ? "right-[calc(100%+0.35rem)]"
          : "left-[calc(100%+0.35rem)]",
        actionBarVisible
          ? "opacity-100 translate-x-0 pointer-events-auto"
          : cn("opacity-0 pointer-events-none", hiddenActionOffsetClass),
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
          className="chat-message-action-btn"
        >
          <Smile className="size-3.5 text-muted-foreground" />
        </button>
      </div>
      <button
        type="button"
        onClick={onReply}
        aria-label="Reply"
        className="chat-message-action-btn"
      >
        <Reply className="size-3.5 text-muted-foreground" />
      </button>
      <button
        type="button"
        onClick={onToggleBookmark}
        aria-label={bookmarked ? "Remove bookmark" : "Save message"}
        className={cn(
          "chat-message-action-btn",
          bookmarked && "text-amber-500",
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
        className="chat-message-action-btn"
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
      />

      <div
        className={cn(
          "flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1 px-0.5 sm:px-1",
          isOwn ? "flex-row-reverse" : "flex-row",
        )}
      >
        {message.editedAt && !message.isDeleted && (
          <span className="text-[10px] sm:text-[11px] text-muted-foreground/90 italic leading-none">
            edited
          </span>
        )}
        <span className="text-[10px] sm:text-[11px] text-muted-foreground/90 font-medium tabular-nums tracking-wide leading-none">
          {format(new Date(message.createdAt), "hh:mm a")}
        </span>
      </div>

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
        <div
          className={cn(
            "mb-1 max-w-full rounded-xl border border-border/60 px-3 py-2 bg-gradient-to-r from-muted/55 to-muted/25",
            isOwn ? "ring-1 ring-primary/15" : "",
          )}
        >
          <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <Quote className="size-3" />
            Replying to
          </p>
          <p className="text-xs truncate text-muted-foreground max-w-[200px]">
            {message.replyTo.content}
          </p>
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
              "chat-link-preview-card mt-1.5 block max-w-[320px] rounded-xl border border-border/70 bg-card/80 px-3 py-2.5 shadow-sm transition-colors hover:bg-card",
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
}

const MessageItem = memo(function MessageItem({
  message,
  index,
  prevSenderId,
  selectedConvo,
  lastMessageStatus,
  lastOwnMessageId,
  seenUser,
  seenUsers = [],
  showDateDivider,
  isNew = false,
}: MessageItemProps) {
  const { user } = useAuthStore();
  const {
    reactToMessage,
    unsendMessage,
    removeMessageForMe,
    editMessage,
    setReplyingTo,
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);
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
    await removeMessageForMe(activeConversationId, message._id);
    setDeleteActionLoading(null);
    setDeleteDialogOpen(false);
  }, [activeConversationId, message._id, removeMessageForMe]);

  const handleConfirmUnsendForEveryone = useCallback(async () => {
    if (!activeConversationId || !isOwn) return;
    setDeleteActionLoading("for-everyone");
    await unsendMessage(activeConversationId, message._id);
    setDeleteActionLoading(null);
    setDeleteDialogOpen(false);
  }, [activeConversationId, isOwn, message._id, unsendMessage]);

  const handleCopy = useCallback(() => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
      toast.success("Message copied");
    }
  }, [message.content]);

  const handleEditSave = useCallback(() => {
    const normalizedEditValue = editValue.trim();

    if (!normalizedEditValue || normalizedEditValue === message.content) {
      setEditMode(false);
      setEditValue(message.content ?? "");
      return;
    }

    if (!activeConversationId) {
      toast.error("Unable to save edit right now");
      return;
    }

    setEditValue(normalizedEditValue);
    setEditMode(false);

    void editMessage(
      activeConversationId,
      message._id,
      normalizedEditValue,
    ).catch(() => {
      toast.error("Couldn't save your edit. Restored previous content.");
    });
  }, [
    editValue,
    message.content,
    message._id,
    activeConversationId,
    editMessage,
  ]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleOpenContextFromButton = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = e.currentTarget.getBoundingClientRect();
      const menuWidth = 176;
      const viewportPadding = 8;
      const rawX = isOwn ? rect.left - menuWidth + rect.width : rect.right;
      const rawY = rect.bottom + 6;

      const x = Math.max(
        viewportPadding,
        Math.min(
          rawX,
          globalThis.window.innerWidth - menuWidth - viewportPadding,
        ),
      );
      const y = Math.max(
        viewportPadding,
        Math.min(rawY, globalThis.window.innerHeight - 220),
      );

      setContextMenu({ x, y });
    },
    [isOwn],
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
    () => setReplyingTo(message),
    [message, setReplyingTo],
  );

  const handleToggleBookmark = useCallback(async () => {
    const result = await toggleBookmark(message._id);
    if (!result.ok) {
      toast.error("Could not update bookmark");
      return;
    }

    toast.success(result.bookmarked ? "Message saved" : "Bookmark removed");
  }, [message._id, toggleBookmark]);

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
    "flex gap-2 px-2 py-0.5 group relative",
    isOwn ? "flex-row-reverse" : "flex-row",
    isNew && "message-slide-in",
  );

  const hasOnlyImage = Boolean(message.imgUrl && !message.content && !message.isDeleted);
  const bubbleToneClass = isOwn
    ? "bg-primary text-primary-foreground rounded-[20px] rounded-br-[4px]"
    : "bg-muted text-foreground/90 rounded-[20px] rounded-tl-[4px]";
  const imageCornerClass = isOwn ? "rounded-br-[4px]" : "rounded-tl-[4px]";

  const renderReadOnlyBubble = () => (
    <div
      className={cn(
        "relative transition-opacity duration-150 text-[14.5px] leading-relaxed",
        hasOnlyImage
          ? "bg-transparent p-0"
          : cn(
              "px-3.5 py-2",
              bubbleToneClass,
            ),
        message.isDeleted && "opacity-50 italic",
        "select-text",
      )}
    >
      {message.isDeleted ? (
        <span className="text-sm">This message was removed</span>
      ) : (
        <>
          {message.imgUrl && (
            <span
              className={cn("lightbox-thumb-btn block w-full relative", !hasOnlyImage && "mb-1")}
              aria-hidden="true"
            >
              <img 
                src={message.imgUrl} 
                alt="media" 
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
            <p className="whitespace-pre-wrap break-words tracking-tight">{message.content}</p>
          )}
        </>
      )}
    </div>
  );

  const readOnlyBubbleNode = (
    <button
      type="button"
      onClick={() => {
        if (message.imgUrl && !message.isDeleted) {
          setLightboxOpen(true);
        }
      }}
      onDoubleClick={handleDoubleClickBubble}
      onContextMenu={handleContextMenu}
      aria-label="Message bubble"
      className={cn(
        "chat-message-bubble-hit text-left select-none relative p-0 m-0 border-0 bg-transparent",
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
        className="flex-1 rounded-xl px-3 py-2 text-sm border border-primary/55 outline-none bg-background/95 focus:ring-2 focus:ring-primary/30"
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
        }}
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
          onReply={handleReply}
          onCopy={handleCopy}
          onEdit={handleEnterEditMode}
          onOpenDeleteDialog={handleOpenDeleteDialog}
          onClose={handleCloseContext}
        />
      )}

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={handleDeleteDialogOpenChange}
      >
        <DialogContent
          className="chat-modal-shell sm:max-w-xl"
          showCloseButton={!deleteActionLoading}
          dismissible={!deleteActionLoading}
        >
          <DialogHeader className="modal-stagger-item">
            <DialogTitle>
              Who do you want to remove this message for?
            </DialogTitle>
            <DialogDescription>
              Choose the scope that fits your intent. Some participants may have
              already seen or forwarded this message.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 modal-stagger-item">
            {isOwn && (
              <button
                type="button"
                disabled={!!deleteActionLoading}
                onClick={handleConfirmUnsendForEveryone}
                className="chat-delete-scope-option chat-delete-scope-option--danger disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <p className="text-sm font-semibold">Unsend for everyone</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  This message will be removed for everyone in this chat. Others
                  may have already seen or forwarded it. Unsent messages can
                  still be reported.
                </p>
                {deleteActionLoading === "for-everyone" && (
                  <p className="chat-processing-pill mt-2 text-xs text-primary">Processing...</p>
                )}
              </button>
            )}

            <button
              type="button"
              disabled={!!deleteActionLoading}
              onClick={handleConfirmRemoveForMe}
              className="chat-delete-scope-option disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <p className="text-sm font-semibold">Remove for you</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                This message will be removed from your devices only. It will
                remain visible to other chat participants.
              </p>
              {deleteActionLoading === "for-me" && (
                <p className="chat-processing-pill mt-2 text-xs text-primary">Processing...</p>
              )}
            </button>
          </div>

          <div className="flex justify-end modal-stagger-item">
            <button
              type="button"
              disabled={!!deleteActionLoading}
              onClick={() => setDeleteDialogOpen(false)}
              className="chat-modal-btn chat-modal-btn--secondary disabled:opacity-60 disabled:cursor-not-allowed"
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
