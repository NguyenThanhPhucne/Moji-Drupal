import {
  type TouchEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  RotateCcw,
  SendHorizontal,
  Share2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Virtuoso } from "react-virtuoso";
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
  PaginationPayload,
  SocialComment,
  SocialReactionType,
  SocialReactionSummary,
  SocialPost,
  SocialPostEngagement,
} from "@/types/social";

interface SocialPostCardProps {
  post: SocialPost;
  comments?: SocialComment[];
  commentsPagination?: PaginationPayload;
  commentsLoading?: boolean;
  commentsSortBy?: "relevant" | "newest";
  engagement?: SocialPostEngagement;
  onLike: (postId: string, reaction?: SocialReactionType) => Promise<boolean>;
  onFetchComments: (postId: string) => Promise<void>;
  onLoadMoreComments: (postId: string) => Promise<void>;
  onSetCommentsSortBy: (
    postId: string,
    sortBy: "relevant" | "newest",
  ) => Promise<void>;
  onFetchEngagement: (postId: string) => Promise<void>;
  onComment: (
    postId: string,
    content: string,
    parentCommentId?: string | null,
  ) => Promise<boolean>;
  onOpenProfile?: (userId: string) => void;
  onSelectTag?: (tag: string) => void;
}

const MediaTile = ({
  src,
  alt,
  className,
  onClick,
}: {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "relative flex w-full items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/35 transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1",
      className,
    )}
  >
    <img
      src={src}
      alt={alt}
      className="max-h-full max-w-full object-contain"
      loading="lazy"
    />
  </button>
);

const CommentItem = ({
  comment,
  onOpenProfile,
  postAuthorId,
  isReply,
  onReply,
}: {
  comment: SocialComment;
  onOpenProfile?: (userId: string) => void;
  postAuthorId: string;
  isReply?: boolean;
  onReply?: () => void;
}) => {
  const authorName = comment.authorId.displayName || "User";
  const authorInitial = authorName.slice(0, 1).toUpperCase();
  const isPostAuthor = comment.authorId._id === postAuthorId;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border border-border/50 bg-background/80 px-3 py-2",
        isReply && "bg-background/65",
      )}
    >
      <button
        type="button"
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
        onClick={() => onOpenProfile?.(comment.authorId._id)}
      >
        {authorInitial}
      </button>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="inline-flex max-w-full flex-col rounded-2xl bg-muted/45 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="truncate text-left text-sm font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
              onClick={() => onOpenProfile?.(comment.authorId._id)}
            >
              {authorName}
            </button>
            {isPostAuthor && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Author
              </span>
            )}
          </div>
          <p className="break-words text-sm leading-relaxed text-foreground/90">
            {comment.content}
          </p>
        </div>

        <div className="flex items-center gap-2 pl-1 text-[11px] font-medium text-muted-foreground">
          <button
            type="button"
            className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
          >
            Like
          </button>
          <span>·</span>
          <button
            type="button"
            className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
            onClick={onReply}
          >
            Reply
          </button>
          <span>·</span>
          <span>
            {formatDistanceToNow(new Date(comment.createdAt), {
              addSuffix: true,
            })}
          </span>
        </div>
      </div>
    </div>
  );
};

const SocialPostCard = ({
  post,
  comments,
  commentsPagination,
  commentsLoading,
  commentsSortBy,
  engagement,
  onLike,
  onFetchComments,
  onLoadMoreComments,
  onSetCommentsSortBy,
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
  const [displayOwnReaction, setDisplayOwnReaction] = useState<
    SocialReactionType | null
  >(post.ownReaction || null);
  const [displayReactionSummary, setDisplayReactionSummary] =
    useState<SocialReactionSummary>({
      like: post.reactionSummary?.like || post.likesCount || 0,
      love: post.reactionSummary?.love || 0,
      haha: post.reactionSummary?.haha || 0,
      wow: post.reactionSummary?.wow || 0,
    });
  const [likePending, setLikePending] = useState(false);
  const [commentPending, setCommentPending] = useState(false);
  const [likeAnimTick, setLikeAnimTick] = useState(0);
  const [commentAnimTick, setCommentAnimTick] = useState(0);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [commentSort, setCommentSort] = useState<"relevant" | "newest">(
    commentsSortBy || "relevant",
  );
  const [mediaMeta, setMediaMeta] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [swipeFeedbackDirection, setSwipeFeedbackDirection] = useState<
    "left" | "right" | null
  >(null);
  const [swipeFeedbackTick, setSwipeFeedbackTick] = useState(0);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyDraftByCommentId, setReplyDraftByCommentId] = useState<Record<string, string>>({});
  const [collapsedRepliesByRoot, setCollapsedRepliesByRoot] = useState<
    Record<string, boolean>
  >({});
  const [commentComposerFocused, setCommentComposerFocused] = useState(false);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeEndXRef = useRef<number | null>(null);
  const engagementDescriptionId = useId();
  const COMMENT_PREVIEW_COUNT = 3;

  const reactionOptions: Array<{
    type: SocialReactionType;
    label: string;
    emoji: string;
  }> = [
    { type: "like", label: "Like", emoji: "👍" },
    { type: "love", label: "Love", emoji: "❤️" },
    { type: "haha", label: "Haha", emoji: "😂" },
    { type: "wow", label: "Wow", emoji: "😮" },
  ];

  useEffect(() => {
    if (!likePending) {
      setDisplayLiked(post.isLiked);
      setDisplayLikesCount(post.likesCount);
      setDisplayOwnReaction(post.ownReaction || null);
      setDisplayReactionSummary({
        like: post.reactionSummary?.like || (post.isLiked ? post.likesCount : 0),
        love: post.reactionSummary?.love || 0,
        haha: post.reactionSummary?.haha || 0,
        wow: post.reactionSummary?.wow || 0,
      });
    }
  }, [post.isLiked, post.likesCount, post.ownReaction, post.reactionSummary, likePending]);

  useEffect(() => {
    if (!commentPending) {
      setDisplayCommentsCount(post.commentsCount);
    }
  }, [post.commentsCount, commentPending]);

  useEffect(() => {
    setCommentSort(commentsSortBy || "relevant");
  }, [commentsSortBy]);

  useEffect(() => {
    if (!post.mediaUrls?.length) {
      return;
    }

    let cancelled = false;
    post.mediaUrls.forEach((url) => {
      if (mediaMeta[url]) {
        return;
      }

      const image = new Image();
      image.onload = () => {
        if (cancelled) {
          return;
        }

        setMediaMeta((current) => ({
          ...current,
          [url]: {
            width: image.naturalWidth,
            height: image.naturalHeight,
          },
        }));
      };
      image.src = url;
    });

    return () => {
      cancelled = true;
    };
  }, [post.mediaUrls, mediaMeta]);

  const postedAgo = useMemo(
    () => formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }),
    [post.createdAt],
  );

  const compactCountFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [],
  );

  const visibleComments = useMemo(() => {
    const source = comments || [];
    if (commentsExpanded || source.length <= COMMENT_PREVIEW_COUNT) {
      return source;
    }

    return source.slice(0, COMMENT_PREVIEW_COUNT);
  }, [comments, commentsExpanded]);

  const shouldVirtualizeComments =
    commentsExpanded && (visibleComments?.length || 0) > 100;

  const threadedVisibleComments = useMemo(() => {
    const roots = visibleComments.filter((comment) => !comment.parentCommentId);
    const repliesByParentId = visibleComments.reduce<Record<string, SocialComment[]>>(
      (map, comment) => {
        if (!comment.parentCommentId) {
          return map;
        }

        const parentId = comment.parentCommentId;
        if (!map[parentId]) {
          map[parentId] = [];
        }
        map[parentId].push(comment);
        return map;
      },
      {},
    );

    return roots.map((root) => ({
      root,
      replies: repliesByParentId[root._id] || [],
    }));
  }, [visibleComments]);

  useEffect(() => {
    if (!threadedVisibleComments.length) {
      return;
    }

    setCollapsedRepliesByRoot((current) => {
      const next = { ...current };
      threadedVisibleComments.forEach((item) => {
        if (typeof next[item.root._id] === "undefined") {
          next[item.root._id] = item.replies.length > 0;
        }
      });
      return next;
    });
  }, [threadedVisibleComments]);

  const isPortrait = (url: string) => {
    const meta = mediaMeta[url];
    if (!meta) {
      return false;
    }

    return meta.height > meta.width;
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxZoom(1);
    setLightboxOpen(true);
  };

  const goPrevMedia = useCallback(() => {
    const total = post.mediaUrls?.length || 0;
    if (!total) {
      return;
    }

    setLightboxIndex((current) => (current - 1 + total) % total);
    setLightboxZoom(1);
  }, [post.mediaUrls]);

  const goNextMedia = useCallback(() => {
    const total = post.mediaUrls?.length || 0;
    if (!total) {
      return;
    }

    setLightboxIndex((current) => (current + 1) % total);
    setLightboxZoom(1);
  }, [post.mediaUrls]);

  useEffect(() => {
    if (!lightboxOpen || !globalThis.window) {
      return;
    }

    const handleLightboxKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevMedia();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNextMedia();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setLightboxOpen(false);
        setLightboxZoom(1);
      }
    };

    globalThis.window.addEventListener("keydown", handleLightboxKeyDown);
    return () => {
      globalThis.window.removeEventListener("keydown", handleLightboxKeyDown);
    };
  }, [lightboxOpen, goPrevMedia, goNextMedia]);

  const zoomIn = () => {
    setLightboxZoom((current) => Math.min(3, current + 0.25));
  };

  const zoomOut = () => {
    setLightboxZoom((current) => Math.max(1, current - 0.25));
  };

  const resetZoom = () => {
    setLightboxZoom(1);
  };

  const toggleQuickZoom = () => {
    setLightboxZoom((current) => (current > 1 ? 1 : 2));
  };

  const triggerSwipeFeedback = (direction: "left" | "right") => {
    setSwipeFeedbackDirection(direction);
    setSwipeFeedbackTick((current) => current + 1);
    globalThis.setTimeout(() => {
      setSwipeFeedbackDirection(null);
    }, 120);
  };

  const handleLightboxTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    swipeStartXRef.current = event.touches[0]?.clientX ?? null;
    swipeEndXRef.current = null;
  };

  const handleLightboxTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    swipeEndXRef.current = event.touches[0]?.clientX ?? null;
  };

  const handleLightboxTouchEnd = () => {
    const start = swipeStartXRef.current;
    const end = swipeEndXRef.current;
    if (start === null || end === null) {
      return;
    }

    const delta = start - end;
    if (Math.abs(delta) < 48) {
      return;
    }

    if (delta > 0) {
      triggerSwipeFeedback("left");
      goNextMedia();
      return;
    }

    triggerSwipeFeedback("right");
    goPrevMedia();
  };

  const renderPostMedia = (mediaUrls: string[]) => {
    if (!mediaUrls.length) {
      return null;
    }

    if (mediaUrls.length === 1) {
      const portrait = isPortrait(mediaUrls[0]);
      return (
        <div className="relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/30 p-1">
          <button
            type="button"
            className={cn(
              "relative flex w-full items-center justify-center rounded-lg transition-transform hover:scale-[1.005] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1",
              portrait ? "max-h-[620px]" : "max-h-[520px]",
            )}
            onClick={() => openLightbox(0)}
          >
            <img
              src={mediaUrls[0]}
              alt="post media 1"
              className={cn(
                "max-w-full rounded-lg object-contain",
                portrait ? "max-h-[600px]" : "max-h-[500px]",
              )}
              loading="lazy"
            />
          </button>
        </div>
      );
    }

    if (mediaUrls.length === 2) {
      const firstPortrait = isPortrait(mediaUrls[0]);
      const secondPortrait = isPortrait(mediaUrls[1]);
      const bothPortrait = firstPortrait && secondPortrait;
      const bothLandscape = !firstPortrait && !secondPortrait;
      const tileAspect = bothPortrait
        ? "aspect-[3/4]"
        : bothLandscape
          ? "aspect-[16/10]"
          : "aspect-[4/5]";

      return (
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border/70 bg-muted/30 p-1">
          {mediaUrls.slice(0, 2).map((media, index) => (
            <MediaTile
              key={`${media}-${index}`}
              src={media}
              alt={`post media ${index + 1}`}
              className={tileAspect}
              onClick={() => openLightbox(index)}
            />
          ))}
        </div>
      );
    }

    if (mediaUrls.length === 3) {
      const leadPortrait = isPortrait(mediaUrls[0]);
      return (
        <div className="grid grid-cols-2 grid-rows-2 gap-1.5 rounded-xl border border-border/70 bg-muted/30 p-1">
          <MediaTile
            src={mediaUrls[0]}
            alt="post media 1"
            className={cn("row-span-2", leadPortrait ? "aspect-[3/4]" : "aspect-[16/10]")}
            onClick={() => openLightbox(0)}
          />
          <MediaTile
            src={mediaUrls[1]}
            alt="post media 2"
            className="aspect-[16/10]"
            onClick={() => openLightbox(1)}
          />
          <MediaTile
            src={mediaUrls[2]}
            alt="post media 3"
            className="aspect-[16/10]"
            onClick={() => openLightbox(2)}
          />
        </div>
      );
    }

    const remaining = mediaUrls.length - 4;
    const portraitCount = mediaUrls.slice(0, 4).filter((url) => isPortrait(url)).length;
    const tileAspect = portraitCount >= 3 ? "aspect-[4/5]" : "aspect-[16/10]";

    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-1.5 rounded-xl border border-border/70 bg-muted/30 p-1">
        {mediaUrls.slice(0, 4).map((media, index) => {
          const isLastVisible = index === 3 && remaining > 0;

          return (
            <div key={`${media}-${index}`} className="relative">
              <MediaTile
                src={media}
                alt={`post media ${index + 1}`}
                className={tileAspect}
                onClick={() => openLightbox(index)}
              />
              {isLastVisible && (
                <button
                  type="button"
                  className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/55 text-2xl font-semibold text-white"
                  onClick={() => openLightbox(index)}
                >
                  +{remaining}
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const toggleComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (!next) {
      setCommentsExpanded(false);
    }

    if (next && !comments) {
      await onFetchComments(post._id);
    }
  };

  const submitComment = async (parentCommentId?: string | null) => {
    const normalized =
      parentCommentId
        ? (replyDraftByCommentId[parentCommentId] || "").trim()
        : commentDraft.trim();
    if (!normalized || commentPending) {
      return;
    }

    const previousCommentsCount = displayCommentsCount;
    setCommentPending(true);
    setDisplayCommentsCount((current) => current + 1);
    setCommentAnimTick((value) => value + 1);

    const ok = await onComment(post._id, normalized, parentCommentId);
    if (ok) {
      if (parentCommentId) {
        setReplyDraftByCommentId((current) => ({
          ...current,
          [parentCommentId]: "",
        }));
        setReplyingToCommentId(null);
      } else {
        setCommentDraft("");
      }
    } else {
      setDisplayCommentsCount(previousCommentsCount);
    }

    setCommentPending(false);
  };

  const applyOptimisticReaction = (nextReaction: SocialReactionType | null) => {
    setDisplayOwnReaction(nextReaction);
    setDisplayLiked(nextReaction === "like");

    setDisplayReactionSummary((current) => {
      const next = { ...current };

      if (displayOwnReaction) {
        next[displayOwnReaction] = Math.max(0, next[displayOwnReaction] - 1);
      }

      if (nextReaction) {
        next[nextReaction] = (next[nextReaction] || 0) + 1;
      }

      const total = Object.values(next).reduce((sum, count) => sum + count, 0);
      setDisplayLikesCount(total);
      return next;
    });
  };

  const handleLike = async (reaction: SocialReactionType = "like") => {
    if (likePending) {
      return;
    }

    const previousLiked = displayLiked;
    const previousLikesCount = displayLikesCount;
    const previousOwnReaction = displayOwnReaction;
    const previousSummary = { ...displayReactionSummary };
    const nextReaction =
      previousOwnReaction === reaction ? null : reaction;

    setLikePending(true);
    applyOptimisticReaction(nextReaction);
    setLikeAnimTick((value) => value + 1);

    const ok = await onLike(post._id, reaction);
    if (!ok) {
      setDisplayLiked(previousLiked);
      setDisplayLikesCount(previousLikesCount);
      setDisplayOwnReaction(previousOwnReaction);
      setDisplayReactionSummary(previousSummary);
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
        className="font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
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
        className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
        onClick={() => onSelectTag(tag.toLowerCase())}
      >
        #{tag}
      </button>
    );
  };

  const handleSortChange = async (nextSort: "relevant" | "newest") => {
    if (nextSort === commentSort || commentsLoading) {
      return;
    }

    setCommentSort(nextSort);
    await onSetCommentsSortBy(post._id, nextSort);
  };

  const renderCommentItem = (comment: SocialComment) => (
    <CommentItem
      key={comment._id}
      comment={comment}
      onOpenProfile={onOpenProfile}
      postAuthorId={post.authorId._id}
      onReply={() => {
        setReplyingToCommentId((current) =>
          current === comment._id ? null : comment._id,
        );
      }}
    />
  );

  return (
    <article className="elevated-card p-4">
      <header className="mb-3 flex items-center gap-3">
        <button
          type="button"
          className="flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
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

      {post.mediaUrls?.length ? (
        <div className="mt-3">{renderPostMedia(post.mediaUrls)}</div>
      ) : null}

      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <button
          type="button"
          className="rounded-md font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
          onClick={openEngagement}
        >
          <span
            key={`likes-count-${likeAnimTick}`}
            className={cn("inline-block", likeAnimTick > 0 && "social-count-bump")}
          >
            {compactCountFormatter.format(displayLikesCount)} likes
          </span>
        </button>
        <span>·</span>
        <button
          type="button"
          className="rounded-md font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
          onClick={openEngagement}
        >
          <span
            key={`comments-count-${commentAnimTick}`}
            className={cn(
              "inline-block",
              commentAnimTick > 0 && "social-count-bump",
            )}
          >
            {compactCountFormatter.format(displayCommentsCount)} comments
          </span>
        </button>
        <span>·</span>
        <span className="uppercase">{post.privacy}</span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant={displayOwnReaction ? "default" : "outline"}
          size="sm"
          className="gap-2"
          onClick={() => handleLike("like")}
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

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {reactionOptions.map((reaction) => {
          const isActive = displayOwnReaction === reaction.type;
          const count = displayReactionSummary[reaction.type] || 0;

          return (
            <button
              key={reaction.type}
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
              onClick={() => handleLike(reaction.type)}
              disabled={likePending}
            >
              <span>{reaction.emoji}</span>
              <span>{reaction.label}</span>
              <span className="text-[11px] opacity-80">{count}</span>
            </button>
          );
        })}
      </div>

      {post.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {post.tags.map(renderTagChip)}
        </div>
      )}

      {showComments && (
        <div className="mt-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Comments
            </p>
            <div className="inline-flex rounded-md border border-border/70 bg-muted/30 p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium transition-colors",
                  commentSort === "relevant"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => void handleSortChange("relevant")}
                disabled={commentsLoading}
              >
                Most relevant
              </button>
              <button
                type="button"
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium transition-colors",
                  commentSort === "newest"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => void handleSortChange("newest")}
                disabled={commentsLoading}
              >
                Newest
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-2.5 py-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
              {(post.authorId.displayName || "U").slice(0, 1).toUpperCase()}
            </div>
            <Input
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="Add a comment..."
              aria-label="Write a comment"
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
              onFocus={() => setCommentComposerFocused(true)}
              onBlur={() => setCommentComposerFocused(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitComment(null);
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => void submitComment(null)}
              disabled={commentPending}
            >
              <SendHorizontal className="size-4" />
              {commentPending ? "Sending..." : "Post"}
            </Button>
          </div>

          <div className="flex min-h-4 items-center justify-between px-1 text-[11px] text-muted-foreground">
            <span>
              Seen by {Math.max(1, Math.min(99, displayLikesCount || 1))} people in this thread
            </span>
            {(commentComposerFocused || commentDraft.trim()) && (
              <span className="inline-flex items-center gap-1 font-medium text-primary/90">
                Typing
                <span
                  key={`typing-${commentDraft.length}-${commentComposerFocused ? 1 : 0}`}
                  className="inline-flex animate-pulse"
                >
                  ...
                </span>
              </span>
            )}
          </div>

          <div className="space-y-2">
            {shouldVirtualizeComments ? (
              <div className="h-[360px] overflow-hidden rounded-lg border border-border/60 bg-background/40">
                <Virtuoso
                  data={threadedVisibleComments}
                  itemContent={(_, item) => (
                    <div className="space-y-1.5 px-1 py-1">
                      {renderCommentItem(item.root)}

                      {item.replies.length > 0 && (
                        <button
                          type="button"
                          className="ml-8 inline-flex rounded-md px-1 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
                          onClick={() =>
                            setCollapsedRepliesByRoot((current) => ({
                              ...current,
                              [item.root._id]: !current[item.root._id],
                            }))
                          }
                        >
                          {collapsedRepliesByRoot[item.root._id]
                            ? `View ${item.replies.length} repl${item.replies.length > 1 ? "ies" : "y"}`
                            : "Hide replies"}
                        </button>
                      )}

                      {!collapsedRepliesByRoot[item.root._id] &&
                        item.replies.map((reply) => (
                          <div key={reply._id} className="ml-8">
                            <CommentItem
                              comment={reply}
                              onOpenProfile={onOpenProfile}
                              postAuthorId={post.authorId._id}
                              isReply
                              onReply={() => {
                                setReplyingToCommentId((current) =>
                                  current === item.root._id ? null : item.root._id,
                                );
                              }}
                            />
                          </div>
                        ))}

                      {replyingToCommentId === item.root._id && (
                        <div className="ml-8 flex items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-2 py-1.5">
                          <Input
                            value={replyDraftByCommentId[item.root._id] || ""}
                            onChange={(event) =>
                              setReplyDraftByCommentId((current) => ({
                                ...current,
                                [item.root._id]: event.target.value,
                              }))
                            }
                            placeholder={`Reply to ${item.root.authorId.displayName}...`}
                            className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void submitComment(item.root._id);
                              }
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            onClick={() => void submitComment(item.root._id)}
                          >
                            Reply
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                />
              </div>
            ) : (
              threadedVisibleComments.map((item) => (
                <div key={item.root._id} className="space-y-1.5">
                  {renderCommentItem(item.root)}

                  {item.replies.length > 0 && (
                    <button
                      type="button"
                      className="ml-8 inline-flex rounded-md px-1 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
                      onClick={() =>
                        setCollapsedRepliesByRoot((current) => ({
                          ...current,
                          [item.root._id]: !current[item.root._id],
                        }))
                      }
                    >
                      {collapsedRepliesByRoot[item.root._id]
                        ? `View ${item.replies.length} repl${item.replies.length > 1 ? "ies" : "y"}`
                        : "Hide replies"}
                    </button>
                  )}

                  {!collapsedRepliesByRoot[item.root._id] &&
                    item.replies.map((reply) => (
                      <div key={reply._id} className="ml-8">
                        <CommentItem
                          comment={reply}
                          onOpenProfile={onOpenProfile}
                          postAuthorId={post.authorId._id}
                          isReply
                          onReply={() => {
                            setReplyingToCommentId((current) =>
                              current === item.root._id ? null : item.root._id,
                            );
                          }}
                        />
                      </div>
                    ))}

                  {replyingToCommentId === item.root._id && (
                    <div className="ml-8 flex items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-2 py-1.5">
                      <Input
                        value={replyDraftByCommentId[item.root._id] || ""}
                        onChange={(event) =>
                          setReplyDraftByCommentId((current) => ({
                            ...current,
                            [item.root._id]: event.target.value,
                          }))
                        }
                        placeholder={`Reply to ${item.root.authorId.displayName}...`}
                        className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void submitComment(item.root._id);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={() => void submitComment(item.root._id)}
                      >
                        Reply
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}

            {(comments?.length || 0) > COMMENT_PREVIEW_COUNT && (
              <button
                type="button"
                className="w-full rounded-lg border border-dashed border-border/70 bg-muted/30 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
                onClick={() => setCommentsExpanded((prev) => !prev)}
              >
                {commentsExpanded
                  ? "Show fewer comments"
                  : `View all ${comments?.length || 0} comments`}
              </button>
            )}

            {!comments?.length && (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            )}

            {showComments && commentsPagination?.hasNextPage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => onLoadMoreComments(post._id)}
                disabled={commentsLoading}
              >
                {commentsLoading ? "Loading comments..." : "Load more comments"}
              </Button>
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
                    className="flex w-full items-center justify-between rounded-md border border-border/60 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
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
                      className="mb-1 rounded-sm text-left text-sm font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
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

      <Dialog
        open={lightboxOpen}
        onOpenChange={(open) => {
          setLightboxOpen(open);
          if (!open) {
            setLightboxZoom(1);
          }
        }}
      >
        <DialogContent className="max-w-5xl border-border/70 bg-background/95 p-4">
          <DialogHeader>
            <DialogTitle>Photo viewer</DialogTitle>
            <DialogDescription>
              {lightboxIndex + 1}/{post.mediaUrls?.length || 0} · Swipe on mobile, use arrow keys, or double-click to quick zoom.
            </DialogDescription>
          </DialogHeader>

          <div
            key={`lightbox-swipe-${swipeFeedbackDirection || "idle"}-${swipeFeedbackTick}`}
            className="relative mt-2 flex h-[70vh] items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/30"
            onTouchStart={handleLightboxTouchStart}
            onTouchMove={handleLightboxTouchMove}
            onTouchEnd={handleLightboxTouchEnd}
          >
            {post.mediaUrls?.length ? (
              <img
                src={post.mediaUrls[lightboxIndex]}
                alt={`post media ${lightboxIndex + 1}`}
                className={cn(
                  "max-h-full max-w-full object-contain transition-transform duration-200",
                  swipeFeedbackDirection === "left" && "-translate-x-1",
                  swipeFeedbackDirection === "right" && "translate-x-1",
                )}
                style={{
                  transform: `translateX(${swipeFeedbackDirection === "left" ? -4 : swipeFeedbackDirection === "right" ? 4 : 0}px) scale(${lightboxZoom})`,
                }}
                onDoubleClick={toggleQuickZoom}
              />
            ) : null}

            {(post.mediaUrls?.length || 0) > 1 && (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  onClick={goPrevMedia}
                >
                  <ChevronLeft className="size-5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  onClick={goNextMedia}
                >
                  <ChevronRight className="size-5" />
                </Button>
              </>
            )}
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={zoomOut}
              disabled={lightboxZoom <= 1}
            >
              <ZoomOut className="size-4" />
              Zoom out
            </Button>
            <span className="text-xs font-medium text-muted-foreground">
              {Math.round(lightboxZoom * 100)}%
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={resetZoom}
              disabled={lightboxZoom === 1}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={zoomIn}
              disabled={lightboxZoom >= 3}
            >
              <ZoomIn className="size-4" />
              Zoom in
            </Button>
          </div>

          {(post.mediaUrls?.length || 0) > 1 && (
            <div className="mt-3">
              <p className="mb-2 text-center text-xs font-medium text-muted-foreground">
                Quick thumbnails
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {post.mediaUrls.map((mediaUrl, index) => (
                  <button
                    key={`${mediaUrl}-${index}`}
                    type="button"
                    className={cn(
                      "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1",
                      index === lightboxIndex
                        ? "border-primary/70 ring-1 ring-primary/35"
                        : "border-border/70",
                    )}
                    onClick={() => {
                      setLightboxIndex(index);
                      setLightboxZoom(1);
                    }}
                  >
                    <img
                      src={mediaUrl}
                      alt={`Thumbnail ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </article>
  );
};

export default SocialPostCard;
