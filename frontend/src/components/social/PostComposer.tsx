import { useMemo, useState } from "react";
import { ImagePlus, SendHorizontal } from "lucide-react";
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
  const [caption, setCaption] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "followers">("public");
  const [submitting, setSubmitting] = useState(false);

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
    if (!caption.trim() && !mediaUrl.trim()) {
      return;
    }

    try {
      setSubmitting(true);
      const ok = await onCreate({
        caption,
        mediaUrls: mediaUrl.trim() ? [mediaUrl.trim()] : [],
        tags: mergedTags,
        privacy,
      });

      if (!ok) {
        return;
      }

      setCaption("");
      setMediaUrl("");
      setTags("");
      setPrivacy("public");
    } finally {
      setSubmitting(false);
    }
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
          value={mediaUrl}
          onChange={(event) => setMediaUrl(event.target.value)}
          placeholder="Image URL (optional)"
        />
        <Input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="extra tags, comma separated"
        />
      </div>

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
          variant="outline"
          className="gap-2"
          onClick={() => {
            if (mediaUrl.trim()) {
              window.open(mediaUrl.trim(), "_blank", "noopener,noreferrer");
            }
          }}
        >
          <ImagePlus className="size-4" />
          Preview media
        </Button>

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
