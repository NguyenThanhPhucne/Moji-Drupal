import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";

interface VoiceMessagePlayerProps {
  src: string;
  isOwn?: boolean;
  standalone?: boolean;
  className?: string;
}

const BAR_COUNT = 24;
const VOICE_PLAYER_PLAY_EVENT = "moji:voice-player-play";

const buildVoicePlayerInstanceId = () => {
  return `voice-player-${Math.random().toString(36).slice(2)}-${Date.now()}`;
};

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

const LoadingIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
    <path
      d="M12 3a9 9 0 0 1 9 9"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const VoiceMessagePlayer = ({ src, isOwn = false, standalone = false, className }: VoiceMessagePlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const instanceIdRef = useRef(buildVoicePlayerInstanceId());
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [useFallbackSrc, setUseFallbackSrc] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const animFrameRef = useRef<number | null>(null);

  // Cloudinary allows on-the-fly format conversion. We force MP4 to ensure
  // Safari compatibility and to fix WebM Infinity duration bugs.
  const playableSrc = useMemo(() => {
    if (!src) return src;
    if (useFallbackSrc) return src; // fallback to original if mp4 fails
    return src.includes("res.cloudinary.com")
      ? src.replace(/\.(webm|ogg|wav)(\?.*)?$/i, ".mp4$2")
      : src;
  }, [src, useFallbackSrc]);

  const progress = duration > 0 ? currentTime / duration : 0;
  const activeBars = Math.round(progress * BAR_COUNT);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    setIsPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setIsLoaded(false);
    setHasError(false);
    setIsBuffering(false);
    setUseFallbackSrc(false);

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, [src]);

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
      const rawDuration = Number(audio.duration || 0);
      setDuration(Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0);
      setIsLoaded(true);
      setHasError(false);
      setIsBuffering(false);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setIsBuffering(false);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };

    const onPlay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
      globalThis.window?.dispatchEvent(
        new CustomEvent(VOICE_PLAYER_PLAY_EVENT, {
          detail: { instanceId: instanceIdRef.current },
        }),
      );
      animFrameRef.current = requestAnimationFrame(tick);
    };

    const onPause = () => {
      setIsPlaying(false);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };

    const onWaiting = () => {
      if (!audio.paused) {
        setIsBuffering(true);
      }
    };

    const onCanPlay = () => {
      setIsLoaded(true);
      setHasError(false);
      setIsBuffering(false);
    };

    if (audio.readyState >= 1) {
      onLoaded();
    } else {
      audio.addEventListener("loadedmetadata", onLoaded);
    }

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("stalled", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("canplaythrough", onCanPlay);
    audio.addEventListener("playing", onCanPlay);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("stalled", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("canplaythrough", onCanPlay);
      audio.removeEventListener("playing", onCanPlay);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [playableSrc, tick]);

  useEffect(() => {
    const handleOtherPlayerStart = (event: Event) => {
      const customEvent = event as CustomEvent<{ instanceId?: string }>;
      if (customEvent.detail?.instanceId === instanceIdRef.current) {
        return;
      }

      const audio = audioRef.current;
      if (audio && !audio.paused) {
        audio.pause();
      }
    };

    globalThis.window?.addEventListener(VOICE_PLAYER_PLAY_EVENT, handleOtherPlayerStart);

    return () => {
      globalThis.window?.removeEventListener(VOICE_PLAYER_PLAY_EVENT, handleOtherPlayerStart);
    };
  }, []);

  const handleAudioError = () => {
    if (!useFallbackSrc && src?.includes("res.cloudinary.com")) {
      setIsBuffering(false);
      setIsLoaded(false);
      setUseFallbackSrc(true); // try original src
    } else {
      setHasError(true);
      setIsBuffering(false);
      setIsLoaded(true); // Enable button so user can click and see error
    }
  };

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    if (hasError) return;

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      return;
    }

    // If audio isn't loaded yet, force load it first then play
    if (!isLoaded) {
      setIsBuffering(true);
      audio.load();
    }

    globalThis.window?.dispatchEvent(
      new CustomEvent(VOICE_PLAYER_PLAY_EVENT, {
        detail: { instanceId: instanceIdRef.current },
      }),
    );
    setIsBuffering(true);
    void audio.play().catch(() => {
      setHasError(true);
      setIsBuffering(false);
    });
  };

  const seekToRatio = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      if (!audio || !duration || !Number.isFinite(duration)) {
        return;
      }

      const nextRatio = Math.max(0, Math.min(1, ratio));
      const nextTime = nextRatio * duration;
      if (!Number.isFinite(nextTime)) {
        return;
      }

      audio.currentTime = nextTime;
      setCurrentTime(nextTime);
    },
    [duration],
  );

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = Math.max(rect.width, 1);
    seekToRatio(x / width);
  };

  const handleWaveformKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!duration || !Number.isFinite(duration)) {
      return;
    }

    const seekStepSeconds = Math.min(8, Math.max(3, duration * 0.04));
    const currentRatio = duration > 0 ? currentTime / duration : 0;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      seekToRatio((currentTime + seekStepSeconds) / duration);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekToRatio((currentTime - seekStepSeconds) / duration);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      seekToRatio(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      seekToRatio(1);
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      seekToRatio(currentRatio);
    }
  };

  return (
    <div
      className={cn(
        "voice-player flex items-center gap-3 px-2.5 py-2",
        "min-w-[220px] max-w-[280px]",
        standalone
          ? (isOwn 
              ? "bg-primary text-primary-foreground shadow-sm" 
              : "bg-muted border border-border/50 text-foreground shadow-sm")
          : (isOwn
              ? "bg-white/15 border border-white/20"
              : "bg-muted/40 border border-border/30"),
        // If standalone but no class provided to override radius, fallback to rounded-2xl
        (!className || !className.includes("rounded")) && "rounded-[20px]",
        className
      )}
    >
      {/* Hidden native audio */}
      <audio 
        ref={audioRef} 
        src={playableSrc} 
        preload="metadata" 
        className="hidden" 
        onError={handleAudioError}
      />

      {/* Prominent Play/Pause Button */}
      <button
        type="button"
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        aria-disabled={(!isLoaded && !hasError) || undefined}
        onClick={togglePlay}
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full transition-all shadow-sm active:scale-95",
          !isLoaded && !hasError && !isBuffering && "opacity-50 cursor-wait",
          hasError && "opacity-40 cursor-not-allowed",
          isOwn 
            ? "bg-white/20 text-white hover:bg-white/30" 
            : "bg-primary text-white hover:bg-primary/90",
        )}
      >
        {isBuffering || (!isLoaded && !hasError) ? (
          <LoadingIcon className="size-4 animate-spin" />
        ) : isPlaying ? (
          <PauseIcon className="size-4" />
        ) : (
          <PlayIcon className="size-4 ml-0.5" />
        )}
      </button>

      {/* Waveform Column */}
      <div className="flex flex-col flex-1 min-w-0 justify-center">
        <div
          role="progressbar"
          aria-label="Voice message waveform"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          tabIndex={0}
          className="flex items-center gap-[2px] h-6 cursor-pointer select-none group"
          onClick={handleWaveformClick}
          onKeyDown={handleWaveformKeyDown}
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
                    ? isOwn ? "bg-white/90" : "bg-primary"
                    : isOwn ? "bg-white/30 group-hover:bg-white/40" : "bg-muted-foreground/30 group-hover:bg-muted-foreground/40",
                )}
                style={{
                  height: `${Math.max(20, Math.round(height * 100))}%`,
                  ["--i" as "--i"]: i,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Time Display */}
      <div className={cn(
        "text-[11px] font-medium font-mono tabular-nums min-w-[34px] text-right shrink-0",
        isOwn ? "text-white/80" : "text-muted-foreground/80"
      )}>
        {hasError
          ? "N/A"
          : isPlaying || currentTime > 0
            ? formatTime(currentTime)
            : formatTime(duration)}
      </div>
    </div>
  );
};

export default VoiceMessagePlayer;
