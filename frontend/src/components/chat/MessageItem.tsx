import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation, Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Check,
  CheckCheck,
  Reply,
  Smile,
  Trash2,
  Edit2,
  Copy,
  MoreHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, memo } from "react";
import { toast } from "sonner";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "👏"];

/* ---------- Date divider ---------- */
export function DateDivider({ date }: { date: Date }) {
  let label: string;
  if (isToday(date)) label = "Today";
  else if (isYesterday(date)) label = "Yesterday";
  else label = format(date, "dd MMMM yyyy", { locale: vi });

  return (
    <div className="flex items-center gap-3 my-3 px-2 select-none">
      <div className="flex-1 h-px bg-border/50" />
      <span className="text-[11px] text-muted-foreground font-medium px-2 py-0.5 bg-muted/50 rounded-full">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/50" />
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
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(grouped).map(([emoji, count]) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          className="flex items-center gap-0.5 text-xs bg-muted hover:bg-primary/10 border border-border/60 rounded-full px-2 py-0.5 transition-colors hover:scale-105 active:scale-95"
        >
          <span>{emoji}</span>
          <span className="font-medium text-muted-foreground">{count}</span>
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
        "absolute bottom-full mb-1 bg-background/95 backdrop-blur-sm border border-border/60 rounded-full px-2 py-1.5 flex gap-1 shadow-lg z-20",
        "transition-all duration-150",
        visible
          ? "opacity-100 scale-100 translate-y-0"
          : "opacity-0 scale-90 translate-y-2 pointer-events-none",
      )}
    >
      {QUICK_REACTIONS.map((em) => (
        <button
          key={em}
          onClick={() => onReact(em)}
          className="text-base hover:scale-125 active:scale-95 transition-transform duration-100 p-0.5"
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
  onUnsend,
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
  onUnsend: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const items = [
    { icon: Reply, label: "Reply", onClick: onReply },
    { icon: Copy, label: "Copy", onClick: onCopy, disabled: isDeleted },
    ...(isOwn && canEdit && !isDeleted
      ? [{ icon: Edit2, label: "Edit", onClick: onEdit }]
      : []),
    ...(isOwn && !isDeleted
      ? [
          {
            icon: Trash2,
            label: "Remove message",
            onClick: onUnsend,
            danger: true,
          },
        ]
      : []),
  ];

  return (
    <div
      ref={menuRef}
      style={{ position: "fixed", left: x, top: y, zIndex: 9999 }}
      className="bg-popover border border-border/70 rounded-xl shadow-xl overflow-hidden animate-in zoom-in-95 fade-in duration-100 min-w-[160px]"
    >
      {items.map(({ icon: Icon, label, onClick, disabled, danger }) => (
        <button
          key={label}
          disabled={disabled}
          onClick={() => {
            onClick();
            onClose();
          }}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors",
            danger
              ? "text-destructive hover:bg-destructive/10"
              : "hover:bg-muted",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
});

/* ========== Main MessageItem ========== */
interface MessageItemProps {
  message: Message;
  index: number;
  messages: Message[];
  selectedConvo: Conversation;
  lastMessageStatus: "delivered" | "seen";
  showDateDivider?: boolean;
  isNew?: boolean; // only animate truly new messages
}

const MessageItem = memo(function MessageItem({
  message,
  index,
  messages,
  selectedConvo,
  lastMessageStatus,
  showDateDivider,
  isNew = false,
}: MessageItemProps) {
  const { user } = useAuthStore();
  const {
    reactToMessage,
    unsendMessage,
    editMessage,
    setReplyingTo,
    activeConversationId,
  } = useChatStore();

  const [hovered, setHovered] = useState(false);
  const [reactBarVisible, setReactBarVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editValue, setEditValue] = useState(message.content ?? "");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);
  const isOwn = message.senderId === user?._id;

  const canEdit = (() => {
    if (!message.createdAt) return false;
    return Date.now() - new Date(message.createdAt).getTime() < 15 * 60 * 1000;
  })();

  const isLastFromSender =
    index === 0 || messages[index - 1]?.senderId !== message.senderId;

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

  const handleUnsend = useCallback(async () => {
    if (!activeConversationId) return;
    await unsendMessage(activeConversationId, message._id);
  }, [activeConversationId, message._id, unsendMessage]);

  const handleCopy = useCallback(() => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
      toast.success("Message copied");
    }
  }, [message.content]);

  const handleEditSave = useCallback(async () => {
    if (
      !editValue.trim() ||
      editValue === message.content ||
      !activeConversationId
    ) {
      setEditMode(false);
      return;
    }
    await editMessage(activeConversationId, message._id, editValue);
    setEditMode(false);
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

  const handleCloseContext = useCallback(() => setContextMenu(null), []);
  const handleEnterEditMode = useCallback(() => setEditMode(true), []);
  const handleReply = useCallback(
    () => setReplyingTo(message),
    [message, setReplyingTo],
  );

  const isLastMessage = index === 0;

  return (
    <>
      {showDateDivider && <DateDivider date={new Date(message.createdAt)} />}

      <div
        className={cn(
          "flex gap-2 px-2 py-0.5 group relative",
          isOwn ? "flex-row-reverse" : "flex-row",
          // Only animate truly new messages — not historical ones on scroll
          isNew && "message-slide-in",
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setReactBarVisible(false);
        }}
        onContextMenu={handleContextMenu}
      >
        {/* Avatar */}
        {!isOwn && (
          <div className="w-8 flex-shrink-0 self-end">
            {isLastFromSender && (
              <div className="size-8 rounded-full bg-gradient-chat flex items-center justify-center text-white text-xs font-bold shadow-sm">
                {(senderParticipant?.displayName ?? "?")[0].toUpperCase()}
              </div>
            )}
          </div>
        )}

        {/* Bubble container */}
        <div
          className={cn(
            "flex flex-col max-w-[65%]",
            isOwn ? "items-end" : "items-start",
          )}
        >
          {/* Sender name (group only) */}
          {selectedConvo.type === "group" && !isOwn && isLastFromSender && (
            <span className="text-[11px] text-muted-foreground mb-0.5 ml-1 font-medium">
              {senderParticipant?.displayName}
            </span>
          )}

          {/* Reply snippet */}
          {message.replyTo && !message.isDeleted && (
            <div
              className={cn(
                "mb-1 rounded-lg px-3 py-2 max-w-full border-l-2 bg-muted/50",
                isOwn ? "border-primary/60" : "border-muted-foreground/40",
              )}
            >
              <p className="text-[11px] text-muted-foreground font-medium mb-0.5">
                Replying to
              </p>
              <p className="text-xs truncate text-muted-foreground max-w-[200px]">
                {message.replyTo.content}
              </p>
            </div>
          )}

          {/* Bubble */}
          <div className="relative">
            {/* Hover action bar */}
            {(hovered || reactBarVisible || contextMenu) && !editMode && (
              <div
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 flex items-center gap-1 z-10 animate-in fade-in zoom-in-95 duration-100",
                  isOwn ? "right-full mr-2" : "left-full ml-2",
                )}
              >
                <div className="relative">
                  {reactBarVisible && (
                    <QuickReactBar onReact={handleReact} visible={true} />
                  )}
                  <button
                    onClick={() => setReactBarVisible((v) => !v)}
                    className="p-1.5 rounded-full bg-background border border-border/60 shadow-sm hover:bg-muted transition-colors"
                  >
                    <Smile className="size-3.5 text-muted-foreground" />
                  </button>
                </div>
                <button
                  onClick={handleReply}
                  className="p-1.5 rounded-full bg-background border border-border/60 shadow-sm hover:bg-muted transition-colors"
                >
                  <Reply className="size-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={
                    handleContextMenu as unknown as React.MouseEventHandler
                  }
                  className="p-1.5 rounded-full bg-background border border-border/60 shadow-sm hover:bg-muted transition-colors"
                >
                  <MoreHorizontal className="size-3.5 text-muted-foreground" />
                </button>
              </div>
            )}

            {/* Main bubble */}
            {editMode ? (
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
                  className="flex-1 rounded-xl px-3 py-2 text-sm border border-primary outline-none bg-background focus:ring-2 focus:ring-primary/30"
                />
                <button
                  onClick={handleEditSave}
                  className="px-2 py-1 text-xs bg-primary text-white rounded-lg hover:bg-primary/90"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditMode(false);
                    setEditValue(message.content ?? "");
                  }}
                  className="px-2 py-1 text-xs bg-muted rounded-lg hover:bg-muted/80"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div
                onDoubleClick={() =>
                  isOwn && canEdit && !message.isDeleted && setEditMode(true)
                }
                className={cn(
                  "rounded-2xl px-4 py-2.5 relative",
                  isOwn
                    ? "chat-bubble-sent rounded-br-md"
                    : "chat-bubble-received rounded-bl-md",
                  message.isDeleted && "opacity-50 italic",
                  "select-text",
                )}
              >
                {message.isDeleted ? (
                  <span className="text-sm">This message was removed</span>
                ) : (
                  <>
                    {message.imgUrl && (
                      <img
                        src={message.imgUrl}
                        alt="media"
                        className="max-w-[200px] rounded-xl mb-2 cursor-zoom-in hover:opacity-95 transition-opacity"
                        onClick={() => window.open(message.imgUrl!, "_blank")}
                      />
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Reactions */}
          <ReactionBar
            reactions={message.reactions ?? []}
            onReact={handleReact}
          />

          {/* Meta */}
          <div
            className={cn(
              "flex items-center gap-1.5 mt-0.5 px-1",
              isOwn ? "flex-row-reverse" : "flex-row",
            )}
          >
            {message.editedAt && !message.isDeleted && (
              <span className="text-[10px] text-muted-foreground italic">
                edited
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(message.createdAt), "HH:mm")}
            </span>
            {isOwn &&
              isLastMessage &&
              (lastMessageStatus === "seen" ? (
                <CheckCheck className="size-3 text-primary" />
              ) : (
                <Check className="size-3 text-muted-foreground" />
              ))}
          </div>
        </div>
      </div>

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
          onUnsend={handleUnsend}
          onClose={handleCloseContext}
        />
      )}
    </>
  );
});

export default MessageItem;
