import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface VoiceMessagePlayerProps {
  src: string;
  isOwn?: boolean;
}

const BAR_COUNT = 24;

// Pre-generate stable bar heights to look like a waveform
const WAVEFORM_BARS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const pattern = [0.3, 0.6, 0.9, 0.7, 1.0, 0.5, 0.8, 0.4, 0.75, 0.55, 0.9, 0.65,
                   0.45, 0.85, 0.6, 0.95, 0.35, 0.7, 0.5, 0.8, 0.4, 0.65, 0.9, 0.3];
  return pattern[i % pattern.length];
});

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

const MicIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

const PlayIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const VoiceMessagePlayer = ({ src, isOwn = false }: VoiceMessagePlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const animFrameRef = useRef<number | null>(null);

  const progress = duration > 0 ? currentTime / duration : 0;
  const activeBars = Math.round(progress * BAR_COUNT);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    if (!audio.paused) {
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      setDuration(audio.duration);
      setIsLoaded(true);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    const onPlay = () => {
      setIsPlaying(true);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setIsPlaying(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [tick]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play();
    }
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration || !Number.isFinite(duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const newTime = ratio * duration;
    
    if (Number.isFinite(newTime)) {
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  return (
    <div
      className={cn(
        "voice-player flex items-center gap-2.5 rounded-2xl px-3 py-2",
        "min-w-[200px] max-w-[260px]",
        isOwn
          ? "bg-white/15 border border-white/20"
          : "bg-muted/40 border border-border/30",
      )}
    >
      {/* Hidden native audio */}
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

      {/* Mic icon badge */}
      <div
        className={cn(
          "flex shrink-0 size-8 items-center justify-center rounded-full transition-colors",
          isOwn
            ? "bg-white/20 text-white/90 hover:bg-white/30"
            : "bg-primary/15 text-primary hover:bg-primary/25",
        )}
      >
        <MicIcon className="size-4" />
      </div>

      {/* Waveform + controls column */}
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {/* Waveform bars */}
        <div
          role="progressbar"
          aria-label="Voice message waveform"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="flex items-end gap-[2px] h-6 cursor-pointer select-none"
          onClick={handleWaveformClick}
        >
          {WAVEFORM_BARS.map((height, i) => {
            const isActive = i < activeBars;
            return (
              <span
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-colors duration-100",
                  isPlaying && isActive ? "voice-bar-playing" : "",
                  isActive
                    ? isOwn ? "bg-white/80" : "bg-primary"
                    : isOwn ? "bg-white/30" : "bg-muted-foreground/30",
                )}
                style={{ height: `${Math.max(20, Math.round(height * 100))}%` }}
              />
            );
          })}
        </div>

        {/* Time row */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={togglePlay}
            disabled={!isLoaded}
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full transition-opacity",
              !isLoaded && "opacity-40 cursor-not-allowed",
              isOwn ? "text-white/90" : "text-primary",
            )}
          >
            {isPlaying
              ? <PauseIcon className="size-3.5" />
              : <PlayIcon className="size-3.5" />
            }
          </button>

          <span
            className={cn(
              "font-mono text-[10px] tabular-nums",
              isOwn ? "text-white/70" : "text-muted-foreground",
            )}
          >
            {isPlaying || currentTime > 0
              ? formatTime(currentTime)
              : formatTime(duration)
            }
          </span>
        </div>
      </div>
    </div>
  );
};

export default VoiceMessagePlayer;
