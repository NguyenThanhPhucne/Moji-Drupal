import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  VoicePlayerErrorUI,
  VoicePlayerSkeleton,
} from "./VoiceUIComponents";
import {
  playerRevealClass,
  waveformBarAnimationClass,
  focusRingAnimationClass,
  buttonPressClass,
} from "@/lib/voiceAnimations";

interface VoiceMessagePlayerProps {
  src: string;
  isOwn?: boolean;
  standalone?: boolean;
  className?: string;
  initialDurationSeconds?: number | null;
  audioSizeBytes?: number | null;
}

const BAR_COUNT = 24;
const VOICE_PLAYER_PLAY_EVENT = "moji:voice-player-play";

const buildVoicePlayerInstanceId = () => {
  return `voice-player-${Math.random().toString(36).slice(2)}-${Date.now()}`;
};

// Pre-generate stable bar heights to look like a waveform
const WAVEFORM_BARS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const pattern = [0.3, 0.6, 0.9, 0.7, 1, 0.5, 0.8, 0.4, 0.75, 0.55, 0.9, 0.65,
                   0.45, 0.85, 0.6, 0.95, 0.35, 0.7, 0.5, 0.8, 0.4, 0.65, 0.9, 0.3];
  return pattern[i % pattern.length];
});

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

const formatFileSize = (bytes: number | null | undefined) => {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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

const VoiceMessagePlayer = ({
  src,
  isOwn = false,
  standalone = false,
  className,
  initialDurationSeconds = null,
  audioSizeBytes = null,
}: VoiceMessagePlayerProps) => { // NOSONAR
  const audioRef = useRef<HTMLAudioElement>(null);
  const instanceIdRef = useRef(buildVoicePlayerInstanceId());
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(
    Number.isFinite(Number(initialDurationSeconds))
      ? Math.max(0, Number(initialDurationSeconds))
      : 0,
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [useFallbackSrc, setUseFallbackSrc] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [liveVolumes, setLiveVolumes] = useState<number[]>([]);
  const animFrameRef = useRef<number | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

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
  const standaloneToneClass = isOwn
    ? "bg-primary text-primary-foreground shadow-sm"
    : "bg-muted border border-border/50 text-foreground shadow-sm";
  const inlineToneClass = isOwn
    ? "bg-white/15 border border-white/20"
    : "bg-muted/40 border border-border/30";
  const playerToneClass = standalone ? standaloneToneClass : inlineToneClass;
  const playerRadiusClass = className?.includes("rounded")
    ? ""
    : "rounded-[20px]";
  const actionButtonToneClass = isOwn
    ? "bg-white/20 text-white hover:bg-white/30"
    : "bg-primary text-white hover:bg-primary/90";
  const waveformActiveClass = isOwn ? "bg-white/90" : "bg-primary";
  const waveformInactiveClass = isOwn
    ? "bg-white/30 group-hover:bg-white/40"
    : "bg-muted-foreground/30 group-hover:bg-muted-foreground/40";
  const timeToneClass = isOwn ? "text-white/80" : "text-muted-foreground/80";
  const hasPlayableTime = isPlaying || currentTime > 0;
  const timeLabel = hasPlayableTime
    ? formatTime(currentTime)
    : formatTime(duration);
  const actionIcon = (() => {
    if (isBuffering || (!isLoaded && !hasError)) {
      return <LoadingIcon className="size-4 animate-spin" />;
    }

    if (isPlaying) {
      return <PauseIcon className="size-4" />;
    }

    return <PlayIcon className="size-4 ml-0.5" />;
  })();

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    setIsPlaying(false);
    setDuration(
      Number.isFinite(Number(initialDurationSeconds))
        ? Math.max(0, Number(initialDurationSeconds))
        : 0,
    );
    setCurrentTime(0);
    setIsLoaded(false);
    setHasError(false);
    setIsBuffering(false);
    setUseFallbackSrc(false);

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, [initialDurationSeconds, src]);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);

    // Update waveform if playing
    if (!audio.paused) {
      if (analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Map to BAR_COUNT
        const step = Math.max(1, Math.floor(dataArray.length / BAR_COUNT));
        const nextVolumes: number[] = [];
        let hasData = false;

        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            const index = i * step + j;
            if (index < dataArray.length) {
              sum += dataArray[index];
            }
          }
          const average = sum / step;
          const normalized = Math.min(1, average / 255);
          nextVolumes.push(normalized);
          if (normalized > 0.05) hasData = true;
        }

        if (hasData) {
          setLiveVolumes(nextVolumes);
        } else {
          // Fallback jitter if CORS blocks data or audio is silent
          setLiveVolumes(WAVEFORM_BARS.map(base => Math.max(0.2, Math.min(1, base + (Math.random() * 0.4 - 0.2)))));
        }
      } else {
         // Pure fallback jitter
         setLiveVolumes(WAVEFORM_BARS.map(base => Math.max(0.2, Math.min(1, base + (Math.random() * 0.4 - 0.2)))));
      }

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

      // Init AudioContext on first play
      if (!audioContextRef.current && audioRef.current) {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.8;
          
          const source = ctx.createMediaElementSource(audioRef.current);
          source.connect(analyser);
          analyser.connect(ctx.destination);
          
          audioContextRef.current = ctx;
          analyserRef.current = analyser;
          sourceRef.current = source;
        } catch (e) {
          console.warn("Failed to init AudioContext for playback", e);
        }
      }

      // Resume context if suspended
      if (audioContextRef.current?.state === "suspended") {
        void audioContextRef.current.resume();
      }

      globalThis.window.dispatchEvent?.(
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
      
      // Safely disconnect audio nodes to prevent memory leaks
      try {
        if (sourceRef.current) {
          sourceRef.current.disconnect();
          sourceRef.current = null;
        }
      } catch (e) {
        console.warn("Failed to disconnect audio source", e);
      }
      
      try {
        if (analyserRef.current) {
          analyserRef.current.disconnect();
          analyserRef.current = null;
        }
      } catch (e) {
        console.warn("Failed to disconnect analyser", e);
      }
      
      try {
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
          void audioContextRef.current.close();
        }
        audioContextRef.current = null;
      } catch (e) {
        console.warn("Failed to close audio context", e);
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

  const retryLoad = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setHasError(false);
    setIsLoaded(false);
    setIsBuffering(true);
    audio.load();
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

    globalThis.window?.dispatchEvent?.(
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

  const handleWaveformClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = Math.max(rect.width, 1);
    seekToRatio(x / width);
  };

  const handleWaveformKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
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
        "voice-player flex items-center gap-2 sm:gap-3 px-2.5 py-2",
        // Responsive sizing: full width on mobile, constrained on desktop
        "w-full sm:w-auto sm:min-w-[220px] sm:max-w-[280px]",
        // Responsive flex direction: column on tiny, row on larger
        "flex-col sm:flex-row",
        playerToneClass,
        playerRadiusClass,
        // Smooth reveal animation
        playerRevealClass,
        className
      )}
      role="region"
      aria-label="Voice message player"
    >
      {/* Hidden native audio - rendered unconditionally so it loads in background */}
      <audio 
        ref={audioRef} 
        src={playableSrc} 
        crossOrigin="anonymous"
        preload="metadata" 
        className="hidden" 
        onError={handleAudioError}
      >
        <track kind="captions" />
      </audio>

      {/* Loading skeleton */}
      {!isLoaded && !hasError && (
        <VoicePlayerSkeleton className={className} />
      )}

      {/* Error state */}
      {hasError && (
        <VoicePlayerErrorUI
          error={null}
          onRetry={retryLoad}
          onRefresh={() => window.location.reload()}
          isOwn={isOwn}
        />
      )}

      {/* Player content */}
      {isLoaded && !hasError && (
        <>

          {/* Prominent Play/Pause Button - Enterprise touch target: 48px */}
          <button
            type="button"
            aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
            aria-disabled={(!isLoaded && !hasError) || undefined}
            aria-describedby={`voice-player-desc-${instanceIdRef.current}`}
            onClick={togglePlay}
            className={cn(
              "flex size-12 sm:size-12 shrink-0 items-center justify-center rounded-full",
              "transition-all duration-200 shadow-sm",
              "hover:shadow-lg hover:scale-105",
              buttonPressClass,
              focusRingAnimationClass,
              !isLoaded && !hasError && !isBuffering && "opacity-50 cursor-wait",
              hasError && "opacity-40 cursor-not-allowed",
              actionButtonToneClass,
            )}
          >
            {actionIcon}
          </button>

          {/* Waveform Column - Enterprise touch target: 32px height, responsive width */}
          <div className="flex flex-col flex-1 min-w-0 justify-center w-full sm:w-auto">
            <progress
              className="sr-only"
              max={100}
              value={Math.round(progress * 100)}
              aria-label="Voice message progress"
            />
            <button
              type="button"
              className={cn(
                "flex w-full sm:w-auto items-center gap-[2px] h-8 cursor-pointer select-none group",
                "bg-transparent p-0 text-inherit",
                "hover:opacity-80 transition-opacity duration-200",
                focusRingAnimationClass,
                "rounded"
              )}
              onClick={handleWaveformClick}
              onKeyDown={handleWaveformKeyDown}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, Math.round(duration))}
              aria-valuenow={Math.max(0, Math.round(currentTime))}
              aria-label={`Voice waveform: ${formatTime(currentTime)} of ${formatTime(duration)}`}
              aria-description="Use arrow keys or Home/End to navigate"
            >
              {(liveVolumes.length && isPlaying ? liveVolumes : WAVEFORM_BARS).map((height, i) => {
                const isActive = i < activeBars;
                const waveformClass = isActive ? waveformActiveClass : waveformInactiveClass;
                // Map height to percentage (minimum 20% for visibility)
                const barHeight = `${Math.max(20, Math.round(height * 100))}%`;
                return (
                  <span
                    key={`voice-bar-${i}`}
                    className={cn(
                      "flex-1 rounded-full transition-all",
                      waveformBarAnimationClass,
                      isPlaying && isActive ? "voice-bar-playing" : "",
                      waveformClass,
                    )}
                    style={{
                      height: barHeight,
                      transform: isPlaying ? "scaleY(1)" : "scaleY(0.95)",
                    }}
                  />
                );
              })}
            </button>

            {/* Buffering progress indicator - subtle and responsive */}
            {isBuffering && (
              <div className="mt-1 w-full bg-muted-foreground/20 rounded-full h-0.5 overflow-hidden">
                <div 
                  className={cn(
                    "bg-primary h-full transition-all",
                    "duration-300 animate-pulse-subtle"
                  )}
                  style={{ width: `${Math.min((currentTime / duration) * 100, 95)}%` }}
                />
              </div>
            )}
          </div>

          {/* Time / error state - Enterprise sizing */}
          <div className="flex flex-col items-end gap-0.5 shrink-0 min-w-max">
            <div className={cn(
              "text-sm font-medium font-mono tabular-nums",
              timeToneClass,
            )}>
              {timeLabel}
            </div>
            {audioSizeBytes && (
              <div className={cn(
                "text-xs opacity-70 font-mono",
                timeToneClass,
              )}>
                {formatFileSize(audioSizeBytes)}
              </div>
            )}
          </div>

          {/* Screen reader description */}
          <div id={`voice-player-desc-${instanceIdRef.current}`} className="sr-only">
            Voice message player. {formatTime(duration)} total duration, {formatFileSize(audioSizeBytes)}.
            Currently at {formatTime(currentTime)}. Click play button to listen, or click on the waveform to jump to a position.
          </div>

          {/* Buffering announcement */}
          {isBuffering && (
            <span className="sr-only" aria-live="polite" aria-atomic="true">
              Loading voice message, please wait
            </span>
          )}
        </>
      )}
    </div>
  );
};

export default VoiceMessagePlayer;
