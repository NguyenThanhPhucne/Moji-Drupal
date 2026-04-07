import { memo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Sun, Moon, Monitor, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeStore, type AccentColor, type ThemeMode, type SidebarLayout } from "@/stores/useThemeStore";

interface AppearanceDrawerProps {
  open: boolean;
  onClose: () => void;
}

// ── Accent color palette ─────────────────────────────────────────────────────
const ACCENT_COLORS: Array<{
  id: AccentColor;
  label: string;
  style: string; // CSS gradient or color for the swatch
  isGradient?: boolean;
}> = [
  { id: "blue",    label: "Sky Blue",    style: "linear-gradient(135deg, hsl(204,89%,51%), hsl(206,100%,70%))" },
  { id: "violet",  label: "Violet",      style: "linear-gradient(135deg, hsl(262,80%,58%), hsl(280,75%,68%))" },
  { id: "rose",    label: "Rose",        style: "linear-gradient(135deg, hsl(346,84%,55%), hsl(15,90%,62%))" },
  { id: "emerald", label: "Emerald",     style: "linear-gradient(135deg, hsl(158,70%,40%), hsl(174,80%,50%))" },
  { id: "amber",   label: "Amber",       style: "linear-gradient(135deg, hsl(38,92%,50%), hsl(45,95%,55%))" },
  { id: "sunset",  label: "Sunset",      style: "linear-gradient(135deg, hsl(262,80%,58%), hsl(340,82%,60%))", isGradient: true },
  { id: "ocean",   label: "Ocean",       style: "linear-gradient(135deg, hsl(220,85%,55%), hsl(174,80%,45%))", isGradient: true },
  { id: "slate",   label: "Slate",       style: "linear-gradient(135deg, hsl(215,25%,45%), hsl(215,20%,55%))" },
];

// ── Layout preview thumbnails ────────────────────────────────────────────────
const LAYOUTS: Array<{ id: SidebarLayout; label: string }> = [
  { id: "full",    label: "Full" },
  { id: "compact", label: "Compact" },
];

const AppearanceDrawer = memo(function AppearanceDrawer({ open, onClose }: AppearanceDrawerProps) {
  const { themeMode, accentColor, sidebarLayout, setThemeMode, setAccentColor, setSidebarLayout } = useThemeStore();
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
                      "flex flex-col items-center gap-2 rounded-xl border px-2 py-3 transition-all duration-200 text-center",
                      active
                        ? "border-primary/70 bg-primary/8 text-primary ring-1 ring-primary/20"
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
                    className="group flex flex-col items-center gap-1.5"
                  >
                    <div
                      className={cn(
                        "relative size-11 rounded-full transition-all duration-200",
                        active
                          ? "ring-2 ring-offset-2 ring-offset-background scale-110 shadow-lg"
                          : "hover:scale-105 hover:shadow-md"
                      )}
                      style={{
                        background: color.style,
                        // ring-color matches the gradient's dominant color
                        ["--tw-ring-color" as string]: active ? "hsl(var(--primary))" : "transparent",
                      }}
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
                <div className="self-end max-w-[75%] px-3 py-2 rounded-[16px] rounded-br-[4px] text-[13px] font-medium"
                  style={{
                    background: "var(--gradient-chat)",
                    color: "hsl(var(--chat-bubble-sent-foreground, 0 0% 100%))"
                  }}>
                  Hey! How are you? 😊
                </div>
                <div className="self-start max-w-[75%] px-3 py-2 rounded-[16px] rounded-tl-[4px] text-[13px] bg-muted text-foreground/90">
                  I'm doing great, thanks!
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 3: Sidebar Layout ──────────────────────────────── */}
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
                        ? "border-primary/70 bg-primary/8 ring-1 ring-primary/20"
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
