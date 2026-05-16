import { AlertCircle, AlertTriangle, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  errorShakeClass,
  fadeInUpClass,
  focusRingAnimationClass,
  buttonPressClass,
} from "@/lib/voiceAnimations";

/**
 * Error context and recovery suggestions for audio loading failures
 */
export interface AudioErrorContext {
  title: string;
  description: string;
  recovery: string;
  errorCode: string;
}

export const getAudioErrorContext = (error: DOMException | null): AudioErrorContext => {
  if (!error) {
    return {
      title: "Failed to Load Audio",
      description: "The voice message could not be loaded.",
      recovery: "Try again or refresh the page.",
      errorCode: "UNKNOWN",
    };
  }

  const contexts: Record<string, AudioErrorContext> = {
    AbortError: {
      title: "Loading Cancelled",
      description: "The audio loading was cancelled.",
      recovery: "Tap to retry loading the voice message.",
      errorCode: "ABORT",
    },
    NotSupportedError: {
      title: "Format Not Supported",
      description: "Your browser may not support this audio format.",
      recovery: "Try a different browser or refresh the page.",
      errorCode: "FORMAT_UNSUPPORTED",
    },
    NotAllowedError: {
      title: "Permission Denied",
      description: "Audio playback permission was denied.",
      recovery: "Check your browser permissions and try again.",
      errorCode: "PERMISSION_DENIED",
    },
    NetworkError: {
      title: "Network Error",
      description: "Failed to download the voice message.",
      recovery: "Check your internet connection and try again.",
      errorCode: "NETWORK_ERROR",
    },
  };

  return (
    contexts[error.name] || {
      title: "Audio Error",
      description: `An error occurred (${error.name}).`,
      recovery: "Try refreshing the page or contact support if the problem persists.",
      errorCode: error.name,
    }
  );
};

/**
 * Error UI component for voice player
 */
export const VoicePlayerErrorUI = ({
  error,
  onRetry,
  onRefresh,
  isOwn,
}: {
  error: DOMException | null;
  onRetry: () => void;
  onRefresh?: () => void;
  isOwn?: boolean;
}) => {
  const context = getAudioErrorContext(error);

  return (
    <div
      className={cn(
        "voice-player-error flex flex-col gap-2 p-3 rounded-lg border",
        fadeInUpClass,
        errorShakeClass,
        "bg-destructive/10 border-destructive/20",
        isOwn && "dark:bg-destructive/15 dark:border-destructive/30",
      )}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-destructive">{context.title}</div>
          <div className="text-xs text-muted-foreground mt-1">{context.description}</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <button
          type="button"
          onClick={onRetry}
          aria-label="Retry loading voice message"
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded transition-all",
            buttonPressClass,
            focusRingAnimationClass,
            "bg-destructive text-white hover:bg-destructive/90 hover:shadow-md",
            "dark:bg-destructive dark:hover:bg-destructive/80"
          )}
        >
          Retry
        </button>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh the page"
            className={cn(
              "text-xs font-medium px-3 py-1.5 rounded transition-all",
              buttonPressClass,
              focusRingAnimationClass,
              "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            Refresh
          </button>
        )}
      </div>

      <div id={`audio-error-desc-${error?.name}`} className="sr-only">
        {context.recovery}
      </div>
    </div>
  );
};

/**
 * Microphone permission error dialog for recording
 */
export const getMicrophoneErrorContext = (error: DOMException | null) => {
  if (!error) {
    return {
      title: "Microphone Error",
      message: "Could not access the microphone.",
      suggestion: "Please check your microphone and try again.",
      errorCode: "UNKNOWN",
    };
  }

  const contexts: Record<string, any> = {
    NotAllowedError: {
      title: "Microphone Permission Denied",
      message: "You denied microphone access. To record voice messages, you'll need to allow microphone access in your browser settings.",
      suggestion: "Click the microphone icon in your address bar to update permissions.",
      errorCode: "PERMISSION_DENIED",
      showSettings: true,
    },
    NotFoundError: {
      title: "No Microphone Found",
      message: "Your device doesn't have a microphone, or it's not detected.",
      suggestion: "Please connect a microphone and try again.",
      errorCode: "DEVICE_NOT_FOUND",
    },
    NotReadableError: {
      title: "Microphone In Use",
      message: "Your microphone is already in use by another application.",
      suggestion: "Close other applications using the microphone and try again.",
      errorCode: "DEVICE_IN_USE",
    },
    SecurityError: {
      title: "Secure Connection Required",
      message: "Microphone access requires a secure (HTTPS) connection.",
      suggestion: "Please ensure you're using a secure connection.",
      errorCode: "INSECURE_CONTEXT",
    },
    OverconstrainedError: {
      title: "Microphone Requirements",
      message: "Your microphone doesn't meet the recording requirements.",
      suggestion: "Try using a different microphone or device.",
      errorCode: "OVERCONSTRAINED",
    },
  };

  return (
    contexts[error.name] || {
      title: "Microphone Error",
      message: error.message || "Could not access the microphone.",
      suggestion: "Please check your device and try again.",
      errorCode: error.name,
    }
  );
};

/**
 * Offline indicator for recording
 */
export const OfflineRecordingIndicator = () => (
  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border bg-[hsl(var(--status-warning)/0.2)] text-[hsl(var(--status-warning-strong))] border-[hsl(var(--status-warning)/0.3)]">
    <Wifi className="w-3 h-3" />
    <span>Will send when online</span>
  </div>
);

/**
 * Recording duration with max indicator
 */
export const RecordingDurationDisplay = ({
  current,
  max = 180,
}: {
  current: number;
  max?: number;
}) => {
  const isWarning = current > max * 0.85;
  const isDanger = current > max * 0.95;
  const timeRemaining = Math.max(0, max - current);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        "font-mono text-sm font-semibold tabular-nums",
        isDanger && "text-destructive animate-pulse",
        isWarning && !isDanger && "text-[hsl(var(--status-warning-strong))]",
      )}>
        {formatTime(current)}
      </span>

      <span className="text-xs text-muted-foreground">
        / {formatTime(max)}
      </span>

      {isDanger && (
        <span className={cn(
          "text-xs font-medium px-2 py-0.5 rounded",
          "bg-destructive/20 text-destructive-foreground animate-pulse",
        )}>
          {timeRemaining}s left
        </span>
      )}

      {isWarning && !isDanger && (
        <span className={cn(
          "text-xs font-medium px-2 py-0.5 rounded",
          "bg-[hsl(var(--status-warning)/0.2)] text-[hsl(var(--status-warning-strong))]",
        )}>
          {timeRemaining}s left
        </span>
      )}
    </div>
  );
};

/**
 * Skeleton loader for voice player
 */
export const VoicePlayerSkeleton = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "voice-player-skeleton flex items-center gap-3 px-2.5 py-2",
      "flex-col sm:flex-row",
      "w-full sm:w-auto sm:min-w-[220px] sm:max-w-[280px] rounded-[20px]",
      "bg-muted/50 animate-pulse",
      "motion-reduce:animate-none",
      className,
    )}
    role="status"
    aria-busy="true"
    aria-label="Loading voice message, please wait"
  >
    {/* Play button skeleton - with pulse animation */}
    <div className={cn(
      "w-12 h-12 rounded-full bg-muted",
      "animate-pulse"
    )} />

    {/* Waveform skeleton - with staggered animation */}
    <div className="flex flex-1 items-center gap-[2px] h-8 justify-center w-full sm:w-auto">
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={`skeleton-bar-${i}`}
          className={cn(
            "flex-1 rounded-full bg-muted-foreground/25",
            "animate-pulse"
          )}
          style={{
            height: `${20 + (Math.sin(i * 0.5) + 1) * 30}%`,
            animationDelay: `${i * 30}ms`,
          }}
        />
      ))}
    </div>

    {/* Time skeleton - with subtle pulse */}
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className={cn(
        "w-12 h-5 bg-muted rounded",
        "animate-pulse"
      )} />
      <div className="w-10 h-4 bg-muted rounded animate-pulse" />
    </div>
  </div>
);

/**
 * Recording status announcement for screen readers
 */
export const RecordingStatusLiveRegion = ({
  isRecording,
  duration,
  maxDuration = 180,
}: {
  isRecording: boolean;
  duration: number;
  maxDuration?: number;
}) => {
  const timeRemaining = maxDuration - duration;

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {isRecording && (
        <>
          Recording voice message. {Math.floor(duration)} seconds recorded.
          {timeRemaining <= 30 && ` Warning: Only ${timeRemaining} seconds of recording time remaining.`}
        </>
      )}
    </div>
  );
};

/**
 * Failed message recovery UI
 */
export const FailedMessageRecoveryUI = ({
  retryCount = 0,
  maxRetries = 8,
  onRetry,
}: {
  retryCount?: number;
  maxRetries?: number;
  onRetry: () => void;
}) => (
  <div
    className={cn(
      "mt-2 flex items-center gap-2 p-2 rounded-lg border",
      "bg-destructive/10 border-destructive/20",
    )}
    role="alert"
  >
    <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <div className="text-xs font-medium text-destructive">Failed to send</div>
      <div className="text-xs text-muted-foreground">
        Attempt {retryCount + 1} of {maxRetries}
      </div>
    </div>
    <button
      type="button"
      onClick={onRetry}
      className={cn(
        "shrink-0 text-xs font-medium px-2.5 py-1 rounded transition-colors active:scale-95",
        "bg-destructive text-white hover:bg-destructive/90",
      )}
      aria-label="Retry sending message"
    >
      Retry
    </button>
  </div>
);
