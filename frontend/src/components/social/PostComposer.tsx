import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, SendHorizontal, Smile, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/useAuthStore";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface PostComposerProps {
  onCreate: (payload: {
    caption: string;
    mediaUrls?: string[];
    tags?: string[];
    privacy?: "public" | "followers";
  }) => Promise<boolean>;
  openRequestKey?: number;
}

const PostComposer = ({ onCreate, openRequestKey = 0 }: PostComposerProps) => {
  const { t } = useI18n();
  const IMAGE_LIMIT = 10;
  const DRAFT_STORAGE_KEY = "social-post-composer-draft-v1";
  const { user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "followers">("public");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const rawDraft = globalThis.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!rawDraft) {
        return;
      }

      const parsed = JSON.parse(rawDraft) as {
        caption?: string;
        mediaUrls?: string[];
        tags?: string;
        privacy?: "public" | "followers";
      };

      setCaption(parsed.caption || "");
      setMediaUrls(
        Array.isArray(parsed.mediaUrls)
          ? parsed.mediaUrls.slice(0, IMAGE_LIMIT)
          : [],
      );
      setTags(parsed.tags || "");
      setPrivacy(parsed.privacy === "followers" ? "followers" : "public");
    } catch (error) {
      console.error("[social] failed to restore post composer draft", error);
    }
  }, []);

  useEffect(() => {
    if (openRequestKey > 0) {
      setIsOpen(true);
    }
  }, [openRequestKey]);

  useEffect(() => {
    const hasContent = Boolean(caption.trim() || mediaUrls.length || tags.trim());
    if (!hasContent) {
      globalThis.localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }

    try {
      globalThis.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({ caption, mediaUrls, tags, privacy }),
      );
    } catch (error) {
      console.error("[social] failed to persist post composer draft", error);
    }
  }, [caption, mediaUrls, tags, privacy]);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }

        reject(new Error(t("socialComposer.error.parse_image")));
      };
      reader.onerror = () => reject(new Error(t("socialComposer.error.read_image")));
      reader.readAsDataURL(file);
    });

  const extractedCaptionTags = useMemo(
    () =>
      Array.from(
        new Set(
          (caption.match(/#\w+/g) || []).map((tag) =>
            tag.slice(1).toLowerCase(),
          ),
        ),
      ),
    [caption],
  );

  const manualTags = useMemo(
    () =>
      tags
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    [tags],
  );

  const mergedTags = useMemo(
    () => Array.from(new Set([...manualTags, ...extractedCaptionTags])),
    [manualTags, extractedCaptionTags],
  );

  const submit = async () => {
    if (!caption.trim() && mediaUrls.length === 0) {
      return;
    }

    try {
      setSubmitting(true);
      const ok = await onCreate({
        caption,
        mediaUrls,
        tags: mergedTags,
        privacy,
      });

      if (!ok) {
        return;
      }

      setCaption("");
      setMediaUrls([]);
      setTags("");
      setPrivacy("public");
      setIsOpen(false);
      globalThis.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const remainingSlots = Math.max(0, IMAGE_LIMIT - mediaUrls.length);
    const files = Array.from(event.target.files || []).slice(0, remainingSlots);
    if (files.length === 0) {
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    const dataUrls = await Promise.all(
      imageFiles.map((file) => readFileAsDataUrl(file)),
    );

    setMediaUrls((current) => [...current, ...dataUrls].slice(0, IMAGE_LIMIT));

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeMediaAt = (index: number) => {
    setMediaUrls((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
    setActiveMediaIndex((current) => {
      if (index < current) {
        return Math.max(0, current - 1);
      }

      if (index === current) {
        return Math.max(0, current - 1);
      }

      return current;
    });
  };

  const moveMediaItem = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return;
    }

    setMediaUrls((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) {
        return current;
      }

      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleDragStart = (index: number) => {
    setDraggingIndex(index);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>, index: number) => {
    event.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (draggingIndex === null) {
      return;
    }

    moveMediaItem(draggingIndex, index);
    setActiveMediaIndex(index);
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const clearDragState = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const displayName = user?.displayName || t("socialComposer.you");
  const avatarUrl = user?.avatarUrl || "";

  return (
    <>
      <div className="social-card social-composer-card social-composer-card--command p-4">
        <div className="flex items-center gap-3">
          <div className="social-avatar-badge social-composer-avatar flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-sm font-semibold">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              displayName.slice(0, 1).toUpperCase()
            )}
          </div>
          <button
            type="button"
            className="social-composer-prompt social-composer-prompt--command social-composer-trigger social-composer-trigger-glow h-11 flex-1 rounded-full px-4 text-left text-sm transition-[border-color,background-color,box-shadow,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            onClick={() => setIsOpen(true)}
          >
            {t("socialComposer.prompt")}
          </button>
        </div>

        <div className="social-divider social-composer-action-row mt-3 grid grid-cols-3 gap-2 border-t border-border/30 pt-2.5">
          <button type="button" className="post-action-btn-hover social-action-btn flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium">
            <Video className="social-icon-live h-4 w-4" />
            {t("socialComposer.action.live_video")}
          </button>
          <button type="button" className="post-action-btn-hover social-action-btn flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium" onClick={() => setIsOpen(true)}>
            <ImagePlus className="social-icon-media h-4 w-4" />
            {t("socialComposer.action.photo_video")}
          </button>
          <button type="button" className="post-action-btn-hover social-action-btn flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium" onClick={() => setIsOpen(true)}>
            <Smile className="social-icon-feeling h-4 w-4" />
            {t("socialComposer.action.feeling_activity")}
          </button>
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          contentClassMode="bare"
          className="social-modal-shell social-composer-modal social-modal-spring max-w-2xl rounded-xl p-0 shadow-2xl"
        >
          <DialogHeader className="social-composer-modal__header social-divider border-b px-5 py-4">
            <DialogTitle className="social-text-main text-center text-lg font-bold">
              {t("socialComposer.dialog.create_post")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("socialComposer.dialog.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="social-composer-modal__body space-y-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="social-avatar-badge flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-sm font-semibold">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  displayName.slice(0, 1).toUpperCase()
                )}
              </div>
              <div>
                <p className="social-text-main text-sm font-semibold">{displayName}</p>
                <select
                  value={privacy}
                  onChange={(event) => setPrivacy(event.target.value as "public" | "followers")}
                  className="social-select-chip mt-1 rounded-md border px-2 py-1 text-xs font-medium"
                >
                  <option value="public">{t("socialComposer.privacy.public")}</option>
                  <option value="followers">{t("socialComposer.privacy.friends")}</option>
                </select>
              </div>
            </div>

            <Textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder={t("socialComposer.caption_placeholder")}
              className="social-textarea min-h-32 resize-none border-0 bg-transparent px-0 text-lg shadow-none focus-visible:ring-0"
            />

            <div className="social-divider rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="social-text-main text-sm font-semibold">
                  {t("socialComposer.add_to_post")}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePickImages}
                />
                <button
                  type="button"
                  className="social-input-surface inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="social-icon-media h-4 w-4" />
                  {t("socialComposer.button.photo")}
                </button>
              </div>

              {mediaUrls.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="social-text-muted text-xs font-medium">
                    {t("socialComposer.selected_photos", {
                      count: mediaUrls.length,
                      limit: IMAGE_LIMIT,
                    })}
                  </p>
                  <div className="social-composer-stage group relative overflow-hidden rounded-xl border">
                    <img
                      src={mediaUrls[Math.min(activeMediaIndex, Math.max(0, mediaUrls.length - 1))]}
                      alt={t("socialComposer.preview_alt")}
                      className="social-composer-stage-image"
                    />
                    <button
                      type="button"
                      className="social-media-remove-btn absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full opacity-90 transition-opacity group-hover:opacity-100"
                      onClick={() => removeMediaAt(activeMediaIndex)}
                      aria-label={t("socialComposer.remove_selected_image")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="social-composer-strip beautiful-scrollbar">
                    {mediaUrls.map((media, index) => {
                      let dragStateClass = "";
                      if (draggingIndex === index) {
                        dragStateClass = "opacity-60";
                      } else if (dragOverIndex === index) {
                        dragStateClass = "ring-2 ring-primary/40";
                      }

                      const isActive = index === activeMediaIndex;

                      return (
                        <div
                          key={`${index}-${media.slice(0, 24)}`}
                          className={cn(
                            "social-media-tile social-composer-thumb group relative overflow-hidden rounded-lg border",
                            dragStateClass,
                            isActive ? "social-composer-thumb--active" : "",
                            draggingIndex === index ? "drag-tilt-active" : ""
                          )}
                        >
                          <button
                            type="button"
                            draggable
                            aria-label={t("socialComposer.selected_photo_aria", {
                              index: index + 1,
                            })}
                            onDragStart={() => handleDragStart(index)}
                            onDragOver={(event) => handleDragOver(event, index)}
                            onDrop={() => handleDrop(index)}
                            onDragEnd={clearDragState}
                            onClick={() => setActiveMediaIndex(index)}
                            onKeyDown={(event) => {
                              if (event.key === "Delete" || event.key === "Backspace") {
                                event.preventDefault();
                                removeMediaAt(index);
                              }
                            }}
                            className="flex h-full w-full cursor-grab items-center justify-center active:cursor-grabbing"
                          >
                            <img
                              src={media}
                              alt={t("socialComposer.preview_item_alt", {
                                index: index + 1,
                              })}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        </div>
                      );
                    })}

                    {mediaUrls.length < IMAGE_LIMIT ? (
                      <button
                        type="button"
                        className="social-composer-add-more"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Camera className="h-4 w-4" />
                        {t("socialComposer.add_more")}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <Input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder={t("socialComposer.tags_placeholder")}
              className="social-input-surface h-10 border"
            />
          </div>

          <div className="social-composer-modal__footer social-divider border-t px-5 py-3">
            <Button
              type="button"
              className="profile-action-gradient social-primary-btn h-10 w-full text-sm font-semibold"
              onClick={submit}
              disabled={submitting}
            >
              <SendHorizontal className="mr-2 h-4 w-4" />
              {submitting ? t("socialComposer.posting") : t("socialComposer.post")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PostComposer;
