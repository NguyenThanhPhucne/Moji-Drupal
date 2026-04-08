import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SocialPost } from "@/types/social";
import type { User } from "@/types/user";

interface SocialStoriesRowProps {
  currentUser?: User | null;
  posts: SocialPost[];
  onOpenProfile?: (userId: string) => void;
  onCreateStory?: () => void;
}

type StoryItem = {
  _id: string;
  displayName: string;
  avatarUrl?: string | null;
  accentClass: string;
  coverUrl?: string | null;
  snippet: string;
};

const ACCENT_CLASSES = [
  "social-story-card--accent-blue",
  "social-story-card--accent-cyan",
  "social-story-card--accent-orange",
  "social-story-card--accent-green",
  "social-story-card--accent-rose",
] as const;

const SocialStoriesRow = ({
  currentUser,
  posts,
  onOpenProfile,
  onCreateStory,
}: SocialStoriesRowProps) => {
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [storyProgressPercent, setStoryProgressPercent] = useState(0);
  const [viewerPaused, setViewerPaused] = useState(false);

  const stories = useMemo<StoryItem[]>(() => {
    const byAuthor = new Map<string, StoryItem>();

    posts.forEach((post) => {
      const author = post.authorId;
      const id = String(author?._id || "");
      if (!id || byAuthor.has(id)) {
        return;
      }

      byAuthor.set(id, {
        _id: id,
        displayName: author.displayName || "User",
        avatarUrl: author.avatarUrl,
        accentClass: ACCENT_CLASSES[byAuthor.size % ACCENT_CLASSES.length],
        coverUrl: post.mediaUrls?.[0] || null,
        snippet: (post.caption || "Shared a quick update").trim(),
      });
    });

    return Array.from(byAuthor.values()).slice(0, 14);
  }, [posts]);

  const createStoryCoverStyle = useMemo<CSSProperties | undefined>(() => {
    if (!currentUser?.avatarUrl) {
      return undefined;
    }

    return {
      backgroundImage: `linear-gradient(180deg, hsl(220 30% 8% / 0.08), hsl(220 30% 8% / 0.44)), url(${currentUser.avatarUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }, [currentUser?.avatarUrl]);

  const activeStory =
    activeStoryIndex !== null && activeStoryIndex >= 0
      ? stories[activeStoryIndex]
      : null;

  const closeStory = useCallback(() => {
    setActiveStoryIndex(null);
    setStoryProgressPercent(0);
    setViewerPaused(false);
  }, []);

  const goPrevStory = useCallback(() => {
    setActiveStoryIndex((current) => {
      if (current === null) {
        return current;
      }

      return current > 0 ? current - 1 : current;
    });
  }, []);

  const goToNextStory = useCallback(() => {
    setActiveStoryIndex((current) => {
      if (current === null) {
        return current;
      }

      const next = current + 1;
      return next >= stories.length ? null : next;
    });
    setStoryProgressPercent(0);
  }, [stories.length]);

  const goNextStory = useCallback(() => {
    goToNextStory();
  }, [goToNextStory]);

  useEffect(() => {
    if (activeStoryIndex === null) {
      return;
    }

    setStoryProgressPercent(0);
  }, [activeStoryIndex]);

  useEffect(() => {
    if (activeStoryIndex === null || !activeStory || viewerPaused) {
      return;
    }

    if (storyProgressPercent >= 100) {
      goToNextStory();
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setStoryProgressPercent((current) => Math.min(100, current + 2.5));
    }, 100);

    return () => globalThis.clearTimeout(timeoutId);
  }, [
    activeStoryIndex,
    activeStory,
    goToNextStory,
    storyProgressPercent,
    viewerPaused,
  ]);

  useEffect(() => {
    if (activeStoryIndex === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        setViewerPaused(true);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevStory();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNextStory();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeStory();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        setViewerPaused(false);
      }
    };

    globalThis.window.addEventListener("keydown", handleKeyDown);
    globalThis.window.addEventListener("keyup", handleKeyUp);
    return () => {
      globalThis.window.removeEventListener("keydown", handleKeyDown);
      globalThis.window.removeEventListener("keyup", handleKeyUp);
    };
  }, [activeStoryIndex, closeStory, goNextStory, goPrevStory]);

  const openStory = useCallback((index: number) => {
    setActiveStoryIndex(index);
  }, []);

  return (
    <section className="social-story-row social-card" aria-label="Stories row">
      <div className="social-story-scroll beautiful-scrollbar">
        <button
          type="button"
          className="social-story-card social-story-card--create"
          onClick={() => onCreateStory?.()}
          aria-label="Create story"
        >
          <div className="social-story-cover" style={createStoryCoverStyle} />
          <div className="social-story-avatar social-story-avatar--create">
            <Plus className="h-4 w-4" />
          </div>
          <span className="social-story-name">Create story</span>
        </button>

        {stories.map((story, index) => (
          <button
            key={story._id}
            type="button"
            className={`social-story-card ${story.accentClass}`}
            onClick={() => openStory(index)}
            aria-label={`Open ${story.displayName} story`}
          >
            <div className="social-story-cover" />
            <div className="social-story-avatar">
              {story.avatarUrl ? (
                <img
                  src={story.avatarUrl}
                  alt={story.displayName}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <span>{story.displayName.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <span className="social-story-name">{story.displayName}</span>
          </button>
        ))}
      </div>

      <Dialog
        open={activeStoryIndex !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeStory();
          }
        }}
      >
        <DialogContent contentClassMode="bare" className="social-story-viewer p-0 sm:max-w-2xl">
          <DialogTitle className="sr-only">Story viewer</DialogTitle>
          <DialogDescription className="sr-only">
            Auto-playing story preview with keyboard-like next and previous controls.
          </DialogDescription>

          {activeStory ? (
            <div className={`social-story-viewer-stage ${activeStory.accentClass}`}>
              <div className="social-story-viewer-progress">
                {stories.map((item, index) => {
                  let width = "0%";
                  if (index < (activeStoryIndex || 0)) {
                    width = "100%";
                  } else if (index === activeStoryIndex) {
                    width = `${storyProgressPercent}%`;
                  }

                  return (
                    <span key={`${item._id}-progress`} className="social-story-progress-track">
                      <span className="social-story-progress-fill" style={{ width }} />
                    </span>
                  );
                })}
              </div>

              <div className="social-story-viewer-head">
                <button
                  type="button"
                  className="social-story-viewer-author"
                  onClick={() => onOpenProfile?.(activeStory._id)}
                >
                  <span className="social-story-viewer-avatar">
                    {activeStory.avatarUrl ? (
                      <img
                        src={activeStory.avatarUrl}
                        alt={activeStory.displayName}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      activeStory.displayName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="social-story-viewer-name">{activeStory.displayName}</span>
                </button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="social-story-viewer-close"
                  onClick={closeStory}
                  aria-label="Close story viewer"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="social-story-viewer-body">
                <button
                  type="button"
                  className="absolute inset-0 z-[1] cursor-grab"
                  aria-label="Hold to pause story"
                  onMouseDown={() => setViewerPaused(true)}
                  onMouseUp={() => setViewerPaused(false)}
                  onMouseLeave={() => setViewerPaused(false)}
                  onTouchStart={() => setViewerPaused(true)}
                  onTouchEnd={() => setViewerPaused(false)}
                  onTouchCancel={() => setViewerPaused(false)}
                />
                {activeStory.coverUrl ? (
                  <img
                    src={activeStory.coverUrl}
                    alt={`${activeStory.displayName} story`}
                    className="social-story-viewer-image"
                  />
                ) : (
                  <div className="social-story-viewer-fallback">{activeStory.snippet}</div>
                )}

                <p className="social-story-viewer-caption">{activeStory.snippet}</p>
                {viewerPaused ? (
                  <span className="social-story-viewer-paused">Paused</span>
                ) : null}
              </div>

              <div className="social-story-viewer-nav">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={goPrevStory}
                  disabled={(activeStoryIndex || 0) <= 0}
                  aria-label="Previous story"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={goNextStory}
                  aria-label="Next story"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default SocialStoriesRow;
