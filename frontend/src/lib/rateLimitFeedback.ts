import axios from "axios";
import { toast } from "sonner";

type MaybeNumber = number | null;

export type RateLimitInfo = {
  retryAfterSeconds: number;
  scope: string;
  profile: string;
  limit: MaybeNumber;
  remaining: MaybeNumber;
  windowSeconds: MaybeNumber;
};

type CooldownState = {
  expiresAt: number;
  toastId: string;
  intervalId: ReturnType<typeof setInterval> | null;
  title: string;
  scopeLabel: string;
};

const MIN_RETRY_SECONDS = 1;
const MAX_RETRY_SECONDS = 300;
const TOAST_ID_PREFIX = "rate-limit-cooldown";

const cooldownByScope = new Map<string, CooldownState>();

const asScalarString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  return undefined;
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
};

const toPositiveInteger = (value: unknown): number | null => {
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
};

const clampRetryAfterSeconds = (value: unknown): number | null => {
  const parsed = toPositiveInteger(value);
  if (parsed === null) {
    return null;
  }

  return Math.min(MAX_RETRY_SECONDS, Math.max(MIN_RETRY_SECONDS, parsed));
};

const normalizeScope = (value: unknown): string => {
  const scope = (asScalarString(value) || "").trim().toLowerCase();
  return scope || "global";
};

const normalizeProfile = (value: unknown): string => {
  const profile = (asScalarString(value) || "").trim().toLowerCase();
  return profile || "none";
};

const getHeaderValue = (
  headers: unknown,
  name: string,
): string | undefined => {
  if (!headers) {
    return undefined;
  }

  const normalizedName = name.toLowerCase();

  if (
    typeof headers === "object" &&
    headers !== null &&
    "get" in headers &&
    typeof (headers as { get?: unknown }).get === "function"
  ) {
    const value = (headers as { get: (headerName: string) => unknown }).get(
      normalizedName,
    );
    return asScalarString(value);
  }

  if (typeof headers === "object" && headers !== null) {
    const record = headers as Record<string, unknown>;
    const directValue = record[normalizedName] ?? record[name];
    return asScalarString(directValue);
  }

  return undefined;
};

const formatScopeLabel = (scope: string): string => {
  if (!scope || scope === "global") {
    return "action";
  }

  const [prefix, suffix] = scope.split(":");
  if (!suffix) {
    return scope;
  }

  return `${prefix} / ${suffix}`;
};

const buildCooldownDescription = ({
  remainingSeconds,
  scopeLabel,
  profile,
  limit,
  remaining,
}: {
  remainingSeconds: number;
  scopeLabel: string;
  profile: string;
  limit: MaybeNumber;
  remaining: MaybeNumber;
}) => {
  const profileLabel = profile && profile !== "none" ? ` (${profile})` : "";
  const budgetLabel =
    limit !== null && remaining !== null
      ? ` Remaining ${Math.max(0, remaining)}/${Math.max(0, limit)}.`
      : "";

  return `Scope: ${scopeLabel}${profileLabel}. Retry in ${remainingSeconds}s.${budgetLabel}`;
};

const stopCooldown = (scopeKey: string) => {
  const current = cooldownByScope.get(scopeKey);
  if (!current) {
    return;
  }

  if (current.intervalId) {
    clearInterval(current.intervalId);
  }

  toast.dismiss(current.toastId);
  cooldownByScope.delete(scopeKey);
};

const renderCooldownToast = (scopeKey: string, info: RateLimitInfo) => {
  const state = cooldownByScope.get(scopeKey);
  if (!state) {
    return;
  }

  const remainingSeconds = Math.max(
    0,
    Math.ceil((state.expiresAt - Date.now()) / 1000),
  );

  if (remainingSeconds <= 0) {
    stopCooldown(scopeKey);
    return;
  }

  toast.error(state.title, {
    id: state.toastId,
    duration: 1200,
    description: buildCooldownDescription({
      remainingSeconds,
      scopeLabel: state.scopeLabel,
      profile: info.profile,
      limit: info.limit,
      remaining: info.remaining,
    }),
  });
};

export const extractRateLimitInfo = (
  error: unknown,
  fallbackScope = "global",
): RateLimitInfo | null => {
  if (!axios.isAxiosError(error) || error.response?.status !== 429) {
    return null;
  }

  const responseData = error.response?.data as {
    retryAfterSeconds?: unknown;
    rateLimitScope?: unknown;
    rateLimitProfile?: unknown;
  } | null;
  const headers = error.response?.headers;

  const retryAfterSeconds =
    clampRetryAfterSeconds(responseData?.retryAfterSeconds) ??
    clampRetryAfterSeconds(getHeaderValue(headers, "retry-after"));

  if (!retryAfterSeconds) {
    return null;
  }

  const scope = normalizeScope(
    responseData?.rateLimitScope ||
      getHeaderValue(headers, "x-ratelimit-scope") ||
      fallbackScope,
  );

  const profile = normalizeProfile(
    responseData?.rateLimitProfile ||
      getHeaderValue(headers, "x-ratelimit-profile"),
  );

  const limit = toPositiveInteger(getHeaderValue(headers, "x-ratelimit-limit"));
  const remaining = toFiniteNumber(
    getHeaderValue(headers, "x-ratelimit-remaining"),
  );
  const windowSeconds = toPositiveInteger(
    getHeaderValue(headers, "x-ratelimit-window-seconds"),
  );

  return {
    retryAfterSeconds,
    scope,
    profile,
    limit,
    remaining,
    windowSeconds,
  };
};

export const startRateLimitCooldown = (
  info: RateLimitInfo,
  actionLabel = "Too many requests",
) => {
  const scopeKey = normalizeScope(info.scope);
  const nextExpiresAt = Date.now() + info.retryAfterSeconds * 1000;
  const existing = cooldownByScope.get(scopeKey);

  if (existing) {
    existing.expiresAt = Math.max(existing.expiresAt, nextExpiresAt);
    renderCooldownToast(scopeKey, info);
    return info;
  }

  const toastId = `${TOAST_ID_PREFIX}:${scopeKey}`;
  const state: CooldownState = {
    expiresAt: nextExpiresAt,
    toastId,
    intervalId: null,
    title: actionLabel,
    scopeLabel: formatScopeLabel(scopeKey),
  };

  cooldownByScope.set(scopeKey, state);
  renderCooldownToast(scopeKey, info);

  state.intervalId = setInterval(() => {
    renderCooldownToast(scopeKey, info);
  }, 1000);

  return info;
};

export const handleRateLimitError = (
  error: unknown,
  options?: {
    fallbackScope?: string;
    actionLabel?: string;
  },
) => {
  const info = extractRateLimitInfo(error, options?.fallbackScope || "global");
  if (!info) {
    return {
      handled: false,
      info: null,
    } as const;
  }

  startRateLimitCooldown(info, options?.actionLabel || "Too many requests");

  return {
    handled: true,
    info,
  } as const;
};
