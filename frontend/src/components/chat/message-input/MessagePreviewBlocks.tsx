import { Reply, X, MegaphoneOff, Flame } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import VoiceMessagePlayer from "../VoiceMessagePlayer";

type ReplyPreview = {
  senderDisplayName?: string | null;
  content?: string | null;
} | null | undefined;

interface MessagePreviewBlocksProps {
  // composerContextLabel / composerModeLabel kept in interface for API
  // compatibility but no longer rendered — context lives in the header.
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
  disappearingMessageTimer?: number;
}

/** Renders only when announcement mode is ON and the user cannot send */
const AnnouncementBanner = ({
  announcementOnly,
  isGroupAdmin,
}: {
  announcementOnly: boolean;
  isGroupAdmin: boolean;
}) => {
  const { t } = useI18n();
  if (!announcementOnly || isGroupAdmin) return null;

  return (
    <div className="mx-3 mb-2 mt-2 flex items-center gap-2 rounded-xl border border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.12)] px-3 py-2">
      <MegaphoneOff className="size-3.5 flex-shrink-0 text-[hsl(var(--status-warning-strong))]" />
      <p className="text-[11.5px] font-medium leading-snug text-[hsl(var(--status-warning-strong))]">
        {t("chatComposer.notice.announcement_only")}
      </p>
    </div>
  );
};

const SecretModeBanner = ({ timer }: { timer?: number }) => {
  if (!timer || timer <= 0) return null;

  return (
    <div className="mx-3 mb-2 mt-2 flex items-center gap-2 rounded-xl border border-[hsl(var(--status-caution)/0.3)] bg-[hsl(var(--status-caution)/0.12)] px-3 py-1.5 shadow-sm animate-in slide-in-from-bottom-2">
      <Flame className="size-3.5 flex-shrink-0 text-[hsl(var(--status-caution))] animate-pulse" />
      <p className="text-[11.5px] font-medium leading-snug text-[hsl(var(--status-caution-strong))]">
        Secret mode is on
      </p>
    </div>
  );
};

const MessagePreviewBlocks = ({
  replyingTo,
  onClearReply,
  imagePreview,
  onClearImage,
  audioPreview,
  onClearAudio,
  announcementOnly,
  isGroupAdmin,
  disappearingMessageTimer,
}: MessagePreviewBlocksProps) => {
  const { t } = useI18n();

  return (
    <>
      {/* ── Reply preview strip ───────────────────────────────────── */}
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

      {/* ── Image attachment preview ──────────────────────────────── */}
      {imagePreview && (
        <div className="relative mx-3.5 mt-2.5 w-fit animate-in fade-in zoom-in-95 duration-200">
          <img
            src={imagePreview}
            alt={t("chatComposer.preview")}
            className="h-20 w-20 rounded-xl border border-border/60 object-cover shadow-sm"
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

      {/* ── Voice memo preview ────────────────────────────────────── */}
      {audioPreview && (
        <div className="relative mx-3.5 mt-2.5 animate-in fade-in zoom-in-95 duration-200 flex items-center gap-2">
          <div className="flex-1">
            <VoiceMessagePlayer src={audioPreview} standalone className="rounded-2xl" />
          </div>
          <button
            type="button"
            onClick={onClearAudio}
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/80 shadow-md transition-colors hover:bg-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            aria-label="Remove voice memo"
          >
            <X className="size-3.5 text-white" />
          </button>
        </div>
      )}

      {/* ── Announcement-only warning (context-aware, not always visible) */}
      <AnnouncementBanner announcementOnly={announcementOnly} isGroupAdmin={isGroupAdmin} />

      {/* ── Secret mode indicator */}
      <SecretModeBanner timer={disappearingMessageTimer} />
    </>
  );
};

export default MessagePreviewBlocks;