import { Reply, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type ReplyPreview = {
  senderDisplayName?: string | null;
  content?: string | null;
} | null | undefined;

interface MessagePreviewBlocksProps {
  composerContextLabel: string;
  composerModeLabel: string;
  replyingTo: ReplyPreview;
  onClearReply: () => void;
  imagePreview: string | null;
  onClearImage: () => void;
  audioPreview?: string | null;
  onClearAudio?: () => void;
  announcementOnly: boolean;
  isGroupAdmin: boolean;
}

const AnnouncementModeNotice = ({
  announcementOnly,
  isGroupAdmin,
}: {
  announcementOnly: boolean;
  isGroupAdmin: boolean;
}) => {
  const { t } = useI18n();

  if (!announcementOnly || isGroupAdmin) {
    return null;
  }

  return (
    <p className="px-3.5 pb-2 text-[11px] font-medium text-muted-foreground">
      {t("chatComposer.notice.announcement_only")}
    </p>
  );
};

const MessagePreviewBlocks = ({
  composerContextLabel,
  composerModeLabel,
  replyingTo,
  onClearReply,
  imagePreview,
  onClearImage,
  audioPreview,
  onClearAudio,
  announcementOnly,
  isGroupAdmin,
}: MessagePreviewBlocksProps) => {
  const { t } = useI18n();

  return (
    <>
      <div
        className="chat-composer-meta-row chat-composer-meta-row--command"
        aria-live="polite"
      >
        <span className="chat-composer-meta-chip chat-composer-meta-chip--channel">
          {composerContextLabel}
        </span>
        <span
          className="chat-composer-meta-chip chat-composer-meta-chip--mode"
          title={composerModeLabel}
        >
          {composerModeLabel}
        </span>
        <span className="chat-composer-meta-chip chat-composer-meta-chip--hint">
          {t("chatComposer.hint.enter_shift_enter")}
        </span>
      </div>

      {replyingTo && (
        <div className="flex items-center gap-2 border-b border-border/20 bg-muted/10 px-3.5 py-2 animate-in fade-in slide-in-from-bottom-1 duration-150">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="w-[2.5px] self-stretch rounded-full bg-primary/80 flex-shrink-0" />
            <div className="flex min-w-0 flex-col">
              <span className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase leading-none tracking-[0.05em] text-primary">
                <Reply className="size-2.5" />
                {replyingTo.senderDisplayName ?? t("chatComposer.reply")}
              </span>
              <p className="truncate text-[12px] leading-snug text-muted-foreground/70">
                {replyingTo.content || t("chatComposer.photo_attachment")}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t("chatComposer.cancel_reply")}
            onClick={onClearReply}
            className="flex-shrink-0 rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}


      {imagePreview && (
        <div className="relative mx-4 mt-3 w-fit animate-in fade-in zoom-in-95 duration-200">
          <img
            src={imagePreview}
            alt={t("chatComposer.preview")}
            className="h-24 w-24 rounded-xl border border-border/60 object-cover shadow-sm"
          />
          <button
            type="button"
            onClick={onClearImage}
            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground/80 shadow-md transition-colors hover:bg-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            aria-label={t("socialComposer.remove_selected_image")}
          >
            <X className="size-3 text-background" />
          </button>
          <div className="absolute bottom-1 left-1 rounded bg-background/80 px-1 py-0.5 text-[9px] font-medium text-muted-foreground backdrop-blur-sm">
            {t("chatComposer.preview_image")}
          </div>
        </div>
      )}

      {audioPreview && (
        <div className="relative mx-4 mt-3 w-fit animate-in fade-in zoom-in-95 duration-200 bg-muted/20 px-3 py-2 rounded-xl border border-border/60 shadow-sm flex items-center gap-3">
          <audio src={audioPreview} controls className="h-8 max-w-[200px]" />
          <button
            type="button"
            onClick={onClearAudio}
            className="flex size-6 items-center justify-center rounded-full bg-destructive/80 shadow-md transition-colors hover:bg-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            aria-label="Remove voice memo"
          >
            <X className="size-3.5 text-white" />
          </button>
        </div>
      )}

      <AnnouncementModeNotice
        announcementOnly={announcementOnly}
        isGroupAdmin={isGroupAdmin}
      />
    </>
  );
};

export default MessagePreviewBlocks;