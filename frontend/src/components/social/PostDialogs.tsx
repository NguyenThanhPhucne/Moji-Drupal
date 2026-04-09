import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut, Trash2, ThumbsUp, MessageSquare } from "lucide-react";
import type { TouchEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SocialPostEngagement } from "@/types/social";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UserAvatar from "@/components/chat/UserAvatar";

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
          className="sm:max-w-md p-0 overflow-hidden gap-0"
          aria-describedby={engagementDescriptionId}
        >
          <DialogHeader className="pt-6 px-6 pb-4">
            <DialogTitle className="text-xl">Post engagement</DialogTitle>
            <DialogDescription id={engagementDescriptionId} className="hidden">
              See people who liked this post and recent comment content.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="likes" className="w-full flex-1 flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-6 py-0 h-auto gap-6 opacity-100">
              <TabsTrigger 
                value="likes"
                className="relative rounded-none border-b-2 border-transparent px-1 py-3 font-semibold text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <ThumbsUp className="h-4 w-4 mr-2" />
                Likes ({engagement?.likers.length || 0})
              </TabsTrigger>
              <TabsTrigger 
                value="comments"
                className="relative rounded-none border-b-2 border-transparent px-1 py-3 font-semibold text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Comments ({engagement?.commenters.length || 0})
              </TabsTrigger>
            </TabsList>
            
            <div className="max-h-[50vh] overflow-y-auto w-full beautiful-scrollbar bg-card/40">
              <TabsContent value="likes" className="m-0 outline-none p-2">
                {engagement?.likers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No likes yet.</p>
                ) : (
                  <div className="space-y-1">
                    {(engagement?.likers || []).map((liker) => (
                      <button
                        key={liker._id}
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted/80 transition-colors focus-visible:outline-none focus-visible:bg-muted/80"
                        onClick={() => onOpenProfile?.(liker._id)}
                      >
                        <UserAvatar type="sidebar" name={liker.displayName} avatarUrl={liker.avatarUrl} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold text-foreground truncate leading-tight">{liker.displayName}</span>
                          <span className="text-[11px] text-muted-foreground truncate leading-tight">@{liker.username}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="comments" className="m-0 outline-none p-2">
                {engagement?.recentComments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No comments yet.</p>
                ) : (
                  <div className="space-y-1">
                    {(engagement?.recentComments || []).map((comment) => (
                      <div key={comment._id} className="flex gap-3 rounded-xl p-2 hover:bg-muted/40 transition-colors">
                        <button 
                          className="shrink-0 outline-none focus-visible:ring-2 ring-primary rounded-full h-fit mt-0.5"
                          onClick={() => onOpenProfile?.(comment.authorId._id)}
                        >
                          <UserAvatar type="sidebar" name={comment.authorId.displayName} avatarUrl={comment.authorId.avatarUrl} />
                        </button>
                        <div className="flex flex-col min-w-0 flex-1">
                          <button
                            type="button"
                            className="text-left text-[13px] font-semibold text-foreground hover:underline outline-none w-fit leading-tight"
                            onClick={() => onOpenProfile?.(comment.authorId._id)}
                          >
                            {comment.authorId.displayName}
                          </button>
                          <p className="text-[13px] text-foreground/90 mt-0.5 break-words leading-snug">{comment.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteIntent)} onOpenChange={onCloseDeleteDialog}>
        <AlertDialogContent
          className="chat-modal-shell chat-modal-shell--danger max-w-sm"
          aria-busy={deletePending}
        >
          <AlertDialogHeader className="items-center text-center modal-stagger-item">
            <div className="dialog-danger-icon">
              <Trash2 className="size-6" />
            </div>
            <AlertDialogTitle className="text-base font-semibold">
              {deleteIntent?.type === "post" ? "Delete this post?" : "Delete this comment?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {deleteIntent?.type === "post"
                ? "This is a permanent action. The post, reactions, and comment thread history will be removed from your workspace feed."
                : "This is a permanent action. The selected comment and its context in the thread will be removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="sm:flex-col-reverse gap-2 sm:gap-2 mt-4 modal-stagger-item">
            <AlertDialogCancel
              className="mt-0 sm:mt-0"
              onClick={onCancelDelete}
              disabled={deletePending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onConfirmDelete}
              disabled={deletePending}
            >
              {deleteActionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
