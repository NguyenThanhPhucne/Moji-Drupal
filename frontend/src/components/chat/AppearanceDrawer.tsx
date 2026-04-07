import { memo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Sun, Moon, Monitor, Check, Rabbit, Waves, Type, MessageCircleMore, Grid2x2, Rows3, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useThemeStore,
  type AccentColor,
  type ThemeMode,
  type SidebarLayout,
  type BubbleStyle,
  type ChatDensity,
  type MessageTextSize,
  type MotionPreference,
  type RememberMode,
} from "@/stores/useThemeStore";

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

const DENSITY_OPTIONS: Array<{ id: ChatDensity; label: string; icon: typeof Rows3 }> = [
  { id: "comfortable", label: "Comfortable", icon: Rows3 },
  { id: "compact", label: "Compact", icon: Grid2x2 },
];

const MOTION_OPTIONS: Array<{ id: MotionPreference; label: string; icon: typeof Rabbit }> = [
  { id: "smooth", label: "Smooth", icon: Rabbit },
  { id: "reduced", label: "Reduced", icon: Waves },
  { id: "system", label: "System", icon: Monitor },
];

const MESSAGE_SIZE_OPTIONS: Array<{ id: MessageTextSize; label: string }> = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Large" },
];

const BUBBLE_STYLE_OPTIONS: Array<{ id: BubbleStyle; label: string; description: string }> = [
  { id: "modern", label: "Modern", description: "Soft radius with subtle depth" },
  { id: "classic", label: "Classic", description: "Cleaner shape with flatter bubbles" },
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
  };
}> = [
  {
    id: "deep-work",
    label: "Deep Work",
    description: "Compact layout with lower motion for focus",
    config: { density: "compact", motion: "reduced", textSize: "sm", bubbleStyle: "classic" },
  },
  {
    id: "accessibility-first",
    label: "Accessibility First",
    description: "Large text, calmer motion, clearer bubble shape",
    config: { density: "comfortable", motion: "reduced", textSize: "lg", bubbleStyle: "classic" },
  },
  {
    id: "night-reader",
    label: "Night Reader",
    description: "Relaxed spacing with smooth readable rhythm",
    config: { density: "comfortable", motion: "smooth", textSize: "md", bubbleStyle: "modern" },
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

const AppearanceDrawer = memo(function AppearanceDrawer({ open, onClose }: AppearanceDrawerProps) {
  const {
    themeMode,
    accentColor,
    sidebarLayout,
    chatDensity,
    motionPreference,
    messageTextSize,
    bubbleStyle,
    rememberMode,
    setThemeMode,
    setAccentColor,
    setSidebarLayout,
    setChatDensity,
    setMotionPreference,
    setMessageTextSize,
    setBubbleStyle,
    setRememberMode,
    resetAppearance,
  } = useThemeStore();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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
  };

  const activePresetId =
    APPEARANCE_PRESETS.find(
      (preset) =>
        preset.config.density === chatDensity &&
        preset.config.motion === motionPreference &&
        preset.config.textSize === messageTextSize &&
        preset.config.bubbleStyle === bubbleStyle,
    )?.id ?? null;

  return createPortal(
    <>
      {/* ── Backdrop ────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-[998] bg-black/25 backdrop-blur-[2px] transition-all duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* ── Drawer panel ────────────────────────────────────────────────── */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
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
            <h2 className="text-[15px] font-semibold text-foreground tracking-tight">Appearance</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">Customize your Moji experience</p>
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
              {(["light", "dark", "system"] as ThemeMode[]).map((mode) => {
                const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
                const labels = { light: "Light", dark: "Dark", system: "System" };
                const active = themeMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setThemeMode(mode)}
                    className={cn(
                      "appearance-drawer-btn flex flex-col items-center gap-2 rounded-xl border px-2 py-3 transition-all duration-200 text-center",
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
                    <span className="text-[12px] font-medium leading-none">{labels[mode]}</span>
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
                    "appearance-drawer-btn appearance-preset-card w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
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
                      "appearance-drawer-btn w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
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
                        "relative size-11 rounded-full transition-all duration-200",
                        color.swatchClass,
                        active
                          ? "shadow-lg scale-110 outline outline-2 outline-offset-2 outline-primary"
                          : "hover:scale-105 hover:shadow-md"
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
                    Hey! How are you? 😊
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
                      "appearance-drawer-btn flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 transition-all duration-200",
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
                      "appearance-drawer-btn flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 transition-all duration-200",
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
                      "appearance-drawer-btn rounded-xl border px-2 py-2.5 transition-all duration-200",
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
                      "appearance-drawer-btn flex items-start gap-2.5 rounded-xl border px-3 py-3 text-left transition-all duration-200",
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
                      "flex flex-col items-center gap-2.5 rounded-xl border p-3 transition-all duration-200",
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
            Changes apply instantly & are saved automatically
          </p>
        </div>
      </div>
    </>,
    document.body
  );
});

export default AppearanceDrawer;
