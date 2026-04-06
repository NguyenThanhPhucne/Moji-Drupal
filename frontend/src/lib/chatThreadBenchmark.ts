export interface ChatThreadSample {
  phase: "mount" | "update" | "nested-update";
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
  memoryMB: number | null;
  messageCount: number;
}

interface ChatThreadSummary {
  sampleCount: number;
  mountCount: number;
  updateCount: number;
  avgCommitMs: number;
  p95CommitMs: number;
  maxCommitMs: number;
  avgBaseMs: number;
  latestMemoryMB: number | null;
  peakMemoryMB: number | null;
  atMessageCount: number;
}

const KEY = "__moji_chat_thread_bench__";

const readMemoryMB = () => {
  // Chromium-only API, keep nullable for cross-browser.
  const heap = (globalThis as { performance?: { memory?: { usedJSHeapSize?: number } } })
    .performance?.memory?.usedJSHeapSize;
  if (!heap || !Number.isFinite(heap)) {
    return null;
  }
  return Number((heap / 1024 / 1024).toFixed(2));
};

const getState = () => {
  const root = globalThis as Record<string, unknown>;
  if (!root[KEY]) {
    root[KEY] = {
      enabled: false,
      samples: [] as ChatThreadSample[],
      startedAt: Date.now(),
    };
  }
  return root[KEY] as {
    enabled: boolean;
    samples: ChatThreadSample[];
    startedAt: number;
  };
};

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[idx];
};

export const isChatThreadBenchEnabled = () => {
  try {
    const url = new URL(globalThis.location.href);
    return url.searchParams.get("bench") === "1";
  } catch {
    return false;
  }
};

export const startChatThreadBench = () => {
  const state = getState();
  state.enabled = true;
  state.samples = [];
  state.startedAt = Date.now();
};

export const stopChatThreadBench = () => {
  const state = getState();
  state.enabled = false;
};

export const pushChatThreadSample = (
  sample: Omit<ChatThreadSample, "memoryMB">,
) => {
  const state = getState();
  if (!state.enabled) {
    return;
  }

  state.samples.push({
    ...sample,
    memoryMB: readMemoryMB(),
  });
};

export const getChatThreadBenchSummary = (): ChatThreadSummary => {
  const state = getState();
  const durations = state.samples.map((sample) => sample.actualDuration);
  const baseDurations = state.samples.map((sample) => sample.baseDuration);
  const memorySamples = state.samples
    .map((sample) => sample.memoryMB)
    .filter((memory): memory is number => Number.isFinite(memory ?? Number.NaN));

  const mountCount = state.samples.filter((sample) => sample.phase === "mount").length;
  const updateCount = state.samples.filter((sample) => sample.phase !== "mount").length;
  const avgCommitMs =
    durations.length > 0
      ? Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2))
      : 0;
  const avgBaseMs =
    baseDurations.length > 0
      ? Number(
          (baseDurations.reduce((sum, value) => sum + value, 0) / baseDurations.length).toFixed(2),
        )
      : 0;

  return {
    sampleCount: state.samples.length,
    mountCount,
    updateCount,
    avgCommitMs,
    p95CommitMs: Number(percentile(durations, 0.95).toFixed(2)),
    maxCommitMs: Number((Math.max(0, ...durations)).toFixed(2)),
    avgBaseMs,
    latestMemoryMB: memorySamples.length > 0 ? (memorySamples.at(-1) ?? null) : null,
    peakMemoryMB:
      memorySamples.length > 0 ? Number(Math.max(...memorySamples).toFixed(2)) : null,
    atMessageCount: state.samples.at(-1)?.messageCount ?? 0,
  };
};

export const exposeChatThreadBenchApi = () => {
  const root = globalThis as Record<string, unknown>;
  root.chatThreadBench = {
    start: startChatThreadBench,
    stop: stopChatThreadBench,
    summary: getChatThreadBenchSummary,
    samples: () => [...getState().samples],
  };
};
