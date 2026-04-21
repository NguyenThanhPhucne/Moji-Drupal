import { memo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Sun, Moon, Monitor, Check, Rabbit, Waves, Type, MessageCircleMore, Grid2x2, Rows3, AlignJustify, RotateCcw, Globe, House, Clock3, ListFilter, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useThemeStore,
  type AccentColor,
  type ThemeMode,
  type SidebarLayout,
  type BubbleStyle,
  type PanelStyle,
  type ChatDensity,
  type MessageTextSize,
  type MotionPreference,
  type RememberMode,
} from "@/stores/useThemeStore";
import {
  usePersonalizationStore,
  type NotificationDensityPreference,
  type NotificationGroupingPreference,
  type StartPagePreference,
  type SupportedLocale,
  type TimestampStylePreference,
} from "@/stores/usePersonalizationStore";
import { useI18n, type TranslationKey } from "@/lib/i18n";

interface AppearanceDrawerProps {
  open: boolean;
  onClose: () => void;
}

// ── Accent color palette ─────────────────────────────────────────────────────
const ACCENT_COLORS: Array<{
  id: AccentColor;
  label: string;
  swatchClass: string;
  isGradient?: boolean;
}> = [
  { id: "blue",    label: "Sky Blue",    swatchClass: "appearance-swatch-blue" },
  { id: "violet",  label: "Violet",      swatchClass: "appearance-swatch-violet" },
  { id: "rose",    label: "Rose",        swatchClass: "appearance-swatch-rose" },
  { id: "emerald", label: "Emerald",     swatchClass: "appearance-swatch-emerald" },
  { id: "amber",   label: "Amber",       swatchClass: "appearance-swatch-amber" },
  { id: "sunset",  label: "Sunset",      swatchClass: "appearance-swatch-sunset", isGradient: true },
  { id: "ocean",   label: "Ocean",       swatchClass: "appearance-swatch-ocean", isGradient: true },
  { id: "slate",   label: "Slate",       swatchClass: "appearance-swatch-slate" },
];

// ── Layout preview thumbnails ────────────────────────────────────────────────
const LAYOUTS: Array<{ id: SidebarLayout; label: string }> = [
  { id: "full",    label: "Full" },
  { id: "compact", label: "Compact" },
];

const DENSITY_OPTIONS: Array<{ id: ChatDensity; label: string; icon: LucideIcon }> = [
  { id: "comfortable", label: "Comfortable", icon: Rows3 },
  { id: "compact", label: "Compact", icon: Grid2x2 },
  { id: "dense", label: "Dense desktop", icon: AlignJustify },
];

const MOTION_OPTIONS: Array<{ id: MotionPreference; label: string; icon: typeof Rabbit }> = [
  { id: "smooth", label: "Smooth", icon: Rabbit },
  { id: "reduced", label: "Reduced", icon: Waves },
  { id: "system", label: "System", icon: Monitor },
];

const THEME_MODE_OPTIONS: Array<{ id: ThemeMode; label: string; icon: typeof Sun }> = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

const MESSAGE_SIZE_OPTIONS: Array<{ id: MessageTextSize; label: string }> = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Large" },
];

const BUBBLE_STYLE_OPTIONS: Array<{ id: BubbleStyle; label: string; description: string }> = [
  { id: "modern", label: "Premium glossy", description: "Soft premium depth and polished highlights" },
  { id: "classic", label: "Corporate neutral", description: "Minimal, flatter surfaces for enterprise clarity" },
  { id: "ultra-flat", label: "Ultra-flat (Teams)", description: "Flat tone + border only, no gradient and no gloss" },
];

const PANEL_STYLE_OPTIONS: Array<{ id: PanelStyle; label: string; description: string; icon: LucideIcon }> = [
  {
    id: "soft-glass",
    label: "Soft Glass",
    description: "Subtle depth, blur and premium lighting",
    icon: Rows3,
  },
  {
    id: "flat-enterprise",
    label: "Flat Enterprise",
    description: "Flatter, cleaner shell with restrained contrast",
    icon: Grid2x2,
  },
  {
    id: "flat-enterprise-ultra",
    label: "Flat Enterprise Ultra",
    description: "Max-flat QA variant: tighter radius, stronger border, near-zero shadow",
    icon: AlignJustify,
  },
];

const APPEARANCE_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  config: {
    density: ChatDensity;
    motion: MotionPreference;
    textSize: MessageTextSize;
    bubbleStyle: BubbleStyle;
    panelStyle: PanelStyle;
  };
}> = [
  {
    id: "corporate-neutral",
    label: "Corporate neutral",
    description: "Slack/Teams-style clean surfaces and restrained contrast",
    config: {
      density: "comfortable",
      motion: "reduced",
      textSize: "md",
      bubbleStyle: "classic",
      panelStyle: "flat-enterprise",
    },
  },
  {
    id: "premium-glossy",
    label: "Premium glossy",
    description: "Premium depth with subtle shine, without over-styling",
    config: {
      density: "comfortable",
      motion: "smooth",
      textSize: "md",
      bubbleStyle: "modern",
      panelStyle: "soft-glass",
    },
  },
  {
    id: "dense-desktop",
    label: "Dense desktop",
    description: "Tighter spacing for high-throughput desktop workflows",
    config: {
      density: "dense",
      motion: "reduced",
      textSize: "sm",
      bubbleStyle: "classic",
      panelStyle: "flat-enterprise",
    },
  },
  {
    id: "ultra-flat-teams",
    label: "Ultra-flat Teams",
    description: "Pure flat bubbles with border-tone contrast only",
    config: {
      density: "comfortable",
      motion: "reduced",
      textSize: "md",
      bubbleStyle: "ultra-flat",
      panelStyle: "flat-enterprise",
    },
  },
  {
    id: "flat-enterprise-ultra",
    label: "Flat Enterprise Ultra",
    description: "QA panel variant for strict flat visual checks",
    config: {
      density: "comfortable",
      motion: "reduced",
      textSize: "md",
      bubbleStyle: "ultra-flat",
      panelStyle: "flat-enterprise-ultra",
    },
  },
];

const REMEMBER_OPTIONS: Array<{
  id: RememberMode;
  label: string;
  description: string;
}> = [
  {
    id: "device",
    label: "Remember on this device",
    description: "Same appearance for all accounts on this browser",
  },
  {
    id: "profile",
    label: "Remember per profile",
    description: "Each account keeps its own appearance setup",
  },
];

const LANGUAGE_OPTIONS: Array<{
  id: SupportedLocale;
  labelKey: TranslationKey;
  icon: LucideIcon;
}> = [
  { id: "en", labelKey: "personalization.lang.en", icon: Globe },
  { id: "vi", labelKey: "personalization.lang.vi", icon: Globe },
];

const START_PAGE_OPTIONS: Array<{
  id: StartPagePreference;
  labelKey: TranslationKey;
  icon: LucideIcon;
}> = [
  { id: "chat", labelKey: "personalization.start_page.chat", icon: House },
  { id: "feed", labelKey: "personalization.start_page.feed", icon: Rows3 },
  {
    id: "explore",
    labelKey: "personalization.start_page.explore",
    icon: Grid2x2,
  },
  {
    id: "saved",
    labelKey: "personalization.start_page.saved",
    icon: MessageCircleMore,
  },
];

const TIMESTAMP_STYLE_OPTIONS: Array<{
  id: TimestampStylePreference;
  labelKey: TranslationKey;
  icon: LucideIcon;
}> = [
  {
    id: "relative",
    labelKey: "personalization.timestamp.relative",
    icon: Clock3,
  },
  {
    id: "absolute",
    labelKey: "personalization.timestamp.absolute",
    icon: Clock3,
  },
];

const NOTIFICATION_GROUPING_OPTIONS: Array<{
  id: NotificationGroupingPreference;
  labelKey: TranslationKey;
  icon: LucideIcon;
}> = [
  {
    id: "auto",
    labelKey: "personalization.grouping.auto",
    icon: ListFilter,
  },
  {
    id: "priority",
    labelKey: "personalization.grouping.priority",
    icon: ListFilter,
  },
  {
    id: "time",
    labelKey: "personalization.grouping.time",
    icon: ListFilter,
  },
];

const NOTIFICATION_DENSITY_OPTIONS: Array<{
  id: NotificationDensityPreference;
  labelKey: TranslationKey;
  icon: LucideIcon;
}> = [
  {
    id: "comfortable",
    labelKey: "personalization.density.comfortable",
    icon: Rows3,
  },
  {
    id: "compact",
    labelKey: "personalization.density.compact",
    icon: Grid2x2,
  },
];

const AppearanceDrawer = memo(function AppearanceDrawer({ open, onClose }: AppearanceDrawerProps) {
  const { t } = useI18n();
  const {
    themeMode,
    accentColor,
    sidebarLayout,
    chatDensity,
    motionPreference,
    messageTextSize,
    bubbleStyle,
    panelStyle,
    rememberMode,
    setThemeMode,
    setAccentColor,
    setSidebarLayout,
    setChatDensity,
    setMotionPreference,
    setMessageTextSize,
    setBubbleStyle,
    setPanelStyle,
    setRememberMode,
    resetAppearance,
  } = useThemeStore();
  const {
    locale,
    startPagePreference,
    timestampStylePreference,
    notificationGroupingPreference,
    notificationDensityPreference,
    setLocale,
    setStartPagePreference,
    setTimestampStylePreference,
    setNotificationGroupingPreference,
    setNotificationDensityPreference,
  } = usePersonalizationStore();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Trap focus inside panel
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const applyPreset = (presetId: string) => {
    const selectedPreset = APPEARANCE_PRESETS.find((preset) => preset.id === presetId);
    if (!selectedPreset) {
      return;
    }

    setChatDensity(selectedPreset.config.density);
    setMotionPreference(selectedPreset.config.motion);
    setMessageTextSize(selectedPreset.config.textSize);
    setBubbleStyle(selectedPreset.config.bubbleStyle);
    setPanelStyle(selectedPreset.config.panelStyle);
  };

  const activePresetId =
    APPEARANCE_PRESETS.find(
      (preset) =>
        preset.config.density === chatDensity &&
        preset.config.motion === motionPreference &&
        preset.config.textSize === messageTextSize &&
        preset.config.bubbleStyle === bubbleStyle &&
        preset.config.panelStyle === panelStyle,
    )?.id ?? null;

  return createPortal(
    <>
      {/* ── Backdrop ────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-[998] bg-black/25 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* ── Drawer panel ────────────────────────────────────────────────── */}
      <div
        ref={panelRef}
        aria-label="Appearance settings"
        tabIndex={-1}
        className={cn(
          "fixed right-0 top-0 bottom-0 z-[999] w-80 bg-background border-l border-border/60",
          "flex flex-col shadow-2xl outline-none",
          "transition-transform duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground tracking-tight">{t("appearance.title")}</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">{t("appearance.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
            aria-label="Close appearance panel"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto beautiful-scrollbar px-5 py-5 space-y-7">

          {/* ── Section 1: Theme Mode ──────────────────────────────────── */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              Color mode
            </p>
            <div className="grid grid-cols-3 gap-2">
              {THEME_MODE_OPTIONS.map(({ id, label, icon: Icon }) => {
                const active = themeMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setThemeMode(id)}
                    className={cn(
                      "appearance-drawer-btn flex flex-col items-center gap-2 rounded-xl border px-2 py-3 transition-[background-color,border-color,color,box-shadow] duration-200 text-center",
                      active
                        ? "border-primary/60 bg-primary/10 text-primary ring-1 ring-primary/20"
                        : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-border"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center size-8 rounded-lg transition-colors",
                      active ? "bg-primary/15" : "bg-muted/60"
                    )}>
                      <Icon className="size-4" />
                    </div>
                    <span className="text-[12px] font-medium leading-none">{label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              Quick presets
            </p>
            <div className="space-y-2">
              {APPEARANCE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  aria-current={activePresetId === preset.id ? "true" : undefined}
                  className={cn(
                    "appearance-drawer-btn appearance-preset-card w-full rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,color,box-shadow] duration-200",
                    activePresetId === preset.id
                      ? "border-primary/60 bg-primary/10 ring-1 ring-primary/20"
                      : "border-border/60 bg-muted/20 hover:bg-muted/50 hover:border-border",
                  )}
                  data-active={activePresetId === preset.id ? "true" : "false"}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("text-[12px] font-semibold", activePresetId === preset.id ? "text-primary" : "text-foreground")}>{preset.label}</p>
                    {activePresetId === preset.id && (
                      <span className="appearance-preset-active-pill">
                        <Check className="size-3" />
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{preset.description}</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              Preferences memory
            </p>
            <div className="space-y-2.5">
              {REMEMBER_OPTIONS.map((option) => {
                const active = rememberMode === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setRememberMode(option.id)}
                    className={cn(
                      "appearance-drawer-btn w-full rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,color,box-shadow] duration-200",
                      active
                        ? "border-primary/60 bg-primary/10 ring-1 ring-primary/20"
                        : "border-border/60 bg-muted/20 hover:bg-muted/50",
                    )}
                  >
                    <p className={cn("text-[12px] font-semibold", active ? "text-primary" : "text-foreground")}>{option.label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{option.description}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              {t("personalization.section_title")}
            </p>

            <div className="space-y-3">
              <div>
                <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                  {t("personalization.language")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {LANGUAGE_OPTIONS.map((languageOption) => {
                    const active = locale === languageOption.id;
                    const Icon = languageOption.icon;

                    return (
                      <button
                        key={languageOption.id}
                        type="button"
                        onClick={() => setLocale(languageOption.id)}
                        className={cn(
                          "appearance-drawer-btn flex items-center justify-center gap-2 rounded-xl border px-3 py-2 transition-[background-color,border-color,color,box-shadow] duration-200",
                          active
                            ? "border-primary/60 bg-primary/10 text-primary ring-1 ring-primary/20"
                            : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                        <span className="text-[12px] font-medium">
                          {t(languageOption.labelKey)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                  {t("personalization.start_page")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {START_PAGE_OPTIONS.map((startPageOption) => {
                    const active = startPagePreference === startPageOption.id;
                    const Icon = startPageOption.icon;

                    return (
                      <button
                        key={startPageOption.id}
                        type="button"
                        onClick={() => setStartPagePreference(startPageOption.id)}
                        className={cn(
                          "appearance-drawer-btn flex items-center justify-center gap-2 rounded-xl border px-3 py-2 transition-[background-color,border-color,color,box-shadow] duration-200",
                          active
                            ? "border-primary/60 bg-primary/10 text-primary ring-1 ring-primary/20"
                            : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                        <span className="text-[12px] font-medium">
                          {t(startPageOption.labelKey)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                  {t("personalization.timestamp_style")}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {TIMESTAMP_STYLE_OPTIONS.map((timestampOption) => {
                    const active = timestampStylePreference === timestampOption.id;
                    const Icon = timestampOption.icon;

                    return (
                      <button
                        key={timestampOption.id}
                        type="button"
                        onClick={() =>
                          setTimestampStylePreference(timestampOption.id)
                        }
                        className={cn(
                          "appearance-drawer-btn flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-[background-color,border-color,color,box-shadow] duration-200",
                          active
                            ? "border-primary/60 bg-primary/10 text-primary ring-1 ring-primary/20"
                            : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                        <span className="text-[12px] font-medium">
                          {t(timestampOption.labelKey)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                  {t("personalization.notification_grouping")}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {NOTIFICATION_GROUPING_OPTIONS.map((groupingOption) => {
                    const active =
                      notificationGroupingPreference === groupingOption.id;
                    const Icon = groupingOption.icon;

                    return (
                      <button
                        key={groupingOption.id}
                        type="button"
                        onClick={() =>
                          setNotificationGroupingPreference(groupingOption.id)
                        }
                        className={cn(
                          "appearance-drawer-btn flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-[background-color,border-color,color,box-shadow] duration-200",
                          active
                            ? "border-primary/60 bg-primary/10 text-primary ring-1 ring-primary/20"
                            : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                        <span className="text-[12px] font-medium">
                          {t(groupingOption.labelKey)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                  {t("personalization.notification_density")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {NOTIFICATION_DENSITY_OPTIONS.map((densityOption) => {
                    const active =
                      notificationDensityPreference === densityOption.id;
                    const Icon = densityOption.icon;

                    return (
                      <button
                        key={densityOption.id}
                        type="button"
                        onClick={() =>
                          setNotificationDensityPreference(densityOption.id)
                        }
                        className={cn(
                          "appearance-drawer-btn flex items-center justify-center gap-2 rounded-xl border px-3 py-2 transition-[background-color,border-color,color,box-shadow] duration-200",
                          active
                            ? "border-primary/60 bg-primary/10 text-primary ring-1 ring-primary/20"
                            : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                        <span className="text-[12px] font-medium">
                          {t(densityOption.labelKey)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 2: Accent Color ────────────────────────────────── */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              Accent color
            </p>
            <div className="grid grid-cols-4 gap-3">
              {ACCENT_COLORS.map((color) => {
                const active = accentColor === color.id;
                return (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => setAccentColor(color.id)}
                    title={color.label}
                    className="appearance-drawer-btn group flex flex-col items-center gap-1.5"
                  >
                    <div
                      className={cn(
                        "relative size-11 rounded-full transition-[box-shadow,outline-color,opacity] duration-200",
                        color.swatchClass,
                        active
                          ? "shadow-lg outline-2 outline-offset-2 outline-primary"
                          : "hover:shadow-sm"
                      )}
                    >
                      {active && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Check className="size-4 text-white drop-shadow-sm" strokeWidth={2.5} />
                        </span>
                      )}
                    </div>
                    <span className={cn(
                      "text-[10px] leading-none transition-colors",
                      active ? "text-primary font-semibold" : "text-muted-foreground"
                    )}>
                      {color.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Preview bubble */}
            <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground mb-2 font-medium">Preview</p>
              <div className="flex flex-col gap-1.5">
                <div className="chat-message-row flex justify-end p-0">
                  <div className="chat-bubble-shell chat-bubble-sent chat-bubble-shape-sent max-w-[75%] text-[13px] font-medium">
                    Hey! How are you?
                  </div>
                </div>
                <div className="chat-message-row flex justify-start p-0">
                  <div className="chat-bubble-shell chat-bubble-received chat-bubble-shape-received max-w-[75%] text-[13px]">
                    I'm doing great, thanks!
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 3: Sidebar Layout ──────────────────────────────── */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              Chat density
            </p>
            <div className="grid grid-cols-2 gap-3">
              {DENSITY_OPTIONS.map((densityOption) => {
                const active = chatDensity === densityOption.id;
                const Icon = densityOption.icon;

                return (
                  <button
                    key={densityOption.id}
                    type="button"
                    onClick={() => setChatDensity(densityOption.id)}
                    className={cn(
                      "appearance-drawer-btn flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 transition-[background-color,border-color,color,box-shadow] duration-200",
                      active
                        ? "border-primary/60 bg-primary/10 text-primary ring-1 ring-primary/20"
                        : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="text-[12px] font-medium">{densityOption.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              Motion
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {MOTION_OPTIONS.map((motionOption) => {
                const active = motionPreference === motionOption.id;
                const Icon = motionOption.icon;

                return (
                  <button
                    key={motionOption.id}
                    type="button"
                    onClick={() => setMotionPreference(motionOption.id)}
                    className={cn(
                      "appearance-drawer-btn flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 transition-[background-color,border-color,color,box-shadow] duration-200",
                      active
                        ? "border-primary/60 bg-primary/10 text-primary ring-1 ring-primary/20"
                        : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="text-[11px] font-medium leading-none">{motionOption.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              Message text size
            </p>
            <div className="grid grid-cols-3 gap-2">
              {MESSAGE_SIZE_OPTIONS.map((sizeOption) => {
                const active = messageTextSize === sizeOption.id;

                return (
                  <button
                    key={sizeOption.id}
                    type="button"
                    onClick={() => setMessageTextSize(sizeOption.id)}
                    className={cn(
                      "appearance-drawer-btn rounded-xl border px-2 py-2.5 transition-[background-color,border-color,color,box-shadow] duration-200",
                      active
                        ? "border-primary/60 bg-primary/10 text-primary ring-1 ring-primary/20"
                        : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <span className="inline-flex items-center justify-center gap-1 text-[12px] font-medium">
                      <Type className="size-3.5" />
                      {sizeOption.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              Bubble style
            </p>
            <div className="grid grid-cols-1 gap-2.5">
              {BUBBLE_STYLE_OPTIONS.map((styleOption) => {
                const active = bubbleStyle === styleOption.id;

                return (
                  <button
                    key={styleOption.id}
                    type="button"
                    onClick={() => setBubbleStyle(styleOption.id)}
                    className={cn(
                      "appearance-drawer-btn flex items-start gap-2.5 rounded-xl border px-3 py-3 text-left transition-[background-color,border-color,color,box-shadow] duration-200",
                      active
                        ? "border-primary/60 bg-primary/10 ring-1 ring-primary/20"
                        : "border-border/60 bg-muted/20 hover:bg-muted/50"
                    )}
                  >
                    <MessageCircleMore className={cn("mt-0.5 size-4", active ? "text-primary" : "text-muted-foreground")} />
                    <div className="space-y-1">
                      <p className={cn("text-[12px] font-semibold", active ? "text-primary" : "text-foreground")}>{styleOption.label}</p>
                      <p className="text-[11px] text-muted-foreground">{styleOption.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              Panel shell
            </p>
            <div className="grid grid-cols-1 gap-2.5">
              {PANEL_STYLE_OPTIONS.map((styleOption) => {
                const active = panelStyle === styleOption.id;
                const Icon = styleOption.icon;

                return (
                  <button
                    key={styleOption.id}
                    type="button"
                    onClick={() => setPanelStyle(styleOption.id)}
                    className={cn(
                      "appearance-drawer-btn flex items-start gap-2.5 rounded-xl border px-3 py-3 text-left transition-[background-color,border-color,color,box-shadow] duration-200",
                      active
                        ? "border-primary/60 bg-primary/10 ring-1 ring-primary/20"
                        : "border-border/60 bg-muted/20 hover:bg-muted/50"
                    )}
                  >
                    <Icon className={cn("mt-0.5 size-4", active ? "text-primary" : "text-muted-foreground")} />
                    <div className="space-y-1">
                      <p className={cn("text-[12px] font-semibold", active ? "text-primary" : "text-foreground")}>{styleOption.label}</p>
                      <p className="text-[11px] text-muted-foreground">{styleOption.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Live preview
              </p>
              <button
                type="button"
                onClick={resetAppearance}
                className="appearance-drawer-btn inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
                Reset to default
              </button>
            </div>

            <div className="appearance-drawer-note rounded-xl p-3">
              <div className="mb-2 flex items-center justify-between rounded-lg border border-border/60 bg-background/80 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <div className="size-6 rounded-full bg-muted" />
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">Product Team</p>
                    <p className="text-[10px] text-muted-foreground">Active now</p>
                  </div>
                </div>
                <div className="size-6 rounded-md bg-muted/70" />
              </div>

              <div className="space-y-1.5">
                <div className="chat-message-row flex justify-start">
                  <div className="chat-bubble-shell chat-bubble-received chat-bubble-shape-received max-w-[75%]">
                    Can we review this release plan?
                  </div>
                </div>
                <div className="chat-message-row flex justify-end">
                  <div className="chat-bubble-shell chat-bubble-sent chat-bubble-shape-sent max-w-[75%]">
                    Sure, I just polished the final UI pass.
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-end gap-2">
                <button type="button" className="chat-modal-btn chat-modal-btn--secondary px-3 py-1.5 text-[11px]">
                  Cancel
                </button>
                <button type="button" className="chat-modal-btn chat-modal-btn--danger px-3 py-1.5 text-[11px]">
                  Delete
                </button>
              </div>
            </div>
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              Sidebar layout
            </p>
            <div className="grid grid-cols-2 gap-3">
              {LAYOUTS.map((layout) => {
                const active = sidebarLayout === layout.id;
                return (
                  <button
                    key={layout.id}
                    type="button"
                    onClick={() => setSidebarLayout(layout.id)}
                    className={cn(
                      "flex flex-col items-center gap-2.5 rounded-xl border p-3 transition-[background-color,border-color,color,box-shadow] duration-200",
                      active
                        ? "border-primary/60 bg-primary/10 ring-1 ring-primary/20"
                        : "border-border/60 bg-muted/20 hover:bg-muted/50 hover:border-border"
                    )}
                  >
                    {/* Wireframe thumbnail */}
                    <div className="w-full aspect-[3/2] rounded-lg overflow-hidden border border-border/40 bg-background flex gap-1 p-1.5">
                      {/* Sidebar mockup */}
                      <div className={cn(
                        "flex flex-col gap-1 flex-shrink-0 rounded-md",
                        layout.id === "full"
                          ? "w-[40%] bg-muted/60"
                          : "w-[20%] bg-muted/60"
                      )}>
                        <div className="h-2 rounded w-full bg-primary/40 mx-auto" />
                        {layout.id === "full" ? (
                          <>
                            <div className="h-1.5 rounded w-4/5 bg-muted-foreground/20" />
                            <div className="h-1.5 rounded w-3/5 bg-muted-foreground/20" />
                            <div className="h-1.5 rounded w-4/5 bg-muted-foreground/20" />
                          </>
                        ) : (
                          <>
                            <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20 mx-auto" />
                            <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20 mx-auto" />
                          </>
                        )}
                      </div>

                      {/* Chat area mockup */}
                      <div className="flex-1 flex flex-col gap-1 justify-end">
                        <div className="h-1.5 rounded w-3/5 bg-primary/30 self-end" />
                        <div className="h-1.5 rounded w-4/5 bg-muted-foreground/20 self-start" />
                        <div className="h-1.5 rounded w-2/5 bg-muted-foreground/20 self-start" />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className={cn(
                        "size-3.5 rounded-full border-[1.5px] transition-colors flex items-center justify-center",
                        active ? "border-primary bg-primary" : "border-muted-foreground/40"
                      )}>
                        {active && <div className="size-1.5 rounded-full bg-white" />}
                      </div>
                      <span className={cn(
                        "text-[12px] font-medium transition-colors",
                        active ? "text-primary" : "text-muted-foreground"
                      )}>
                        {layout.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/60">
          <p className="text-[11px] text-center text-muted-foreground/60">
            {t("appearance.save_hint")}
          </p>
        </div>
      </div>
    </>,
    document.body
  );
});

export default AppearanceDrawer;
