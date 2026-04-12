import { ImageIcon, SendHorizontal, Smile } from "lucide-react";
import { useCallback } from "react";
import { Virtuoso } from "react-virtuoso";
import { Button } from "@/components/ui/button";
import CommentBubble from "@/components/social/CommentBubble";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PaginationPayload, SocialComment } from "@/types/social";

type RootCommentThread = {
  root: SocialComment;
  replies: SocialComment[];
};

interface VirtualizedCommentThreadItemProps {
  item: RootCommentThread;
  postAuthorId: string;
  currentUserId: string;
  onOpenProfile?: (userId: string) => void;
  onDeleteComment: (commentId: string) => void;
  onReportComment?: (commentId: string) => void;
  collapsed: boolean;
  onToggleCollapsed: (rootId: string) => void;
  replying: boolean;
  onStartReply: (rootId: string) => void;
  replyDraft: string;
  onReplyDraftChange: (rootId: string, value: string) => void;
  onSubmitReply: (rootId: string) => void;
}

const VirtualizedCommentThreadItem = ({
  item,
  postAuthorId,
  currentUserId,
  onOpenProfile,
  onDeleteComment,
  onReportComment,
  collapsed,
  onToggleCollapsed,
  replying,
  onStartReply,
  replyDraft,
  onReplyDraftChange,
  onSubmitReply,
}: VirtualizedCommentThreadItemProps) => {
  return (
    <div className="space-y-2 pb-2 social-comment-tree-line">
      <CommentBubble
        comment={item.root}
        postAuthorId={postAuthorId}
        onOpenProfile={onOpenProfile}
        onReply={() => onStartReply(item.root._id)}
        canDelete={
          String(currentUserId || "") === String(item.root.authorId._id || "") ||
          String(currentUserId || "") === String(postAuthorId || "")
        }
        onDelete={() => onDeleteComment(item.root._id)}
        canReport={String(currentUserId || "") !== String(item.root.authorId._id || "")}
        onReport={() => onReportComment?.(item.root._id)}
      />

      {item.replies.length > 0 && (
        <button
          type="button"
          className="social-text-muted ml-10 text-xs font-semibold hover:underline"
          onClick={() => onToggleCollapsed(item.root._id)}
        >
          {collapsed ? `View ${item.replies.length} replies` : "Hide replies"}
        </button>
      )}

      {!collapsed &&
        item.replies.map((reply) => (
          <CommentBubble
            key={reply._id}
            comment={reply}
            postAuthorId={postAuthorId}
            onOpenProfile={onOpenProfile}
            isReply
            onReply={() => onStartReply(item.root._id)}
            canDelete={
              String(currentUserId || "") === String(reply.authorId._id || "") ||
              String(currentUserId || "") === String(postAuthorId || "")
            }
            onDelete={() => onDeleteComment(reply._id)}
            canReport={String(currentUserId || "") !== String(reply.authorId._id || "")}
            onReport={() => onReportComment?.(reply._id)}
          />
        ))}

      {replying && (
        <div className="ml-10 flex items-center gap-2">
          <Input
            value={replyDraft}
            onChange={(event) => onReplyDraftChange(item.root._id, event.target.value)}
            placeholder={`Reply to ${item.root.authorId.displayName}...`}
            className="social-post-comment-input social-post-comment-input-floating h-9 rounded-full shadow-none"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmitReply(item.root._id);
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="social-post-comment-action"
            onClick={() => onSubmitReply(item.root._id)}
          >
            Reply
          </Button>
        </div>
      )}
    </div>
  );
};

interface CommentsPanelProps {
  visible: boolean;
  postId: string;
  postAuthorId: string;
  currentUserId: string;
  composerAvatarUrl: string;
  composerDisplayName: string;
  commentDraft: string;
  commentPending: boolean;
  commentSort: "relevant" | "newest";
  rootsWithReplies: RootCommentThread[];
  collapsedRepliesByRoot: Record<string, boolean>;
  replyDraftByCommentId: Record<string, string>;
  replyingToCommentId: string | null;
  commentsPagination?: PaginationPayload;
  commentsLoading?: boolean;
  onCommentDraftChange: (value: string) => void;
  onSubmitComment: (parentCommentId?: string | null) => void;
  onSetCommentSort: (sortBy: "relevant" | "newest") => void;
  onLoadMoreComments: (postId: string) => void;
  onOpenProfile?: (userId: string) => void;
  onToggleRootReplies: (rootId: string) => void;
  onStartReply: (rootId: string) => void;
  onReplyDraftChange: (rootId: string, value: string) => void;
  onDeleteComment: (commentId: string) => void;
  onReportComment?: (commentId: string) => void;
}

const CommentsPanel = ({
  visible,
  postId,
  postAuthorId,
  currentUserId,
  composerAvatarUrl,
  composerDisplayName,
  commentDraft,
  commentPending,
  commentSort,
  rootsWithReplies,
  collapsedRepliesByRoot,
  replyDraftByCommentId,
  replyingToCommentId,
  commentsPagination,
  commentsLoading,
  onCommentDraftChange,
  onSubmitComment,
  onSetCommentSort,
  onLoadMoreComments,
  onOpenProfile,
  onToggleRootReplies,
  onStartReply,
  onReplyDraftChange,
  onDeleteComment,
  onReportComment,
}: CommentsPanelProps) => {
  const renderVirtuosoItem = useCallback(
    (_: number, item: RootCommentThread) => (
      <VirtualizedCommentThreadItem
        item={item}
        postAuthorId={postAuthorId}
        currentUserId={currentUserId}
        onOpenProfile={onOpenProfile}
        onDeleteComment={onDeleteComment}
        onReportComment={onReportComment}
        collapsed={Boolean(collapsedRepliesByRoot[item.root._id])}
        onToggleCollapsed={onToggleRootReplies}
        replying={replyingToCommentId === item.root._id}
        onStartReply={onStartReply}
        replyDraft={replyDraftByCommentId[item.root._id] || ""}
        onReplyDraftChange={onReplyDraftChange}
        onSubmitReply={(rootId) => onSubmitComment(rootId)}
      />
    ),
    [
      collapsedRepliesByRoot,
      currentUserId,
      onDeleteComment,
      onOpenProfile,
      onReplyDraftChange,
      onReportComment,
      onStartReply,
      onSubmitComment,
      onToggleRootReplies,
      postAuthorId,
      replyDraftByCommentId,
      replyingToCommentId,
    ],
  );

  if (!visible) {
    return null;
  }

  return (
    <section className="mt-3 space-y-3">
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          className={cn("rounded px-2 py-1 text-xs font-medium", "social-segment-btn")}
          data-active={commentSort === "relevant"}
          onClick={() => onSetCommentSort("relevant")}
        >
          Most relevant
        </button>
        <button
          type="button"
          className={cn("rounded px-2 py-1 text-xs font-medium", "social-segment-btn")}
          data-active={commentSort === "newest"}
          onClick={() => onSetCommentSort("newest")}
        >
          Newest
        </button>
      </div>

      <div className="social-comment-composer flex items-center gap-2">
        <div className="social-avatar-badge social-comment-avatar flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-xs font-semibold">
          {composerAvatarUrl ? (
            <img src={composerAvatarUrl} alt={composerDisplayName} className="h-full w-full object-cover" />
          ) : (
            composerDisplayName.slice(0, 1).toUpperCase()
          )}
        </div>

        <div className="relative flex-1">
          <Input
            value={commentDraft}
            onChange={(event) => onCommentDraftChange(event.target.value)}
            placeholder="Write a comment..."
            className="social-post-comment-input social-post-comment-input-floating h-10 rounded-full pr-28 text-sm shadow-none"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmitComment(null);
              }
            }}
          />
          <div className="social-text-muted absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
            <button type="button" className="social-post-comment-action rounded p-0.5">
              <Smile className="h-4 w-4" />
            </button>
            <button type="button" className="social-post-comment-action rounded p-0.5">
              <ImageIcon className="h-4 w-4" />
            </button>
            <button type="button" className="social-post-comment-action rounded px-1 text-xs font-semibold">
              GIF
            </button>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          className="social-primary-btn h-9 rounded-full px-3"
          onClick={() => onSubmitComment(null)}
          disabled={commentPending}
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>

      {rootsWithReplies.length > 100 ? (
        <div className="max-h-[440px] overflow-hidden">
          <Virtuoso data={rootsWithReplies} itemContent={renderVirtuosoItem} />
        </div>
      ) : (
        <div className="space-y-2">
          {rootsWithReplies.map((item) => (
            <div key={item.root._id} className="space-y-2 social-comment-tree-line pb-2">
              <CommentBubble
                comment={item.root}
                postAuthorId={postAuthorId}
                onOpenProfile={onOpenProfile}
                onReply={() => onStartReply(item.root._id)}
                canDelete={
                  String(currentUserId || "") === String(item.root.authorId._id || "") ||
                  String(currentUserId || "") === String(postAuthorId || "")
                }
                onDelete={() => onDeleteComment(item.root._id)}
                canReport={String(currentUserId || "") !== String(item.root.authorId._id || "")}
                onReport={() => onReportComment?.(item.root._id)}
              />

              {item.replies.length > 0 && (
                <button
                  type="button"
                  className="social-text-muted ml-10 text-xs font-semibold hover:underline"
                  onClick={() => onToggleRootReplies(item.root._id)}
                >
                  {collapsedRepliesByRoot[item.root._id]
                    ? `View ${item.replies.length} replies`
                    : "Hide replies"}
                </button>
              )}

              {!collapsedRepliesByRoot[item.root._id] &&
                item.replies.map((reply) => (
                  <CommentBubble
                    key={reply._id}
                    comment={reply}
                    postAuthorId={postAuthorId}
                    onOpenProfile={onOpenProfile}
                    isReply
                    onReply={() => onStartReply(item.root._id)}
                    canDelete={
                      String(currentUserId || "") === String(reply.authorId._id || "") ||
                      String(currentUserId || "") === String(postAuthorId || "")
                    }
                    onDelete={() => onDeleteComment(reply._id)}
                    canReport={String(currentUserId || "") !== String(reply.authorId._id || "")}
                    onReport={() => onReportComment?.(reply._id)}
                  />
                ))}

              {replyingToCommentId === item.root._id && (
                <div className="ml-10 flex items-center gap-2">
                  <Input
                    value={replyDraftByCommentId[item.root._id] || ""}
                    onChange={(event) => onReplyDraftChange(item.root._id, event.target.value)}
                    placeholder={`Reply to ${item.root.authorId.displayName}...`}
                    className="social-post-comment-input social-post-comment-input-floating h-9 rounded-full shadow-none"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onSubmitComment(item.root._id);
                      }
                    }}
                  />
                  <Button type="button" size="sm" variant="ghost" onClick={() => onSubmitComment(item.root._id)}>
                    Reply
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!rootsWithReplies.length && <p className="social-text-muted text-sm">No comments yet.</p>}

      {commentsPagination?.hasNextPage && (
        <Button
          type="button"
          variant="ghost"
          className="social-text-muted w-full"
          onClick={() => onLoadMoreComments(postId)}
          disabled={commentsLoading}
        >
          {commentsLoading ? "Loading..." : "View more comments"}
        </Button>
      )}
    </section>
  );
};

export default CommentsPanel;
