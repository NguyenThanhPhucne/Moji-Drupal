import { useId, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type {
  SocialComment,
  SocialPost,
  SocialPostEngagement,
} from "@/types/social";

interface SocialPostCardProps {
  post: SocialPost;
  comments?: SocialComment[];
  engagement?: SocialPostEngagement;
  onLike: (postId: string) => Promise<void>;
  onFetchComments: (postId: string) => Promise<void>;
  onFetchEngagement: (postId: string) => Promise<void>;
  onComment: (postId: string, content: string) => Promise<void>;
  onOpenProfile?: (userId: string) => void;
}

const SocialPostCard = ({
  post,
  comments,
  engagement,
  onLike,
  onFetchComments,
  onFetchEngagement,
  onComment,
  onOpenProfile,
}: SocialPostCardProps) => {
  const [showComments, setShowComments] = useState(false);
  const [showEngagement, setShowEngagement] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const engagementDescriptionId = useId();

  const postedAgo = useMemo(
    () => formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }),
    [post.createdAt],
  );

  const toggleComments = async () => {
    const next = !showComments;
    setShowComments(next);

    if (next && !comments) {
      await onFetchComments(post._id);
    }
  };

  const submitComment = async () => {
    const normalized = commentDraft.trim();
    if (!normalized) {
      return;
    }

    await onComment(post._id, normalized);
    setCommentDraft("");
  };

  const openEngagement = async () => {
    setShowEngagement(true);
    if (!engagement) {
      await onFetchEngagement(post._id);
    }
  };

  return (
    <article className="elevated-card p-4">
      <header className="mb-3 flex items-center gap-3">
        <button
          type="button"
          className="flex min-w-0 items-center gap-3 text-left"
          onClick={() => onOpenProfile?.(post.authorId._id)}
        >
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
            {(post.authorId.displayName || "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              {post.authorId.displayName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              @{post.authorId.username} · {postedAgo}
            </p>
          </div>
        </button>
      </header>

      {post.caption && (
        <p className="text-body-md whitespace-pre-wrap">{post.caption}</p>
      )}

      {post.mediaUrls?.[0] && (
        <div className="mt-3 overflow-hidden rounded-xl border border-border/70 bg-muted/30">
          <img
            src={post.mediaUrls[0]}
            alt="post media"
            className="h-auto max-h-[420px] w-full object-cover"
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <button
          type="button"
          className="font-medium transition-colors hover:text-foreground"
          onClick={openEngagement}
        >
          {post.likesCount} likes
        </button>
        <span>·</span>
        <button
          type="button"
          className="font-medium transition-colors hover:text-foreground"
          onClick={openEngagement}
        >
          {post.commentsCount} comments
        </button>
        <span>·</span>
        <span className="uppercase">{post.privacy}</span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant={post.isLiked ? "default" : "outline"}
          size="sm"
          className="gap-2"
          onClick={() => onLike(post._id)}
        >
          <Heart className="size-4" />
          {post.isLiked ? "Liked" : "Like"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={toggleComments}
        >
          <MessageCircle className="size-4" />
          Comment
        </Button>
      </div>

      {showComments && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="Write a comment"
            />
            <Button type="button" size="sm" onClick={submitComment}>
              Send
            </Button>
          </div>

          <div className="space-y-2">
            {(comments || []).map((comment) => (
              <div
                key={comment._id}
                className="rounded-lg border border-border/60 bg-background/70 px-3 py-2"
              >
                <p className="text-sm font-semibold">
                  {comment.authorId.displayName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {comment.content}
                </p>
              </div>
            ))}
            {!comments?.length && (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            )}
          </div>
        </div>
      )}

      <Dialog open={showEngagement} onOpenChange={setShowEngagement}>
        <DialogContent
          className="sm:max-w-xl"
          aria-describedby={engagementDescriptionId}
        >
          <DialogHeader>
            <DialogTitle>Post engagement</DialogTitle>
            <DialogDescription id={engagementDescriptionId}>
              See people who liked this post and recent comment content.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">
                Likes ({engagement?.likers.length || 0})
              </p>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {(engagement?.likers || []).map((user) => (
                  <button
                    key={`like-${user._id}`}
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-border/60 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                    onClick={() => onOpenProfile?.(user._id)}
                  >
                    <span className="text-sm font-medium">
                      {user.displayName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      @{user.username}
                    </span>
                  </button>
                ))}
                {!engagement?.likers?.length && (
                  <p className="text-sm text-muted-foreground">No likes yet.</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">
                Commenters ({engagement?.commenters.length || 0})
              </p>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {(engagement?.recentComments || []).map((comment) => (
                  <div
                    key={`recent-comment-${comment._id}`}
                    className="rounded-md border border-border/60 bg-background/70 px-3 py-2"
                  >
                    <button
                      type="button"
                      className="mb-1 text-left text-sm font-semibold text-foreground transition-colors hover:text-primary"
                      onClick={() => onOpenProfile?.(comment.authorId._id)}
                    >
                      {comment.authorId.displayName}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        @{comment.authorId.username}
                      </span>
                    </button>
                    <p className="text-sm text-muted-foreground">
                      {comment.content}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      {formatDistanceToNow(new Date(comment.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                ))}
                {!engagement?.recentComments?.length && (
                  <p className="text-sm text-muted-foreground">
                    No comments yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
};

export default SocialPostCard;
