import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SupportedLocale = "en" | "vi";
export type StartPagePreference = "chat" | "feed" | "explore" | "saved";
export type TimestampStylePreference = "relative" | "absolute";
export type NotificationGroupingPreference = "auto" | "priority" | "time";
export type NotificationDensityPreference = "comfortable" | "compact";

export interface PersonalizationSnapshot {
  locale: SupportedLocale;
  startPagePreference: StartPagePreference;
  timestampStylePreference: TimestampStylePreference;
  notificationGroupingPreference: NotificationGroupingPreference;
  notificationDensityPreference: NotificationDensityPreference;
}

interface PersonalizationState extends PersonalizationSnapshot {
  hydrateFromProfile: (
    snapshot?: Partial<PersonalizationSnapshot> | null,
  ) => void;
  setLocale: (locale: SupportedLocale) => void;
  setStartPagePreference: (startPage: StartPagePreference) => void;
  setTimestampStylePreference: (style: TimestampStylePreference) => void;
  setNotificationGroupingPreference: (
    mode: NotificationGroupingPreference,
  ) => void;
  setNotificationDensityPreference: (
    density: NotificationDensityPreference,
  ) => void;
  applyDocumentSettings: () => void;
}

export const DEFAULT_PERSONALIZATION_SNAPSHOT: PersonalizationSnapshot = {
  locale: "en",
  startPagePreference: "chat",
  timestampStylePreference: "relative",
  notificationGroupingPreference: "auto",
  notificationDensityPreference: "comfortable",
};

const isSupportedLocale = (value: unknown): value is SupportedLocale =>
  value === "en" || value === "vi";

const isStartPagePreference = (value: unknown): value is StartPagePreference =>
  value === "chat" ||
  value === "feed" ||
  value === "explore" ||
  value === "saved";

const isTimestampStylePreference = (
  value: unknown,
): value is TimestampStylePreference => value === "relative" || value === "absolute";

const isNotificationGroupingPreference = (
  value: unknown,
): value is NotificationGroupingPreference =>
  value === "auto" || value === "priority" || value === "time";

const isNotificationDensityPreference = (
  value: unknown,
): value is NotificationDensityPreference =>
  value === "comfortable" || value === "compact";

const toSnapshot = (state: PersonalizationState): PersonalizationSnapshot => ({
  locale: state.locale,
  startPagePreference: state.startPagePreference,
  timestampStylePreference: state.timestampStylePreference,
  notificationGroupingPreference: state.notificationGroupingPreference,
  notificationDensityPreference: state.notificationDensityPreference,
});

export const normalizePersonalizationSnapshot = (
  value?: Partial<PersonalizationSnapshot>,
): PersonalizationSnapshot => ({
  locale: isSupportedLocale(value?.locale)
    ? value.locale
    : DEFAULT_PERSONALIZATION_SNAPSHOT.locale,
  startPagePreference: isStartPagePreference(value?.startPagePreference)
    ? value.startPagePreference
    : DEFAULT_PERSONALIZATION_SNAPSHOT.startPagePreference,
  timestampStylePreference: isTimestampStylePreference(
    value?.timestampStylePreference,
  )
    ? value.timestampStylePreference
    : DEFAULT_PERSONALIZATION_SNAPSHOT.timestampStylePreference,
  notificationGroupingPreference: isNotificationGroupingPreference(
    value?.notificationGroupingPreference,
  )
    ? value.notificationGroupingPreference
    : DEFAULT_PERSONALIZATION_SNAPSHOT.notificationGroupingPreference,
  notificationDensityPreference: isNotificationDensityPreference(
    value?.notificationDensityPreference,
  )
    ? value.notificationDensityPreference
    : DEFAULT_PERSONALIZATION_SNAPSHOT.notificationDensityPreference,
});

export const arePersonalizationSnapshotsEqual = (
  firstSnapshot: PersonalizationSnapshot,
  secondSnapshot: PersonalizationSnapshot,
) =>
  firstSnapshot.locale === secondSnapshot.locale &&
  firstSnapshot.startPagePreference === secondSnapshot.startPagePreference &&
  firstSnapshot.timestampStylePreference ===
    secondSnapshot.timestampStylePreference &&
  firstSnapshot.notificationGroupingPreference ===
    secondSnapshot.notificationGroupingPreference &&
  firstSnapshot.notificationDensityPreference ===
    secondSnapshot.notificationDensityPreference;

const applySnapshotToDocument = (snapshot: PersonalizationSnapshot) => {
  if (globalThis.window === undefined) {
    return;
  }

  const root = globalThis.window.document.documentElement;
  root.lang = snapshot.locale;
  root.dir = "ltr";
  root.dataset.notificationDensity = snapshot.notificationDensityPreference;
  root.dataset.timestampStyle = snapshot.timestampStylePreference;
};

export const usePersonalizationStore = create<PersonalizationState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PERSONALIZATION_SNAPSHOT,

      hydrateFromProfile: (snapshot) => {
        const normalizedSnapshot = normalizePersonalizationSnapshot(snapshot || undefined);
        const currentSnapshot = toSnapshot(get());

        if (arePersonalizationSnapshotsEqual(currentSnapshot, normalizedSnapshot)) {
          applySnapshotToDocument(currentSnapshot);
          return;
        }

        set(normalizedSnapshot);
        applySnapshotToDocument(normalizedSnapshot);
      },

      applyDocumentSettings: () => {
        applySnapshotToDocument(toSnapshot(get()));
      },

      setLocale: (locale) => {
        set({ locale });
        applySnapshotToDocument({ ...toSnapshot(get()), locale });
      },

      setStartPagePreference: (startPagePreference) => {
        set({ startPagePreference });
        applySnapshotToDocument({
          ...toSnapshot(get()),
          startPagePreference,
        });
      },

      setTimestampStylePreference: (timestampStylePreference) => {
        set({ timestampStylePreference });
        applySnapshotToDocument({
          ...toSnapshot(get()),
          timestampStylePreference,
        });
      },

      setNotificationGroupingPreference: (notificationGroupingPreference) => {
        set({ notificationGroupingPreference });
        applySnapshotToDocument({
          ...toSnapshot(get()),
          notificationGroupingPreference,
        });
      },

      setNotificationDensityPreference: (notificationDensityPreference) => {
        set({ notificationDensityPreference });
        applySnapshotToDocument({
          ...toSnapshot(get()),
          notificationDensityPreference,
        });
      },
    }),
    {
      name: "moji-personalization",
      version: 1,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") {
          return {
            ...DEFAULT_PERSONALIZATION_SNAPSHOT,
          } as PersonalizationState;
        }

        const nextSnapshot = normalizePersonalizationSnapshot(
          persistedState as Partial<PersonalizationSnapshot>,
        );

        return {
          ...nextSnapshot,
        } as PersonalizationState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }

        applySnapshotToDocument(toSnapshot(state));
      },
    },
  ),
);
