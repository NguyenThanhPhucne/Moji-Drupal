import { useState } from "react";
import { Smile, X, Clock, Zap } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { userService } from "@/services/userService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const QUICK_EMOJIS = ["😊","🔥","🎉","💪","🤔","😴","🏖️","🎮","📚","🎵","☕","🚀","❤️","✅","⚠️","🔕","🤐","👻","🌙","🏃","🎯","💡","🌿","🙌"];

const SUGGESTED = [
  { emoji: "☕", text: "Grabbing coffee", clearId: "30m" },
  { emoji: "🎯", text: "In deep focus", clearId: "1h" },
  { emoji: "🏖️", text: "On vacation",    clearId: "week" },
  { emoji: "🤒", text: "Out sick",       clearId: "today" },
  { emoji: "🏠", text: "Working from home", clearId: "never" },
  { emoji: "📚", text: "In a meeting",   clearId: "1h" },
];

const CLEAR_OPTIONS: { id: string; label: string; minutes: number | null }[] = [
  { id: "never",  label: "Don't clear",  minutes: null  },
  { id: "30m",    label: "30 minutes",   minutes: 30    },
  { id: "1h",     label: "1 hour",       minutes: 60    },
  { id: "4h",     label: "4 hours",      minutes: 240   },
  { id: "today",  label: "Today",        minutes: null  },
  { id: "week",   label: "This week",    minutes: 10080 },
];

function getClearAt(optionId: string): string | null {
  if (optionId === "never") return null;
  const opt = CLEAR_OPTIONS.find(o => o.id === optionId);
  if (!opt) return null;
  if (optionId === "today") { const e = new Date(); e.setHours(23,59,59,0); return e.toISOString(); }
  if (opt.minutes) return new Date(Date.now() + opt.minutes * 60_000).toISOString();
  return null;
}

const StatusSettings = () => {
  const { user, setUser } = useAuthStore();
  const [emoji, setEmoji]       = useState(user?.statusEmoji ?? "");
  const [text, setText]         = useState(user?.statusText  ?? "");
  const [clearOpt, setClearOpt] = useState("never");
  const [saving, setSaving]     = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);

  const hasStatus = Boolean(user?.statusEmoji || user?.statusText);

  const applySuggested = (s: typeof SUGGESTED[0]) => {
    setEmoji(s.emoji); setText(s.text); setClearOpt(s.clearId);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { statusEmoji: emoji || undefined, statusText: text.trim() || undefined, statusClearAt: getClearAt(clearOpt) };
      const res = await userService.updateCustomStatus(payload).catch(() => null);
      if (user) setUser({ ...user, statusEmoji: emoji, statusText: text.trim() });
      if (res?.user && user) setUser({ ...user, ...res.user });
      toast.success("Status updated");
    } finally { setSaving(false); }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await userService.updateCustomStatus({ statusEmoji: "", statusText: "", statusClearAt: null }).catch(() => null);
      if (user) setUser({ ...user, statusEmoji: "", statusText: "" });
      setEmoji(""); setText("");
      toast.success("Status cleared");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {/* ── Set Status Card ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3 className="settings-card-title flex items-center gap-2">
            <Smile className="size-4 text-primary" /> Set a custom status
          </h3>
          <p className="settings-card-desc">Others will see your status next to your name in chats.</p>
        </div>
        <div className="settings-card-body divide-y divide-border/40">
          {/* Preview bar */}
          {(emoji || text) && (
            <div className="px-5 py-3 bg-muted/20">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1.5">Preview</p>
              <div className="settings-status-preview">
                {emoji && <span className="text-xl leading-none">{emoji}</span>}
                <span className="text-sm font-medium text-foreground truncate">
                  {text || <span className="text-muted-foreground italic">No text</span>}
                </span>
                {clearOpt !== "never" && (
                  <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
                    Clears {CLEAR_OPTIONS.find(o=>o.id===clearOpt)?.label.toLowerCase()}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Emoji + Text row */}
          <div className="settings-field flex gap-3 items-start">
            <div className="flex-shrink-0 pt-5">
              <button type="button" onClick={() => setShowEmojis(v => !v)}
                className={cn("settings-emoji-pick-btn", showEmojis && "ring-2 ring-primary/40")}
                aria-expanded={showEmojis} aria-label="Pick emoji">
                {emoji ? <span className="text-xl leading-none">{emoji}</span> : <Smile className="size-5 text-muted-foreground" />}
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <label className="settings-field-label" htmlFor="status-text">What's your status?</label>
              <div className="relative mt-1">
                <input id="status-text" type="text" value={text}
                  onChange={e => setText(e.target.value.slice(0, 60))}
                  placeholder="e.g. Out for lunch, In a meeting…"
                  className="settings-field-input pr-12" maxLength={60} />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/60 tabular-nums">{text.length}/60</span>
              </div>
              {emoji && (
                <button type="button" onClick={() => setEmoji("")}
                  className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                  <X className="size-3" /> Remove emoji
                </button>
              )}
            </div>
          </div>

          {/* Emoji grid */}
          {showEmojis && (
            <div className="settings-field pt-2">
              <div className="settings-emoji-grid animate-in fade-in slide-in-from-top-1 duration-150">
                {QUICK_EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => { setEmoji(e); setShowEmojis(false); }}
                    className={cn("settings-emoji-item", emoji === e && "settings-emoji-item--active")} aria-label={`Select ${e}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clear after */}
          <div className="settings-field">
            <label className="settings-field-label flex items-center gap-1">
              <Clock className="size-3.5" /> Clear after
            </label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CLEAR_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => setClearOpt(opt.id)}
                  className={cn("settings-sound-chip", clearOpt === opt.id && "settings-sound-chip--active")}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="settings-field">
            <div className="settings-field-actions">
              {hasStatus && (
                <button type="button" onClick={handleClear} disabled={saving}
                  className="settings-field-btn settings-field-btn--cancel">
                  <X className="size-3.5" /> Clear status
                </button>
              )}
              <button type="button" onClick={handleSave} disabled={saving || (!emoji && !text.trim())}
                className="settings-field-btn settings-field-btn--save">
                {saving ? "Saving…" : "Set status"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Suggested Statuses ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3 className="settings-card-title flex items-center gap-2">
            <Zap className="size-4 text-primary" /> Suggested statuses
          </h3>
          <p className="settings-card-desc">Click any suggestion to instantly apply it.</p>
        </div>
        <div className="settings-card-body divide-y divide-border/40">
          {SUGGESTED.map(s => (
            <button key={s.text} type="button" onClick={() => applySuggested(s)}
              className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/30 transition-colors group">
              <span className="text-2xl leading-none">{s.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{s.text}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Clears {CLEAR_OPTIONS.find(o => o.id === s.clearId)?.label.toLowerCase()}
                </p>
              </div>
              <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium">Apply →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StatusSettings;
