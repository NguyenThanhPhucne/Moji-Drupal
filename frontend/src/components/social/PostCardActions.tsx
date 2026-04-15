import { Loader2, MessageCircle, Share2, ThumbsUp } from "lucide-react";
import ReactionPopover from "@/components/social/ReactionPopover";
import { ReactionGlyph } from "@/components/social/FacebookReactionIcons";
import { cn } from "@/lib/utils";
import type { SocialReactionType } from "@/types/social";

type BooleanRef = { current: boolean };

interface PostCardActionsProps {
  hasReactions: boolean;
  topReactionTypes: SocialReactionType[];
  reactionSummaryLabel: string;
  displayCommentsCount: number;
  engagementPending: boolean;
  commentsPending: boolean;
  sharePending: boolean;
  onOpenEngagement: () => void;
  onToggleComments: () => void;
  onSharePost: () => void;
  activeReaction: SocialReactionType | null;
  displayedReaction: SocialReactionType;
  displayedReactionLabel: string;
  displayedReactionColorClass: string;
  reactionPickerOpen: boolean;
  likePending: boolean;
  longPressTriggeredRef: BooleanRef;
  onHandleReaction: (reaction: SocialReactionType) => void;
  onOpenReactionPicker: () => void;
  onScheduleCloseReactionPicker: () => void;
  onPrimaryLikeTouchStart: () => void;
  onPrimaryLikeTouchEnd: () => void;
}

const PostCardActions = ({
  hasReactions,
  topReactionTypes,
  reactionSummaryLabel,
  displayCommentsCount,
  engagementPending,
  commentsPending,
  sharePending,
  onOpenEngagement,
  onToggleComments,
  onSharePost,
  activeReaction,
  displayedReaction,
  displayedReactionLabel,
  displayedReactionColorClass,
  reactionPickerOpen,
  likePending,
  longPressTriggeredRef,
  onHandleReaction,
  onOpenReactionPicker,
  onScheduleCloseReactionPicker,
  onPrimaryLikeTouchStart,
  onPrimaryLikeTouchEnd,
}: PostCardActionsProps) => {
  let reactionIcon = (
    <ThumbsUp className="h-4.5 w-4.5 group-active:scale-95 transition-transform" />
  );

  if (likePending) {
    reactionIcon = <Loader2 className="h-4.5 w-4.5 animate-spin" />;
  } else if (activeReaction) {
    reactionIcon = (
      <ReactionGlyph
        reaction={displayedReaction}
        className="h-5 w-5 like-bounce-burst group-active:scale-95"
      />
    );
  }

  const primaryLikeLabel = likePending ? "Updating..." : displayedReactionLabel;
  const commentsLabel = commentsPending ? "Loading..." : "Comment";
  const shareLabel = sharePending ? "Sharing..." : "Share";
  const commentsCountLabel = `${displayCommentsCount} comments`;

  return (
    <>
      <div
        className="social-text-muted social-post-stats mt-3 flex items-center justify-between text-sm"
        data-testid="post-card-stats"
      >
        {hasReactions ? (
          <button
            type="button"
            className="flex items-center gap-1 hover:underline"
            onClick={onOpenEngagement}
            data-testid="post-engagement-trigger"
            disabled={engagementPending}
            aria-busy={engagementPending}
          >
            <span className="inline-flex -space-x-1">
              {topReactionTypes.length ? (
                topReactionTypes.map((reactionType) => (
                  <span key={reactionType} className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white">
                    <ReactionGlyph reaction={reactionType} className="h-5 w-5" />
                  </span>
                ))
              ) : (
                <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white">
                  <ReactionGlyph reaction="like" className="h-5 w-5" />
                </span>
              )}
            </span>
            <span className="counter-slide-wrapper">
              <span key={reactionSummaryLabel} className="counter-slide-inner animate-in slide-in-from-bottom-2 fade-in duration-300">
                {engagementPending ? "Loading..." : reactionSummaryLabel}
              </span>
            </span>
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="hover:underline"
          onClick={onToggleComments}
          data-testid="post-comments-count-trigger"
          disabled={commentsPending}
          aria-busy={commentsPending}
        >
          <span aria-live="polite">{commentsCountLabel}</span>
        </button>
      </div>

      <div
        className="social-divider social-post-action-row mt-2 grid grid-cols-3 border-t border-border/30 pt-1.5"
        data-testid="post-card-actions"
      >
        <div className="group relative">
          <ReactionPopover
            activeReaction={activeReaction}
            open={reactionPickerOpen}
            disabled={likePending}
            onMouseEnter={onOpenReactionPicker}
            onMouseLeave={onScheduleCloseReactionPicker}
            onSelect={onHandleReaction}
          />
          <button
            type="button"
            className={cn(
              "post-action-btn-hover social-post-comment-action social-post-action-btn flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold",
              displayedReactionColorClass,
              likePending && "cursor-wait opacity-85",
            )}
            data-testid="post-like-button"
            onClick={() => {
              if (longPressTriggeredRef.current) {
                longPressTriggeredRef.current = false;
                return;
              }

              if (activeReaction) {
                onHandleReaction(activeReaction);
                return;
              }

              onHandleReaction("like");
            }}
            onTouchStart={onPrimaryLikeTouchStart}
            onTouchEnd={onPrimaryLikeTouchEnd}
            onTouchCancel={onPrimaryLikeTouchEnd}
            onMouseEnter={onOpenReactionPicker}
            onMouseLeave={onScheduleCloseReactionPicker}
            onFocus={onOpenReactionPicker}
            onBlur={onScheduleCloseReactionPicker}
            onContextMenu={(event) => {
              event.preventDefault();
              onOpenReactionPicker();
            }}
            disabled={likePending}
            aria-busy={likePending}
          >
            {reactionIcon}
            <span aria-live="polite">{primaryLikeLabel}</span>
          </button>
        </div>

        <button
          type="button"
          className="post-action-btn-hover social-post-comment-action social-post-action-btn flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold"
          onClick={onToggleComments}
          data-testid="post-comment-button"
          disabled={commentsPending}
          aria-busy={commentsPending}
        >
          {commentsPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="h-4 w-4" />
          )}
          <span aria-live="polite">{commentsLabel}</span>
        </button>

        <button
          type="button"
          className="post-action-btn-hover social-post-comment-action social-post-action-btn flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold"
          onClick={onSharePost}
          data-testid="post-share-button"
          disabled={sharePending}
          aria-busy={sharePending}
        >
          {sharePending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          <span aria-live="polite">{shareLabel}</span>
        </button>
      </div>
    </>
  );
};

export default PostCardActions;
