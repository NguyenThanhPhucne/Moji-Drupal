import { useEffect, useRef, useState, memo } from "react";
import { cn } from "@/lib/utils";

interface VoiceRecordingVisualizerProps {
  stream: MediaStream | null;
  className?: string;
  barCount?: number;
}

const VoiceRecordingVisualizerComponent = ({
  stream,
  className,
  barCount = 15,
}: VoiceRecordingVisualizerProps) => {
  const [volumes, setVolumes] = useState<number[]>(Array(barCount).fill(0));
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const requestFrameRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!stream) {
      setVolumes(Array(barCount).fill(0));
      return;
    }

    try {
      // Clean up previous instances just in case
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64; // Small fftSize for a few bars
      analyser.smoothingTimeConstant = 0.8; // Smooth transitions

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const UPDATE_INTERVAL_MS = 33; // ~30Hz to reduce scroll lag (60Hz is overkill for waveform)

      const updateWaveform = () => {
        const now = performance.now();
        // Only update state if enough time has passed (throttle to ~30fps)
        if (now - lastUpdateRef.current >= UPDATE_INTERVAL_MS) {
          lastUpdateRef.current = now;
          
          if (!analyserRef.current) {
            requestFrameRef.current = requestAnimationFrame(updateWaveform);
            return;
          }

          analyserRef.current.getByteFrequencyData(dataArray);

          // Map the frequency data (0-255) to a normalized volume (0-1)
          // Group frequencies roughly into `barCount` buckets
          const step = Math.max(1, Math.floor(dataArray.length / barCount));
          const nextVolumes: number[] = [];

          for (let i = 0; i < barCount; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) {
              const index = i * step + j;
              if (index < dataArray.length) {
                sum += dataArray[index];
              }
            }
            const average = sum / step;
            // Normalize to 0-1
            nextVolumes.push(Math.min(1, average / 255));
          }

          setVolumes(nextVolumes);
        }
        requestFrameRef.current = requestAnimationFrame(updateWaveform);
      };

      // Start animation
      requestFrameRef.current = requestAnimationFrame(updateWaveform);
    } catch (err) {
      console.error("Failed to initialize AudioContext for visualizer:", err);
    }

    return () => {
      if (requestFrameRef.current) {
        cancelAnimationFrame(requestFrameRef.current);
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
    };
  }, [stream, barCount]);

  return (
    <div className={cn("flex items-center gap-[3px] h-5", className)} aria-hidden="true">
      {volumes.map((vol, index) => {
        // Minimum height so it's always visible (e.g. 20% = 4px for h-5)
        // Scale the remaining 80% based on volume
        const heightPercent = 20 + vol * 80;
        return (
          <span
            key={index}
            className="w-[3px] bg-primary rounded-full transition-all duration-75"
            style={{ height: `${heightPercent}%` }}
          />
        );
      })}
    </div>
  );
};
export const VoiceRecordingVisualizer = memo(VoiceRecordingVisualizerComponent, (prevProps, nextProps) => {
  // Only re-render if stream reference changed or barCount changed
  return prevProps.stream === nextProps.stream && prevProps.barCount === nextProps.barCount && prevProps.className === nextProps.className;
});