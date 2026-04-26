import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { ImagePlus } from "lucide-react";
import type { DragEvent, ReactNode } from "react";

interface MessageComposerShellProps {
  isDragOver: boolean;
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  children: ReactNode;
}

const MessageComposerShell = ({
  isDragOver,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  children,
}: MessageComposerShellProps) => {
  const { t } = useI18n();

  return (
    <section
      className={cn(
        // Full-width, breathing room at bottom
        "clean-composer-shell relative z-10 flex w-full shrink-0 flex-col px-3 pb-1",
        isDragOver && "drop-zone-active",
      )}
      aria-label={t("chatComposer.input_area")}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drop overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 backdrop-blur-sm animate-in fade-in duration-150">
          <ImagePlus className="size-6 text-primary/70" />
          <p className="text-[13px] font-semibold text-primary">
            {t("chatComposer.drop_image")}
          </p>
        </div>
      )}

      {children}
    </section>
  );
};

export default MessageComposerShell;