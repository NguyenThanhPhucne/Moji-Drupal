import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
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
        "clean-composer-shell relative z-10 flex w-full shrink-0 flex-col mx-auto mb-4 w-[calc(100%-2rem)] max-w-4xl",
        isDragOver && "drop-zone-active",
      )}
      aria-label={t("chatComposer.input_area")}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl animate-in fade-in duration-150">
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