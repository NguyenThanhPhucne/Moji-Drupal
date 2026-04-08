import { MessageCircle, Share2, ThumbsUp } from "lucide-react";
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
            <span>{reactionSummaryLabel}</span>
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="hover:underline"
          onClick={onToggleComments}
          data-testid="post-comments-count-trigger"
        >
          {displayCommentsCount} comments
        </button>
      </div>

      <div
        className="social-divider social-post-action-row mt-2 grid grid-cols-3 border-t pt-1"
        data-testid="post-card-actions"
      >
        <div className="group relative">
          <ReactionPopover
            activeReaction={activeReaction}
            open={reactionPickerOpen}
            onMouseEnter={onOpenReactionPicker}
            onMouseLeave={onScheduleCloseReactionPicker}
            onSelect={onHandleReaction}
          />
          <button
            type="button"
            className={cn(
              "social-post-comment-action social-post-action-btn flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold",
              displayedReactionColorClass,
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
          >
            {activeReaction ? (
              <ReactionGlyph reaction={displayedReaction} className="h-5 w-5" />
            ) : (
              <ThumbsUp className="h-4.5 w-4.5" />
            )}
            {displayedReactionLabel}
          </button>
        </div>

        <button
          type="button"
          className="social-post-comment-action social-post-action-btn flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold"
          onClick={onToggleComments}
          data-testid="post-comment-button"
        >
          <MessageCircle className="h-4 w-4" />
          Comment
        </button>

        <button
          type="button"
          className="social-post-comment-action social-post-action-btn flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold"
          onClick={onSharePost}
          data-testid="post-share-button"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
      </div>
    </>
  );
};

export default PostCardActions;
