const now = () => {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.performance &&
    typeof globalThis.performance.now === "function"
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
};

export const startPerfStep = (name: string) => {
  const start = now();
  try {
    globalThis.performance?.mark?.(`${name}:start`);
  } catch {
    // Ignore mark failures in unsupported environments.
  }
  return start;
};

export const endPerfStep = (name: string, start: number) => {
  const end = now();
  const duration = Number((end - start).toFixed(2));

  try {
    globalThis.performance?.mark?.(`${name}:end`);
    globalThis.performance?.measure?.(name, `${name}:start`, `${name}:end`);
  } catch {
    // Ignore measure failures in unsupported environments.
  }

  console.info(`[perf] ${name}: ${duration}ms`);
  return duration;
};
