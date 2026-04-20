import {
  type Dispatch,
  type SetStateAction,
  type TouchEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatDistanceToNow } from "date-fns";
import CommentsPanel from "@/components/social/CommentsPanel";
import PostCardActions from "@/components/social/PostCardActions";
import PostCardHeader from "@/components/social/PostCardHeader";
import PostDialogs from "@/components/social/PostDialogs";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { safetyService } from "@/services/safetyService";
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
  density?: "comfortable" | "compact";
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
  onDeletePost?: (postId: string) => Promise<boolean>;
  onDeleteComment?: (postId: string, commentId: string) => Promise<number>;
  onOpenProfile?: (userId: string) => void;
  onSelectTag?: (tag: string) => void;
}

interface RootCommentThread {
  root: SocialComment;
  replies: SocialComment[];
}

type DeleteIntent =
  | { type: "post" }
  | { type: "comment"; commentId: string };

type LightboxSwipeDirection = "left" | "right" | null;
type TimerRef = { current: ReturnType<typeof setTimeout> | null };
type BooleanRef = { current: boolean };
type VisibleReactors = NonNullable<SocialPost["visibleReactors"]>;
type SetStateBool = Dispatch<SetStateAction<boolean>>;
type SetStateNumber = Dispatch<SetStateAction<number>>;
type SetStateReaction = Dispatch<SetStateAction<SocialReactionType | null>>;
type SetStateReactionSummary = Dispatch<SetStateAction<SocialReactionSummary>>;
type SetStateVisibleReactors = Dispatch<SetStateAction<VisibleReactors>>;

const MIN_REACTION_PENDING_MS = 180;
const MIN_COMMENT_PENDING_MS = 220;
const MIN_ENGAGEMENT_PENDING_MS = 140;
const MIN_COMMENTS_TOGGLE_PENDING_MS = 120;
const MIN_SHARE_PENDING_MS = 180;

const waitForMinimumPending = async (startedAt: number, minimumMs: number) => {
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= minimumMs) {
    return;
  }

  await new Promise((resolve) => {
    globalThis.setTimeout(resolve, minimumMs - elapsedMs);
  });
};

const getReactionSummaryFromPost = (post: SocialPost): SocialReactionSummary => {
  const hasReactionSummary = Boolean(post.reactionSummary);

  return {
    like: hasReactionSummary
      ? post.reactionSummary?.like ?? 0
      : post.likesCount || 0,
    love: post.reactionSummary?.love ?? 0,
    haha: post.reactionSummary?.haha ?? 0,
    wow: post.reactionSummary?.wow ?? 0,
    sad: post.reactionSummary?.sad ?? 0,
    angry: post.reactionSummary?.angry ?? 0,
  };
};

const buildVisibleReactorLabel = (visibleReactors: VisibleReactors) => {
  if (!visibleReactors?.length) {
    return "";
  }

  const names = visibleReactors
    .map((item) => String(item.displayName || "").trim())
    .filter(Boolean);

  if (!names.length) {
    return "";
  }

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names[0]} and ${names.length - 1} others`;
};

const getDeleteActionLabel = (
  deleteIntent: DeleteIntent | null,
  deletePending: boolean,
) => {
  if (deletePending) {
    return "Deleting...";
  }

  return deleteIntent?.type === "post" ? "Delete post" : "Delete comment";
};

const resolveSwipeDirection = (
  start: number | null,
  end: number | null,
): LightboxSwipeDirection => {
  if (start === null || end === null) {
    return null;
  }

  const delta = start - end;
  if (Math.abs(delta) < 48) {
    return null;
  }

  return delta > 0 ? "left" : "right";
};

const executeDeleteIntent = async ({
  deleteIntent,
  isOwnPost,
  onDeletePost,
  onDeleteComment,
  postId,
}: {
  deleteIntent: DeleteIntent;
  isOwnPost: boolean;
  onDeletePost?: (postId: string) => Promise<boolean>;
  onDeleteComment?: (postId: string, commentId: string) => Promise<number>;
  postId: string;
}) => {
  if (deleteIntent.type === "post") {
    if (!isOwnPost || !onDeletePost) {
      return 0;
    }

    await onDeletePost(postId);
    return 0;
  }

  if (!onDeleteComment) {
    return 0;
  }

  return onDeleteComment(postId, deleteIntent.commentId);
};

const runReactionFlow = async ({
  reaction,
  likePending,
  displayOwnReaction,
  displayLikesCount,
  displayReactionSummary,
  user,
  post,
  onLike,
  setLikePending,
  setManualReactionPickerOpen,
  setDisplayOwnReaction,
  setDisplayLikesCount,
  setDisplayReactionSummary,
  setDisplayVisibleReactors,
}: {
  reaction: SocialReactionType;
  likePending: boolean;
  displayOwnReaction: SocialReactionType | null;
  displayLikesCount: number;
  displayReactionSummary: SocialReactionSummary;
  user: { _id?: string; displayName?: string; username?: string; avatarUrl?: string | null } | null;
  post: SocialPost;
  onLike: (postId: string, reaction?: SocialReactionType) => Promise<boolean>;
  setLikePending: SetStateBool;
  setManualReactionPickerOpen: SetStateBool;
  setDisplayOwnReaction: SetStateReaction;
  setDisplayLikesCount: SetStateNumber;
  setDisplayReactionSummary: SetStateReactionSummary;
  setDisplayVisibleReactors: SetStateVisibleReactors;
}) => {
  if (likePending) {
    return;
  }

  const pendingStartedAt = Date.now();

  const previousOwnReaction = displayOwnReaction;
  const previousCount = displayLikesCount;
  const previousSummary = { ...displayReactionSummary };
  const nextReaction = previousOwnReaction === reaction ? null : reaction;

  setLikePending(true);
  setDisplayOwnReaction(nextReaction);
  setDisplayReactionSummary((current) => {
    const next = { ...current };
    if (displayOwnReaction) {
      next[displayOwnReaction] = Math.max(0, next[displayOwnReaction] - 1);
    }
    if (nextReaction) {
      next[nextReaction] = (next[nextReaction] || 0) + 1;
    }
    setDisplayLikesCount(Object.values(next).reduce((sum, item) => sum + item, 0));
    return next;
  });

  setDisplayVisibleReactors((current) => {
    const currentUserId = String(user?._id || "");
    if (!currentUserId) {
      return current;
    }

    const withoutCurrent = current.filter(
      (item) => String(item._id || "") !== currentUserId,
    );

    if (!nextReaction) {
      return withoutCurrent;
    }

    return [
      {
        _id: currentUserId,
        displayName: user?.displayName || "You",
        username: user?.username || "you",
        avatarUrl: user?.avatarUrl || null,
      },
      ...withoutCurrent,
    ].slice(0, 3);
  });

  try {
    const ok = await onLike(post._id, reaction);
    if (!ok) {
      setDisplayOwnReaction(previousOwnReaction);
      setDisplayLikesCount(previousCount);
      setDisplayReactionSummary(previousSummary);
      setDisplayVisibleReactors(post.visibleReactors || []);
    }
  } catch (error) {
    console.error("[social] handleReaction unexpected error", error);
    setDisplayOwnReaction(previousOwnReaction);
    setDisplayLikesCount(previousCount);
    setDisplayReactionSummary(previousSummary);
    setDisplayVisibleReactors(post.visibleReactors || []);
  } finally {
    await waitForMinimumPending(pendingStartedAt, MIN_REACTION_PENDING_MS);
    setLikePending(false);
    setManualReactionPickerOpen(false);
  }
};

const runSubmitCommentFlow = async ({
  parentCommentId,
  replyDraftByCommentId,
  commentDraft,
  commentPending,
  displayCommentsCount,
  onComment,
  postId,
  setCommentPending,
  setDisplayCommentsCount,
  setReplyDraftByCommentId,
  setReplyingToCommentId,
  setCommentDraft,
}: {
  parentCommentId?: string | null;
  replyDraftByCommentId: Record<string, string>;
  commentDraft: string;
  commentPending: boolean;
  displayCommentsCount: number;
  onComment: (
    postId: string,
    content: string,
    parentCommentId?: string | null,
  ) => Promise<boolean>;
  postId: string;
  setCommentPending: SetStateBool;
  setDisplayCommentsCount: SetStateNumber;
  setReplyDraftByCommentId: Dispatch<SetStateAction<Record<string, string>>>;
  setReplyingToCommentId: Dispatch<SetStateAction<string | null>>;
  setCommentDraft: Dispatch<SetStateAction<string>>;
}) => {
  const normalized = parentCommentId
    ? (replyDraftByCommentId[parentCommentId] || "").trim()
    : commentDraft.trim();

  if (!normalized || commentPending) {
    return;
  }

  const previousCount = displayCommentsCount;
  const pendingStartedAt = Date.now();
  setCommentPending(true);
  setDisplayCommentsCount((current) => current + 1);

  try {
    const ok = await onComment(postId, normalized, parentCommentId);
    if (ok) {
      if (parentCommentId) {
        setReplyDraftByCommentId((current) => ({ ...current, [parentCommentId]: "" }));
        setReplyingToCommentId(null);
      } else {
        setCommentDraft("");
      }
    } else {
      setDisplayCommentsCount(previousCount);
    }
  } catch (error) {
    console.error("[social] submitComment error", error);
    setDisplayCommentsCount(previousCount);
  } finally {
    await waitForMinimumPending(pendingStartedAt, MIN_COMMENT_PENDING_MS);
    setCommentPending(false);
  }
};

const runOpenEngagementFlow = async ({
  setShowEngagement,
  engagement,
  onFetchEngagement,
  postId,
}: {
  setShowEngagement: SetStateBool;
  engagement?: SocialPostEngagement;
  onFetchEngagement: (postId: string) => Promise<void>;
  postId: string;
}) => {
  setShowEngagement(true);
  if (!engagement) {
    await onFetchEngagement(postId);
  }
};

const runSharePostFlow = async ({
  postId,
  authorDisplayName,
  caption,
}: {
  postId: string;
  authorDisplayName: string;
  caption?: string;
}) => {
  const shareUrl = `${globalThis.location.origin}/post/${postId}`;
  const text = `${authorDisplayName}: ${caption || "New post"}`;

  try {
    if (navigator.share) {
      await navigator.share({ title: "Shared post", text, url: shareUrl });
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
    toast.success("Post link copied");
  } catch (error) {
    console.error("[social] share post error", error);
    toast.error("Could not share this post");
  }
};

const hydrateMediaDimensions = ({
  mediaUrls,
  mediaMeta,
  setMediaDimensions,
}: {
  mediaUrls?: string[];
  mediaMeta: Record<string, { width: number; height: number }>;
  setMediaDimensions: (url: string, width: number, height: number) => void;
}) => {
  if (!mediaUrls?.length) {
    return undefined;
  }

  let cancelled = false;
  mediaUrls.forEach((url) => {
    if (mediaMeta[url]) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      if (cancelled) {
        return;
      }

      setMediaDimensions(url, image.naturalWidth, image.naturalHeight);
    };
    image.src = url;
  });

  return () => {
    cancelled = true;
  };
};

const bindLightboxKeydown = ({
  lightboxOpen,
  goPrevMedia,
  goNextMedia,
  onClose,
}: {
  lightboxOpen: boolean;
  goPrevMedia: () => void;
  goNextMedia: () => void;
  onClose: () => void;
}) => {
  if (!lightboxOpen) {
    return undefined;
  }

  const onKeyDown = (event: KeyboardEvent) => {
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
      onClose();
    }
  };

  globalThis.window.addEventListener("keydown", onKeyDown);
  return () => globalThis.window.removeEventListener("keydown", onKeyDown);
};

const applyLightboxSwipe = ({
  start,
  end,
  triggerSwipe,
  goNextMedia,
  goPrevMedia,
}: {
  start: number | null;
  end: number | null;
  triggerSwipe: (direction: "left" | "right") => void;
  goNextMedia: () => void;
  goPrevMedia: () => void;
}) => {
  const direction = resolveSwipeDirection(start, end);
  if (!direction) {
    return;
  }

  triggerSwipe(direction);
  if (direction === "left") {
    goNextMedia();
    return;
  }

  goPrevMedia();
};

const startReactionLongPressTimer = ({
  timerRef,
  triggeredRef,
  onOpen,
}: {
  timerRef: TimerRef;
  triggeredRef: BooleanRef;
  onOpen: () => void;
}) => {
  triggeredRef.current = false;
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }

  timerRef.current = setTimeout(() => {
    triggeredRef.current = true;
    onOpen();
  }, 320);
};

const clearReactionLongPressTimer = (
  timerRef: TimerRef,
) => {
  if (!timerRef.current) {
    return;
  }

  clearTimeout(timerRef.current);
  timerRef.current = null;
};

const maybeRequestDeletePost = ({
  isOwnPost,
  onDeletePost,
  setDeleteIntent,
}: {
  isOwnPost: boolean;
  onDeletePost?: (postId: string) => Promise<boolean>;
  setDeleteIntent: Dispatch<SetStateAction<DeleteIntent | null>>;
}) => {
  if (isOwnPost && onDeletePost) {
    setDeleteIntent({ type: "post" });
  }
};

const maybeRequestDeleteComment = ({
  commentId,
  onDeleteComment,
  setDeleteIntent,
}: {
  commentId: string;
  onDeleteComment?: (postId: string, commentId: string) => Promise<number>;
  setDeleteIntent: Dispatch<SetStateAction<DeleteIntent | null>>;
}) => {
  if (onDeleteComment) {
    setDeleteIntent({ type: "comment", commentId });
  }
};

const toggleCommentsForPost = async ({
  showComments,
  setShowComments,
  comments,
  onFetchComments,
  postId,
}: {
  showComments: boolean;
  setShowComments: SetStateBool;
  comments?: SocialComment[];
  onFetchComments: (postId: string) => Promise<void>;
  postId: string;
}) => {
  const next = !showComments;
  setShowComments(next);
  if (next && !comments) {
    await onFetchComments(postId);
  }
};

const PostMediaBlock = ({
  mediaUrls,
  isPortrait,
  onOpenLightbox,
}: {
  mediaUrls: string[];
  isPortrait: (url: string) => boolean;
  onOpenLightbox: (index: number) => void;
}) => {
  if (!mediaUrls.length) {
    return null;
  }

  if (mediaUrls.length === 1) {
    const portrait = isPortrait(mediaUrls[0]);
    return (
      <button
        type="button"
        className={cn(
          "social-post-media-block social-post-media-block--command social-post-media-single social-media-tile image-hover-shimmer mt-2.5 flex w-full items-center justify-center overflow-hidden rounded-lg border",
          portrait ? "max-h-[620px]" : "max-h-[500px]",
        )}
        onClick={() => onOpenLightbox(0)}
      >
        <img
          src={mediaUrls[0]}
          alt="post media"
          className="max-h-[600px] max-w-full object-contain"
          loading="lazy"
        />
      </button>
    );
  }

  const countStr = mediaUrls.length >= 4 ? "4+" : String(mediaUrls.length);
  const remaining = mediaUrls.length - 4;
  let layoutVariant = "quad";
  if (mediaUrls.length === 2) {
    layoutVariant = "duo";
  } else if (mediaUrls.length === 3) {
    layoutVariant = "triad";
  }

  return (
    <div
      className="social-post-media-block social-post-media-block--command social-mosaic-layout social-mosaic-layout--command"
      data-count={countStr}
      data-layout={layoutVariant}
    >
      {mediaUrls.slice(0, 4).map((media, index) => {
        const isLast = index === 3 && remaining > 0;
        return (
          <button
            key={`${media}-${index}`}
            type="button"
            className="social-mosaic-tile social-mosaic-tile--command image-hover-shimmer"
            data-hero={index === 0 ? "true" : "false"}
            onClick={() => onOpenLightbox(index)}
          >
            <img src={media} alt={`post media ${index + 1}`} loading="lazy" />
            {isLast && (
              <div className="social-mosaic-overlay">
                +{remaining}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};

const SocialPostCard = ({
  post,
  density = "comfortable",
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
  onDeletePost,
  onDeleteComment,
  onOpenProfile,
  onSelectTag,
}: SocialPostCardProps) => {
  const { user } = useAuthStore();
  const [showComments, setShowComments] = useState(false);
  const [showEngagement, setShowEngagement] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyDraftByCommentId, setReplyDraftByCommentId] = useState<Record<string, string>>({});
  const [collapsedRepliesByRoot, setCollapsedRepliesByRoot] = useState<Record<string, boolean>>({});
  const [displayOwnReaction, setDisplayOwnReaction] = useState<SocialReactionType | null>(post.ownReaction || null);
  const [displayLikesCount, setDisplayLikesCount] = useState(post.likesCount);
  const [displayCommentsCount, setDisplayCommentsCount] = useState(post.commentsCount);
  const [displayReactionSummary, setDisplayReactionSummary] = useState<SocialReactionSummary>(
    getReactionSummaryFromPost(post),
  );
  const [likePending, setLikePending] = useState(false);
  const [manualReactionPickerOpen, setManualReactionPickerOpen] = useState(false);
  const [commentPending, setCommentPending] = useState(false);
  const [engagementPending, setEngagementPending] = useState(false);
  const [commentsTogglePending, setCommentsTogglePending] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [commentSort, setCommentSort] = useState<"relevant" | "newest">(commentsSortBy || "relevant");
  const [deleteIntent, setDeleteIntent] = useState<DeleteIntent | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [displayVisibleReactors, setDisplayVisibleReactors] = useState<VisibleReactors>(
    post.visibleReactors || [],
  );

  const [mediaMeta, setMediaMeta] = useState<Record<string, { width: number; height: number }>>({});
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeEndXRef = useRef<number | null>(null);
  const reactionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionLongPressTriggeredRef = useRef(false);
  const engagementDescriptionId = useId();

  const postReactionSummary = useMemo(() => {
    const hasReactionSummary = Boolean(post.reactionSummary);

    return {
      like: hasReactionSummary
        ? post.reactionSummary?.like ?? 0
        : post.likesCount || 0,
      love: post.reactionSummary?.love ?? 0,
      haha: post.reactionSummary?.haha ?? 0,
      wow: post.reactionSummary?.wow ?? 0,
      sad: post.reactionSummary?.sad ?? 0,
      angry: post.reactionSummary?.angry ?? 0,
    };
  }, [post.reactionSummary, post.likesCount]);

  const setMediaDimensions = useCallback((url: string, width: number, height: number) => {
    setMediaMeta((current) => ({
      ...current,
      [url]: { width, height },
    }));
  }, []);

  const clearReactionCloseTimer = () => {
    if (reactionCloseTimerRef.current) {
      clearTimeout(reactionCloseTimerRef.current);
      reactionCloseTimerRef.current = null;
    }
  };

  const openReactionPicker = () => {
    clearReactionCloseTimer();
    setManualReactionPickerOpen(true);
  };

  const scheduleCloseReactionPicker = () => {
    clearReactionCloseTimer();
    reactionCloseTimerRef.current = setTimeout(() => {
      setManualReactionPickerOpen(false);
      reactionCloseTimerRef.current = null;
    }, 180);
  };

  useEffect(() => {
    if (!likePending) {
      setDisplayOwnReaction(post.ownReaction || null);
      setDisplayLikesCount(post.likesCount);
      setDisplayVisibleReactors(post.visibleReactors || []);
      setDisplayReactionSummary(postReactionSummary);
    }
  }, [
    post.ownReaction,
    post.likesCount,
    post.visibleReactors,
    postReactionSummary,
    likePending,
  ]);

  useEffect(() => {
    if (!commentPending) {
      setDisplayCommentsCount(post.commentsCount);
    }
  }, [post.commentsCount, commentPending]);

  useEffect(() => {
    setCommentSort(commentsSortBy || "relevant");
  }, [commentsSortBy]);

  useEffect(() => {
    return hydrateMediaDimensions({
      mediaUrls: post.mediaUrls,
      mediaMeta,
      setMediaDimensions,
    });
  }, [post.mediaUrls, mediaMeta, setMediaDimensions]);

  useEffect(() => {
    const longPressTimerRef = reactionLongPressTimerRef;
    return () => {
      clearReactionCloseTimer();
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const postedAgo = useMemo(
    () => formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }),
    [post.createdAt],
  );

  const visibleComments = useMemo(() => {
    const source = comments || [];
    return source;
  }, [comments]);

  const rootsWithReplies = useMemo<RootCommentThread[]>(() => {
    const roots = visibleComments.filter((item) => !item.parentCommentId);
    const repliesByRoot = visibleComments.reduce<Record<string, SocialComment[]>>((acc, item) => {
      if (!item.parentCommentId) {
        return acc;
      }

      if (!acc[item.parentCommentId]) {
        acc[item.parentCommentId] = [];
      }
      acc[item.parentCommentId].push(item);
      return acc;
    }, {});

    return roots.map((root) => ({
      root,
      replies: repliesByRoot[root._id] || [],
    }));
  }, [visibleComments]);

  useEffect(() => {
    setCollapsedRepliesByRoot((current) => {
      const next = { ...current };
      rootsWithReplies.forEach((item) => {
        next[item.root._id] ??= item.replies.length > 0;
      });
      return next;
    });
  }, [rootsWithReplies]);

  const totalReactions =
    (displayReactionSummary.like || 0) +
    (displayReactionSummary.love || 0) +
    (displayReactionSummary.haha || 0) +
    (displayReactionSummary.wow || 0) +
    (displayReactionSummary.sad || 0) +
    (displayReactionSummary.angry || 0);

  const reactionLabelMap: Record<SocialReactionType, string> = {
    like: "Like",
    love: "Love",
    haha: "Haha",
    wow: "Wow",
    sad: "Sad",
    angry: "Angry",
  };

  const reactionColorClassMap: Record<SocialReactionType, string> = {
    like: "social-reaction-like",
    love: "social-reaction-love",
    haha: "social-reaction-haha",
    wow: "social-reaction-wow",
    sad: "social-reaction-sad",
    angry: "social-reaction-angry",
  };

  const displayedReaction = displayOwnReaction || "like";
  const displayedReactionLabel = reactionLabelMap[displayedReaction];
  const displayedReactionColorClass = displayOwnReaction
    ? reactionColorClassMap[displayOwnReaction]
    : "social-reaction-default";

  const topReactionTypes = useMemo(
    () =>
      (Object.entries(displayReactionSummary) as Array<
        [SocialReactionType, number]
      >)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([reactionType]) => reactionType),
    [displayReactionSummary],
  );

  const reactionsCount = totalReactions > 0
    ? totalReactions
    : Math.max(0, displayLikesCount || 0);
  const hasReactions = reactionsCount > 0;
  const visibleReactorLabel = useMemo(
    () => buildVisibleReactorLabel(displayVisibleReactors),
    [displayVisibleReactors],
  );
  const reactionSummaryLabel = visibleReactorLabel
    ? `${visibleReactorLabel} | ${reactionsCount}`
    : String(reactionsCount);

  const isPortrait = (url: string) => {
    const meta = mediaMeta[url];
    return Boolean(meta && meta.height > meta.width);
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
    return bindLightboxKeydown({
      lightboxOpen,
      goPrevMedia,
      goNextMedia,
      onClose: () => {
        setLightboxOpen(false);
        setLightboxZoom(1);
      },
    });
  }, [lightboxOpen, goPrevMedia, goNextMedia]);

  const triggerSwipe = (direction: "left" | "right") => {
    setSwipeDirection(direction);
    globalThis.setTimeout(() => setSwipeDirection(null), 120);
  };

  const onLightboxTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    swipeStartXRef.current = event.touches[0]?.clientX ?? null;
    swipeEndXRef.current = null;
  };

  const onLightboxTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    swipeEndXRef.current = event.touches[0]?.clientX ?? null;
  };

  const onLightboxTouchEnd = () => {
    applyLightboxSwipe({
      start: swipeStartXRef.current,
      end: swipeEndXRef.current,
      triggerSwipe,
      goNextMedia,
      goPrevMedia,
    });
  };

  const handleReaction = async (reaction: SocialReactionType) => {
    await runReactionFlow({
      reaction,
      likePending,
      displayOwnReaction,
      displayLikesCount,
      displayReactionSummary,
      user,
      post,
      onLike,
      setLikePending,
      setManualReactionPickerOpen,
      setDisplayOwnReaction,
      setDisplayLikesCount,
      setDisplayReactionSummary,
      setDisplayVisibleReactors,
    });
  };

  const onPrimaryLikeTouchStart = () => {
    startReactionLongPressTimer({
      timerRef: reactionLongPressTimerRef,
      triggeredRef: reactionLongPressTriggeredRef,
      onOpen: openReactionPicker,
    });
  };

  const onPrimaryLikeTouchEnd = () => {
    clearReactionLongPressTimer(reactionLongPressTimerRef);
  };

  const toggleComments = async () => {
    if (commentsTogglePending) {
      return;
    }

    const pendingStartedAt = Date.now();
    setCommentsTogglePending(true);

    try {
      await toggleCommentsForPost({
        showComments,
        setShowComments,
        comments,
        onFetchComments,
        postId: post._id,
      });
    } finally {
      await waitForMinimumPending(
        pendingStartedAt,
        MIN_COMMENTS_TOGGLE_PENDING_MS,
      );
      setCommentsTogglePending(false);
    }
  };

  const submitComment = useCallback(async (parentCommentId?: string | null) => {
    await runSubmitCommentFlow({
      parentCommentId,
      replyDraftByCommentId,
      commentDraft,
      commentPending,
      displayCommentsCount,
      onComment,
      postId: post._id,
      setCommentPending,
      setDisplayCommentsCount,
      setReplyDraftByCommentId,
      setReplyingToCommentId,
      setCommentDraft,
    });
  }, [
    commentDraft,
    commentPending,
    displayCommentsCount,
    onComment,
    post._id,
    replyDraftByCommentId,
  ]);

  const toggleRootReplies = (rootId: string) => {
    setCollapsedRepliesByRoot((current) => ({
      ...current,
      [rootId]: !current[rootId],
    }));
  };

  const updateReplyDraft = (rootId: string, value: string) => {
    setReplyDraftByCommentId((current) => ({
      ...current,
      [rootId]: value,
    }));
  };

  const openEngagement = async () => {
    if (engagementPending) {
      return;
    }

    const pendingStartedAt = Date.now();
    setEngagementPending(true);

    try {
      await runOpenEngagementFlow({
        setShowEngagement,
        engagement,
        onFetchEngagement,
        postId: post._id,
      });
    } finally {
      await waitForMinimumPending(pendingStartedAt, MIN_ENGAGEMENT_PENDING_MS);
      setEngagementPending(false);
    }
  };

  const sharePost = async () => {
    if (sharePending) {
      return;
    }

    const pendingStartedAt = Date.now();
    setSharePending(true);

    try {
      await runSharePostFlow({
        postId: post._id,
        authorDisplayName: post.authorId.displayName,
        caption: post.caption,
      });
    } finally {
      await waitForMinimumPending(pendingStartedAt, MIN_SHARE_PENDING_MS);
      setSharePending(false);
    }
  };

  const composerAvatarUrl = user?.avatarUrl || "";
  const composerDisplayName = user?.displayName || "You";
  const isOwnPost = String(user?._id || "") === String(post.authorId._id || "");

  const requestDeletePost = () => {
    maybeRequestDeletePost({ isOwnPost, onDeletePost, setDeleteIntent });
  };

  const requestReportPost = async () => {
    if (isOwnPost) {
      return;
    }

    try {
      await safetyService.createReport({
        targetType: "post",
        targetId: post._id,
        reason: "other",
      });
      toast.success("Report submitted");
    } catch {
      toast.error("Could not submit report");
    }
  };

  const requestDeleteComment = (commentId: string) => {
    maybeRequestDeleteComment({ commentId, onDeleteComment, setDeleteIntent });
  };

  const requestReportComment = async (commentId: string) => {
    try {
      await safetyService.createReport({
        targetType: "comment",
        targetId: commentId,
        reason: "harassment",
      });
      toast.success("Report submitted");
    } catch {
      toast.error("Could not submit report");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteIntent) {
      return;
    }

    setDeletePending(true);

    try {
      const deletedCount = await executeDeleteIntent({
        deleteIntent,
        isOwnPost,
        onDeletePost,
        onDeleteComment,
        postId: post._id,
      });
      if (deletedCount > 0) {
        setDisplayCommentsCount((current) => Math.max(0, current - deletedCount));
      }
    } catch (error) {
      console.error("[social] delete action failed", error);
      toast.error("Could not complete delete action");
    } finally {
      setDeletePending(false);
      setDeleteIntent(null);
    }
  };

  const deleteActionLabel = getDeleteActionLabel(deleteIntent, deletePending);
  const interactionBusy =
    likePending ||
    commentPending ||
    deletePending ||
    commentsTogglePending ||
    sharePending ||
    engagementPending;
  let interactionStatusLabel = "";
  if (deletePending) {
    interactionStatusLabel = "Deleting item";
  } else if (commentPending) {
    interactionStatusLabel = "Sending comment";
  } else if (likePending) {
    interactionStatusLabel = "Updating reaction";
  } else if (commentsTogglePending) {
    interactionStatusLabel = "Loading comments";
  } else if (engagementPending) {
    interactionStatusLabel = "Opening engagement details";
  } else if (sharePending) {
    interactionStatusLabel = "Preparing share";
  }

  return (
    <article
      className={cn(
        "social-card social-post-card social-post-card--command social-post-card-hierarchy social-post-card--editorial",
        density === "compact" ? "p-3" : "p-3.5",
      )}
      aria-busy={interactionBusy}
    >
      <p className="sr-only" aria-live="polite">
        {interactionStatusLabel}
      </p>

      <PostCardHeader
        post={post}
        postedAgo={postedAgo}
        isOwnPost={isOwnPost}
        canDeletePost={Boolean(onDeletePost)}
        canReportPost={!isOwnPost}
        onOpenProfile={onOpenProfile}
        onRequestDeletePost={requestDeletePost}
        onRequestReportPost={() => {
          void requestReportPost();
        }}
      />

      {post.caption && (
        <p
          className={cn(
            "social-post-plain-text social-post-caption social-post-caption--editorial whitespace-pre-wrap text-sm",
            density === "compact" ? "mt-1.5" : "mt-2.5",
          )}
        >
          {post.caption}
        </p>
      )}

      {post.tags.length > 0 && (
        <div
          className={cn(
            "social-post-tags-wrap flex flex-wrap gap-2",
            density === "compact" ? "mt-1" : "mt-1.5",
          )}
        >
          {post.tags.map((tag) => (
            <button
              key={`${post._id}-${tag}`}
              type="button"
              className="social-tag-btn social-tag-btn--command text-sm font-medium hover:underline"
              onClick={() => onSelectTag?.(tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      <PostMediaBlock
        mediaUrls={post.mediaUrls || []}
        isPortrait={isPortrait}
        onOpenLightbox={openLightbox}
      />

      <PostCardActions
        hasReactions={hasReactions}
        topReactionTypes={topReactionTypes}
        reactionSummaryLabel={reactionSummaryLabel}
        displayCommentsCount={displayCommentsCount}
        engagementPending={engagementPending}
        commentsPending={commentsTogglePending}
        sharePending={sharePending}
        onOpenEngagement={() => {
          void openEngagement();
        }}
        onToggleComments={() => {
          void toggleComments();
        }}
        onSharePost={() => {
          void sharePost();
        }}
        activeReaction={displayOwnReaction}
        displayedReaction={displayedReaction}
        displayedReactionLabel={displayedReactionLabel}
        displayedReactionColorClass={displayedReactionColorClass}
        reactionPickerOpen={manualReactionPickerOpen}
        likePending={likePending}
        longPressTriggeredRef={reactionLongPressTriggeredRef}
        onHandleReaction={(reaction) => {
          void handleReaction(reaction);
        }}
        onOpenReactionPicker={openReactionPicker}
        onScheduleCloseReactionPicker={scheduleCloseReactionPicker}
        onPrimaryLikeTouchStart={onPrimaryLikeTouchStart}
        onPrimaryLikeTouchEnd={onPrimaryLikeTouchEnd}
      />

      <CommentsPanel
        visible={showComments}
        postId={post._id}
        postAuthorId={post.authorId._id}
        currentUserId={String(user?._id || "")}
        composerAvatarUrl={composerAvatarUrl}
        composerDisplayName={composerDisplayName}
        commentDraft={commentDraft}
        commentPending={commentPending}
        commentActionsDisabled={commentPending || deletePending}
        commentSort={commentSort}
        rootsWithReplies={rootsWithReplies}
        collapsedRepliesByRoot={collapsedRepliesByRoot}
        replyDraftByCommentId={replyDraftByCommentId}
        replyingToCommentId={replyingToCommentId}
        commentsPagination={commentsPagination}
        commentsLoading={commentsLoading}
        onCommentDraftChange={setCommentDraft}
        onSubmitComment={(parentCommentId) => {
          void submitComment(parentCommentId);
        }}
        onSetCommentSort={(sortBy) => {
          setCommentSort(sortBy);
          void onSetCommentsSortBy(post._id, sortBy);
        }}
        onLoadMoreComments={onLoadMoreComments}
        onOpenProfile={onOpenProfile}
        onToggleRootReplies={toggleRootReplies}
        onStartReply={setReplyingToCommentId}
        onReplyDraftChange={updateReplyDraft}
        onDeleteComment={requestDeleteComment}
        onReportComment={(commentId) => {
          void requestReportComment(commentId);
        }}
      />

      <PostDialogs
        showEngagement={showEngagement}
        engagementDescriptionId={engagementDescriptionId}
        engagement={engagement}
        onOpenProfile={onOpenProfile}
        onCloseEngagement={setShowEngagement}
        deleteIntent={deleteIntent}
        deletePending={deletePending}
        deleteActionLabel={deleteActionLabel}
        onCloseDeleteDialog={(open) => {
          if (!open && !deletePending) {
            setDeleteIntent(null);
          }
        }}
        onCancelDelete={() => setDeleteIntent(null)}
        onConfirmDelete={() => {
          void handleConfirmDelete();
        }}
        lightboxOpen={lightboxOpen}
        lightboxIndex={lightboxIndex}
        lightboxZoom={lightboxZoom}
        swipeDirection={swipeDirection}
        mediaUrls={post.mediaUrls || []}
        onCloseLightbox={(open) => {
          setLightboxOpen(open);
          if (!open) {
            setLightboxZoom(1);
          }
        }}
        onLightboxTouchStart={onLightboxTouchStart}
        onLightboxTouchMove={onLightboxTouchMove}
        onLightboxTouchEnd={onLightboxTouchEnd}
        onPrevMedia={goPrevMedia}
        onNextMedia={goNextMedia}
        onSetLightboxZoom={setLightboxZoom}
      />
    </article>
  );
};

export default SocialPostCard;
