import { AlertTriangle, ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { TouchEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SocialPostEngagement } from "@/types/social";

type DeleteIntent =
  | { type: "post" }
  | { type: "comment"; commentId: string };

interface PostDialogsProps {
  showEngagement: boolean;
  engagementDescriptionId: string;
  engagement?: SocialPostEngagement;
  onOpenProfile?: (userId: string) => void;
  onCloseEngagement: (open: boolean) => void;
  deleteIntent: DeleteIntent | null;
  deletePending: boolean;
  deleteActionLabel: string;
  onCloseDeleteDialog: (open: boolean) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  lightboxOpen: boolean;
  lightboxIndex: number;
  lightboxZoom: number;
  swipeDirection: "left" | "right" | null;
  mediaUrls: string[];
  onCloseLightbox: (open: boolean) => void;
  onLightboxTouchStart: (event: TouchEvent<HTMLDivElement>) => void;
  onLightboxTouchMove: (event: TouchEvent<HTMLDivElement>) => void;
  onLightboxTouchEnd: () => void;
  onPrevMedia: () => void;
  onNextMedia: () => void;
  onSetLightboxZoom: (updater: (current: number) => number) => void;
}

const PostDialogs = ({
  showEngagement,
  engagementDescriptionId,
  engagement,
  onOpenProfile,
  onCloseEngagement,
  deleteIntent,
  deletePending,
  deleteActionLabel,
  onCloseDeleteDialog,
  onCancelDelete,
  onConfirmDelete,
  lightboxOpen,
  lightboxIndex,
  lightboxZoom,
  swipeDirection,
  mediaUrls,
  onCloseLightbox,
  onLightboxTouchStart,
  onLightboxTouchMove,
  onLightboxTouchEnd,
  onPrevMedia,
  onNextMedia,
  onSetLightboxZoom,
}: PostDialogsProps) => {
  return (
    <>
      <Dialog open={showEngagement} onOpenChange={onCloseEngagement}>
        <DialogContent
          contentClassMode="bare"
          className="social-engagement-dialog sm:max-w-xl"
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
              <p className="social-text-main text-sm font-semibold">Likes ({engagement?.likers.length || 0})</p>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {(engagement?.likers || []).map((liker) => (
                  <button
                    key={liker._id}
                    type="button"
                    className="social-input-surface flex w-full items-center justify-between rounded-md border px-3 py-2 text-left"
                    onClick={() => onOpenProfile?.(liker._id)}
                  >
                    <span className="social-text-main text-sm font-medium">{liker.displayName}</span>
                    <span className="social-text-muted text-xs">@{liker.username}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="social-text-main text-sm font-semibold">Commenters ({engagement?.commenters.length || 0})</p>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {(engagement?.recentComments || []).map((comment) => (
                  <div key={comment._id} className="social-input-surface rounded-md border px-3 py-2">
                    <button
                      type="button"
                      className="social-text-main text-left text-sm font-semibold hover:underline"
                      onClick={() => onOpenProfile?.(comment.authorId._id)}
                    >
                      {comment.authorId.displayName}
                    </button>
                    <p className="social-text-main text-sm">{comment.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteIntent)} onOpenChange={onCloseDeleteDialog}>
        <DialogContent
          contentClassMode="bare"
          className="social-confirm-dialog social-confirm-dialog--danger sm:max-w-md"
        >
          <DialogHeader className="social-confirm-head modal-stagger-item">
            <span className="social-confirm-icon social-confirm-icon--danger" aria-hidden="true">
              <AlertTriangle className="h-4.5 w-4.5" />
            </span>
            <div>
              <DialogTitle className="social-confirm-title">
                {deleteIntent?.type === "post" ? "Delete this post?" : "Delete this comment?"}
              </DialogTitle>
              <DialogDescription className="social-confirm-description">
                {deleteIntent?.type === "post"
                  ? "This is a permanent action. The post, reactions, and comment thread history will be removed from your workspace feed."
                  : "This is a permanent action. The selected comment and its context in the thread will be removed."}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="social-confirm-actions modal-stagger-item">
            <Button
              type="button"
              variant="outline"
              className="social-confirm-cancel"
              onClick={onCancelDelete}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="social-confirm-danger social-confirm-danger--danger"
              onClick={onConfirmDelete}
              disabled={deletePending}
            >
              {deleteActionLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={lightboxOpen} onOpenChange={onCloseLightbox}>
        <DialogContent
          contentClassMode="bare"
          className="social-lightbox-dialog max-w-[min(96vw,1200px)] sm:max-w-5xl p-3 sm:p-4"
        >
          <DialogHeader>
            <DialogTitle>Photo viewer</DialogTitle>
            <DialogDescription>
              {lightboxIndex + 1}/{mediaUrls.length || 0} · Swipe on mobile, use arrow keys, or double-click to quick zoom.
            </DialogDescription>
          </DialogHeader>

          <div
            className="social-lightbox-stage relative mt-2 flex h-[75vh] items-center justify-center overflow-hidden rounded-xl"
            onTouchStart={onLightboxTouchStart}
            onTouchMove={onLightboxTouchMove}
            onTouchEnd={onLightboxTouchEnd}
          >
            {mediaUrls.length ? (
              <img
                src={mediaUrls[lightboxIndex]}
                alt={`post media ${lightboxIndex + 1}`}
                className={cn(
                  "max-h-full max-w-full object-contain transition-transform duration-200",
                  swipeDirection === "left" && "-translate-x-1",
                  swipeDirection === "right" && "translate-x-1",
                )}
                style={{ transform: `scale(${lightboxZoom})` }}
                onDoubleClick={() => onSetLightboxZoom((current) => (current > 1 ? 1 : 2))}
              />
            ) : null}

            {mediaUrls.length > 1 && (
              <>
                <Button type="button" size="icon" variant="secondary" className="absolute left-3 top-1/2 -translate-y-1/2" onClick={onPrevMedia}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button type="button" size="icon" variant="secondary" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={onNextMedia}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </>
            )}
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => onSetLightboxZoom((current) => Math.max(1, current - 0.25))} disabled={lightboxZoom <= 1}>
              <ZoomOut className="h-4 w-4" />
              Zoom out
            </Button>
            <span className="social-text-muted text-xs font-medium">{Math.round(lightboxZoom * 100)}%</span>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => onSetLightboxZoom(() => 1)} disabled={lightboxZoom === 1}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => onSetLightboxZoom((current) => Math.min(3, current + 0.25))} disabled={lightboxZoom >= 3}>
              <ZoomIn className="h-4 w-4" />
              Zoom in
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PostDialogs;
