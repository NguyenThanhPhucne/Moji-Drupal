import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { SocialComment } from "@/types/social";

interface CommentBubbleProps {
  comment: SocialComment;
  postAuthorId: string;
  isReply?: boolean;
  onReply?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  onOpenProfile?: (userId: string) => void;
}

const CommentBubble = ({
  comment,
  postAuthorId,
  isReply,
  onReply,
  onDelete,
  canDelete,
  onOpenProfile,
}: CommentBubbleProps) => {
  const authorName = comment.authorId.displayName || "User";
  const avatarUrl = comment.authorId.avatarUrl || "";
  const initials = authorName.slice(0, 1).toUpperCase();
  const isPostAuthor = String(comment.authorId._id) === String(postAuthorId);

  return (
    <div className={cn("flex items-start gap-2", isReply && "pl-10") }>
      <button
        type="button"
        className={cn(
          "social-comment-avatar-shell mt-0.5 flex shrink-0 items-center justify-center rounded-full",
          isReply ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-[11px]",
        )}
        onClick={() => onOpenProfile?.(comment.authorId._id)}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={authorName}
            className="h-full w-full rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          initials
        )}
      </button>

      <div className="min-w-0">
        <div className="social-comment-bubble max-w-full rounded-[18px] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="social-comment-author truncate text-sm font-semibold hover:underline"
              onClick={() => onOpenProfile?.(comment.authorId._id)}
            >
              {authorName}
            </button>
            {isPostAuthor && (
              <span className="social-comment-author-badge rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                Author
              </span>
            )}
          </div>
          <p className="social-comment-content break-words text-sm">{comment.content}</p>
        </div>

        <div className="social-comment-actions mt-1 flex items-center gap-2 px-1 text-xs">
          <button type="button" className="font-semibold hover:underline">
            Like
          </button>
          <span>·</span>
          <button type="button" className="font-semibold hover:underline" onClick={onReply}>
            Reply
          </button>
          {canDelete && (
            <>
              <span>·</span>
              <button
                type="button"
                className="social-comment-delete font-semibold hover:underline"
                onClick={onDelete}
                data-testid={`delete-comment-${comment._id}`}
              >
                Delete
              </button>
            </>
          )}
          <span>·</span>
          <span>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
        </div>
      </div>
    </div>
  );
};

export default CommentBubble;
