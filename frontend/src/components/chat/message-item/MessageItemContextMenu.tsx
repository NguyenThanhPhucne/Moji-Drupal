import { memo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  Copy,
  Edit2,
  Flag,
  Lock,
  Pin,
  Reply,
  SendHorizontal,
  Trash2,
  Unlock,
  type LucideIcon,
} from "lucide-react";

type MenuActionItem = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
};

interface MessageItemContextMenuProps {
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
}

const MessageItemContextMenu = memo(function MessageItemContextMenu({ // NOSONAR
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
}: MessageItemContextMenuProps) {
  const items: MenuActionItem[] = [
    { icon: Reply, label: "Reply", onClick: onReply },
    { icon: Copy, label: "Copy", onClick: onCopy, disabled: isDeleted },
    {
      icon: SendHorizontal,
      label: "Forward",
      onClick: onForward,
      disabled: isDeleted || (!isForwardable && !isOwn),
    },
    ...(isOwn && canEdit && !isDeleted
      ? [{ icon: Edit2, label: "Edit", onClick: onEdit }]
      : []),
    ...(isOwn && onToggleForwardable && !isDeleted
      ? [
          {
            icon: isForwardable ? Lock : Unlock,
            label: isForwardable ? "Disable forwarding" : "Allow forwarding",
            onClick: onToggleForwardable,
          },
        ]
      : []),
    ...(canPinMessage && onTogglePin && !isDeleted
      ? [
          {
            icon: Pin,
            label: isPinned ? "Unpin message" : "Pin message",
            onClick: onTogglePin,
          },
        ]
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

export default MessageItemContextMenu;
