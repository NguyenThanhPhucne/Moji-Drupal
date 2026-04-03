import { useEffect, useId, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  SocialComment,
  SocialPost,
  SocialPostEngagement,
} from "@/types/social";

interface SocialPostCardProps {
  post: SocialPost;
  comments?: SocialComment[];
  engagement?: SocialPostEngagement;
  onLike: (postId: string) => Promise<boolean>;
  onFetchComments: (postId: string) => Promise<void>;
  onFetchEngagement: (postId: string) => Promise<void>;
  onComment: (postId: string, content: string) => Promise<boolean>;
  onOpenProfile?: (userId: string) => void;
  onSelectTag?: (tag: string) => void;
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
  onSelectTag,
}: SocialPostCardProps) => {
  const [showComments, setShowComments] = useState(false);
  const [showEngagement, setShowEngagement] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [displayLiked, setDisplayLiked] = useState(post.isLiked);
  const [displayLikesCount, setDisplayLikesCount] = useState(post.likesCount);
  const [displayCommentsCount, setDisplayCommentsCount] = useState(
    post.commentsCount,
  );
  const [likePending, setLikePending] = useState(false);
  const [commentPending, setCommentPending] = useState(false);
  const [likeAnimTick, setLikeAnimTick] = useState(0);
  const [commentAnimTick, setCommentAnimTick] = useState(0);
  const engagementDescriptionId = useId();

  useEffect(() => {
    if (!likePending) {
      setDisplayLiked(post.isLiked);
      setDisplayLikesCount(post.likesCount);
    }
  }, [post.isLiked, post.likesCount, likePending]);

  useEffect(() => {
    if (!commentPending) {
      setDisplayCommentsCount(post.commentsCount);
    }
  }, [post.commentsCount, commentPending]);

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
    if (!normalized || commentPending) {
      return;
    }

    const previousCommentsCount = displayCommentsCount;
    setCommentPending(true);
    setDisplayCommentsCount((current) => current + 1);
    setCommentAnimTick((value) => value + 1);

    const ok = await onComment(post._id, normalized);
    if (ok) {
      setCommentDraft("");
    } else {
      setDisplayCommentsCount(previousCommentsCount);
    }

    setCommentPending(false);
  };

  const handleLike = async () => {
    if (likePending) {
      return;
    }

    const previousLiked = displayLiked;
    const previousLikesCount = displayLikesCount;
    const nextLiked = !displayLiked;

    setLikePending(true);
    setDisplayLiked(nextLiked);
    setDisplayLikesCount((current) =>
      nextLiked ? current + 1 : Math.max(0, current - 1),
    );
    setLikeAnimTick((value) => value + 1);

    const ok = await onLike(post._id);
    if (!ok) {
      setDisplayLiked(previousLiked);
      setDisplayLikesCount(previousLikesCount);
    }

    setLikePending(false);
  };

  const openEngagement = async () => {
    setShowEngagement(true);
    if (!engagement) {
      await onFetchEngagement(post._id);
    }
  };

  const captionParts = useMemo(() => {
    if (!post.caption) {
      return [] as Array<{ type: "text" | "tag"; value: string }>;
    }

    return post.caption
      .split(/(#\w+)/g)
      .filter(Boolean)
      .map(
        (part): { type: "text" | "tag"; value: string } => ({
          type: /^#\w+$/.test(part) ? "tag" : "text",
          value: part,
        }),
      );
  }, [post.caption]);

  const sharePost = async () => {
    const shareUrl = `${globalThis.location.origin}/post/${post._id}`;
    const text = `${post.authorId.displayName}: ${post.caption || "New post"}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Shared post",
          text,
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      toast.success("Post link copied");
    } catch (error) {
      console.error("[social] share post error", error);
      toast.error("Could not share this post");
    }
  };

  const renderCaptionPart = (
    part: { type: "text" | "tag"; value: string },
    index: number,
  ) => {
    const key = `${part.value}-${index}`;
    if (part.type !== "tag") {
      return <span key={key}>{part.value}</span>;
    }

    if (!onSelectTag) {
      return (
        <span key={key} className="font-medium text-primary">
          {part.value}
        </span>
      );
    }

    return (
      <button
        key={key}
        type="button"
        className="font-medium text-primary transition-colors hover:text-primary/80"
        onClick={() => onSelectTag(part.value.slice(1).toLowerCase())}
      >
        {part.value}
      </button>
    );
  };

  const renderTagChip = (tag: string) => {
    const key = `${post._id}-${tag}`;
    if (!onSelectTag) {
      return (
        <span
          key={key}
          className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary"
        >
          #{tag}
        </span>
      );
    }

    return (
      <button
        key={key}
        type="button"
        className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        onClick={() => onSelectTag(tag.toLowerCase())}
      >
        #{tag}
      </button>
    );
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
        <p className="text-body-md whitespace-pre-wrap break-words">
          {captionParts.map((part, index) => renderCaptionPart(part, index))}
        </p>
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
          <span
            key={`likes-count-${likeAnimTick}`}
            className={cn("inline-block", likeAnimTick > 0 && "social-count-bump")}
          >
            {displayLikesCount} likes
          </span>
        </button>
        <span>·</span>
        <button
          type="button"
          className="font-medium transition-colors hover:text-foreground"
          onClick={openEngagement}
        >
          <span
            key={`comments-count-${commentAnimTick}`}
            className={cn(
              "inline-block",
              commentAnimTick > 0 && "social-count-bump",
            )}
          >
            {displayCommentsCount} comments
          </span>
        </button>
        <span>·</span>
        <span className="uppercase">{post.privacy}</span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant={displayLiked ? "default" : "outline"}
          size="sm"
          className="gap-2"
          onClick={handleLike}
          disabled={likePending}
        >
          <Heart
            key={`heart-${likeAnimTick}`}
            className={cn("size-4", likeAnimTick > 0 && "social-heart-pop")}
          />
          {displayLiked ? "Liked" : "Like"}
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={sharePost}
        >
          <Share2 className="size-4" />
          Share
        </Button>
      </div>

      {post.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {post.tags.map(renderTagChip)}
        </div>
      )}

      {showComments && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="Write a comment"
            />
            <Button
              type="button"
              size="sm"
              onClick={submitComment}
              disabled={commentPending}
            >
              {commentPending ? "Sending..." : "Send"}
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
