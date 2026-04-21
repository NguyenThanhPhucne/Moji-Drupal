import { randomUUID } from "node:crypto";

const SOCKET_EVENT_SOURCE_INSTANCE =
  process.env.HOSTNAME || process.env.PM2_INSTANCE_ID || "single-node";

const SOCKET_EVENT_MAX_SCOPE_TRACK = 2000;
const scopeSequenceMap = new Map();
const scopeLastEventTsMap = new Map();

const normalizeScalar = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    const normalized = String(value).trim();
    return normalized || null;
  }

  return null;
};

const pruneScopeSequenceMap = () => {
  if (scopeSequenceMap.size <= SOCKET_EVENT_MAX_SCOPE_TRACK) {
    return;
  }

  const removeCount = Math.ceil(SOCKET_EVENT_MAX_SCOPE_TRACK * 0.1);
  const keys = Array.from(scopeSequenceMap.keys()).slice(0, removeCount);
  keys.forEach((key) => {
    scopeSequenceMap.delete(key);
    scopeLastEventTsMap.delete(key);
  });
};

const nextScopeSequence = (scopeKey, eventTsMs) => {
  const normalizedScopeKey = normalizeScalar(scopeKey) || "global";
  const nextSequence = Number(scopeSequenceMap.get(normalizedScopeKey) || 0) + 1;

  scopeSequenceMap.set(normalizedScopeKey, nextSequence);
  scopeLastEventTsMap.set(normalizedScopeKey, eventTsMs);
  pruneScopeSequenceMap();

  return {
    scope: normalizedScopeKey,
    sequence: nextSequence,
  };
};

export const buildSocketEventMeta = ({
  eventName,
  conversationId,
  entityId,
  scope,
} = {}) => {
  const eventTsMs = Date.now();
  const normalizedConversationId = normalizeScalar(conversationId);
  const normalizedEntityId = normalizeScalar(entityId);
  const resolvedScopeKey =
    normalizeScalar(scope) ||
    normalizedConversationId ||
    normalizeScalar(eventName) ||
    "global";

  const { scope: resolvedScope, sequence } = nextScopeSequence(
    resolvedScopeKey,
    eventTsMs,
  );

  return {
    eventId: randomUUID(),
    eventName: normalizeScalar(eventName) || "unknown",
    eventTsMs,
    eventTs: new Date(eventTsMs).toISOString(),
    conversationId: normalizedConversationId,
    entityId: normalizedEntityId,
    scope: resolvedScope,
    scopeSeq: sequence,
    sourceInstance: SOCKET_EVENT_SOURCE_INSTANCE,
  };
};

export const withSocketEventMeta = (payload, options) => {
  const safePayload = payload && typeof payload === "object" ? payload : {};

  if (safePayload.eventMeta) {
    return safePayload;
  }

  return {
    ...safePayload,
    eventMeta: buildSocketEventMeta(options),
  };
};

export const getSocketScopeCursorSnapshot = ({ scopes } = {}) => {
  pruneScopeSequenceMap();

  const normalizedScopes = Array.isArray(scopes)
    ? Array.from(
        new Set(
          scopes
            .map((scope) => normalizeScalar(scope))
            .filter(Boolean),
        ),
      )
    : [];

  const targetScopes =
    normalizedScopes.length > 0
      ? normalizedScopes
      : Array.from(scopeSequenceMap.keys());

  return targetScopes.map((scope) => {
    const lastAppliedSeq = Number(scopeSequenceMap.get(scope) || 0);
    const lastAppliedTsMs = Number(scopeLastEventTsMap.get(scope) || 0);

    return {
      scope,
      lastAppliedSeq: Number.isFinite(lastAppliedSeq) ? lastAppliedSeq : 0,
      lastAppliedTsMs:
        Number.isFinite(lastAppliedTsMs) && lastAppliedTsMs > 0
          ? lastAppliedTsMs
          : null,
    };
  });
};
