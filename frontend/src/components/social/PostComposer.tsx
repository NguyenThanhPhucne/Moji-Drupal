import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface PostComposerProps {
  onCreate: (payload: {
    caption: string;
    mediaUrls?: string[];
    tags?: string[];
    privacy?: "public" | "followers";
  }) => Promise<boolean>;
}

const PostComposer = ({ onCreate }: PostComposerProps) => {
  const IMAGE_LIMIT = 10;
  const DRAFT_STORAGE_KEY = "social-post-composer-draft-v1";
  const [caption, setCaption] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "followers">("public");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!globalThis.window) {
      return;
    }

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
      setMediaUrls(Array.isArray(parsed.mediaUrls) ? parsed.mediaUrls.slice(0, IMAGE_LIMIT) : []);
      setTags(parsed.tags || "");
      setPrivacy(parsed.privacy === "followers" ? "followers" : "public");
    } catch (error) {
      console.error("[social] failed to restore post composer draft", error);
    }
  }, []);

  useEffect(() => {
    if (!globalThis.window) {
      return;
    }

    const hasContent = Boolean(caption.trim() || mediaUrls.length || tags.trim());
    if (!hasContent) {
      globalThis.localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }

    try {
      globalThis.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          caption,
          mediaUrls,
          tags,
          privacy,
        }),
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

        reject(new Error("Failed to parse image file"));
      };
      reader.onerror = () => reject(new Error("Failed to read image file"));
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
      if (globalThis.window) {
        globalThis.localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
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
    const dataUrls = await Promise.all(imageFiles.map((file) => readFileAsDataUrl(file)));

    setMediaUrls((current) => [...current, ...dataUrls].slice(0, IMAGE_LIMIT));

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeMediaAt = (index: number) => {
    setMediaUrls((current) => current.filter((_, currentIndex) => currentIndex !== index));
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

  const handleDragOver = (
    event: DragEvent<HTMLDivElement>,
    index: number,
  ) => {
    event.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (draggingIndex === null) {
      return;
    }

    moveMediaItem(draggingIndex, index);
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const clearDragState = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="elevated-card p-4 space-stack-md">
      <h2 className="text-title-2">Create post</h2>

      <Textarea
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
        placeholder="What are you sharing today?"
        className="min-h-24"
      />

      <div className="grid gap-2 md:grid-cols-2">
        <Input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="extra tags, comma separated"
        />
        <div className="flex items-center justify-end">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePickImages}
          />
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="size-4" />
            Add photos
          </Button>
        </div>
      </div>

      {mediaUrls.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {mediaUrls.length}/{IMAGE_LIMIT} photos selected
          </p>
          <p className="text-xs text-muted-foreground/85">
            Drag and drop to reorder photos before posting.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {mediaUrls.map((media, index) => (
            <div
              key={`${index}-${media.slice(0, 24)}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={clearDragState}
              className={
                "group relative flex aspect-[4/3] cursor-grab items-center justify-center overflow-hidden rounded-lg border bg-muted/30 transition-all active:cursor-grabbing " +
                (draggingIndex === index
                  ? "border-primary/50 opacity-60"
                  : dragOverIndex === index
                    ? "border-primary/60 shadow-[0_0_0_2px_hsl(var(--primary)/0.22)]"
                    : "border-border/70")
              }
            >
              <img
                src={media}
                alt={`upload preview ${index + 1}`}
                className="max-h-full max-w-full rounded-md object-contain"
              />
              <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
                {index + 1}
              </span>
              <button
                type="button"
                className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => removeMediaAt(index)}
                aria-label="Remove image"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          </div>
        </div>
      )}

      {mergedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {mergedTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={privacy}
          onChange={(event) =>
            setPrivacy(event.target.value as "public" | "followers")
          }
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="public">Public</option>
          <option value="followers">Followers only</option>
        </select>

        <Button
          type="button"
          className="ml-auto gap-2"
          onClick={submit}
          disabled={submitting}
        >
          <SendHorizontal className="size-4" />
          {submitting ? "Posting..." : "Post"}
        </Button>
      </div>
    </div>
  );
};

export default PostComposer;
