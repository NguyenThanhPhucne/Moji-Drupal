export const FEATURE_FLAG_KEYS = [
  "realtime_snapshot_delta_resync",
  "realtime_event_dedupe_ordering",
  "keyboard_power_shortcuts",
  "notification_priority_center",
] as const;

export type AppFeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];
export type AppFeatureFlags = Record<AppFeatureFlagKey, boolean>;

const FEATURE_FLAG_OVERRIDE_STORAGE_KEY = "moji-feature-flags";

const normalizeBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value > 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
};

const resolveEnvFlagDefaults = (): Partial<AppFeatureFlags> => {
  return {
    realtime_snapshot_delta_resync: normalizeBoolean(
      import.meta.env.VITE_FF_REALTIME_SNAPSHOT_DELTA_RESYNC,
      false,
    ),
    realtime_event_dedupe_ordering: normalizeBoolean(
      import.meta.env.VITE_FF_REALTIME_EVENT_DEDUPE_ORDERING,
      true,
    ),
    keyboard_power_shortcuts: normalizeBoolean(
      import.meta.env.VITE_FF_KEYBOARD_POWER_SHORTCUTS,
      false,
    ),
    notification_priority_center: normalizeBoolean(
      import.meta.env.VITE_FF_NOTIFICATION_PRIORITY_CENTER,
      false,
    ),
  };
};

const readLocalFeatureFlagOverrides = (): Partial<AppFeatureFlags> => {
  try {
    const rawValue = globalThis.localStorage.getItem(
      FEATURE_FLAG_OVERRIDE_STORAGE_KEY,
    );

    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return FEATURE_FLAG_KEYS.reduce<Partial<AppFeatureFlags>>((nextFlags, key) => {
      if (key in parsed) {
        nextFlags[key] = normalizeBoolean(
          (parsed as Record<string, unknown>)[key],
          false,
        );
      }
      return nextFlags;
    }, {});
  } catch {
    return {};
  }
};

export const getDefaultFeatureFlags = (): AppFeatureFlags => {
  const envDefaults = resolveEnvFlagDefaults();

  return FEATURE_FLAG_KEYS.reduce<AppFeatureFlags>((nextFlags, key) => {
    nextFlags[key] = normalizeBoolean(envDefaults[key], false);
    return nextFlags;
  }, {} as AppFeatureFlags);
};

export const sanitizeServerFeatureFlags = (
  incomingFlags: unknown,
): Partial<AppFeatureFlags> => {
  if (!incomingFlags || typeof incomingFlags !== "object") {
    return {};
  }

  const rawFlags = incomingFlags as Record<string, unknown>;

  return FEATURE_FLAG_KEYS.reduce<Partial<AppFeatureFlags>>((nextFlags, key) => {
    if (key in rawFlags) {
      nextFlags[key] = normalizeBoolean(rawFlags[key], false);
    }

    return nextFlags;
  }, {});
};

export const resolveFeatureFlags = (
  serverFlags?: Partial<AppFeatureFlags>,
): AppFeatureFlags => {
  const defaults = getDefaultFeatureFlags();
  const localOverrides = readLocalFeatureFlagOverrides();

  return {
    ...defaults,
    ...serverFlags,
    ...localOverrides,
  };
};

export const isFeatureFlagEnabled = (
  flags: AppFeatureFlags,
  key: AppFeatureFlagKey,
): boolean => {
  return Boolean(flags[key]);
};
