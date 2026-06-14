const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const normalizeLevel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LOG_LEVELS, normalized)
    ? normalized
    : null;
};

const resolveLogLevel = () => {
  const explicit = normalizeLevel(process.env.LOG_LEVEL);
  if (explicit) {
    return explicit;
  }

  const isProduction =
    String(process.env.NODE_ENV || "").toLowerCase() === "production";
  return isProduction ? "info" : "debug";
};

const ACTIVE_LOG_LEVEL = resolveLogLevel();

const shouldLog = (level) =>
  LOG_LEVELS[level] >= LOG_LEVELS[ACTIVE_LOG_LEVEL];

const serializeMeta = (meta) => {
  if (meta === undefined || meta === null) {
    return "";
  }

  try {
    const payload = JSON.stringify(meta);
    return payload ? ` ${payload}` : "";
  } catch {
    return " [meta-unserializable]";
  }
};

const log = (level, message, meta) => {
  if (!shouldLog(level)) {
    return;
  }

  const prefix = `[${level.toUpperCase()}]`;
  const output = `${prefix} ${message}${serializeMeta(meta)}`;

  if (level === "error") {
    console.error(output);
    return;
  }

  if (level === "warn") {
    console.warn(output);
    return;
  }

  console.log(output);
};

export const logger = {
  debug: (message, meta) => log("debug", message, meta),
  info: (message, meta) => log("info", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  error: (message, meta) => log("error", message, meta),
};
