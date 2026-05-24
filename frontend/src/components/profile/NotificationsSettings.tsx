import { useState, useEffect } from "react";
import { Bell, Moon, Volume2, VolumeX } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/useAuthStore";
import { userService } from "@/services/userService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ─── Quiet hours stored in localStorage ───────────────────────────────── */
const QH_KEY = "moji:quiet_hours";
interface QuietHours { enabled: boolean; from: string; to: string }
const defaultQH: QuietHours = { enabled: false, from: "22:00", to: "08:00" };
function loadQH(): QuietHours {
  try { return JSON.parse(localStorage.getItem(QH_KEY) ?? "null") ?? defaultQH; }
  catch { return defaultQH; }
}
function saveQH(qh: QuietHours) { localStorage.setItem(QH_KEY, JSON.stringify(qh)); }

/* ─── Notification sound stored in localStorage ─────────────────────────── */
const SOUND_KEY = "moji:notification_sound";
type NotifSound = "default" | "ding" | "chime" | "none";
const SOUND_OPTIONS: { id: NotifSound; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "ding",    label: "Ding"    },
  { id: "chime",   label: "Chime"   },
  { id: "none",    label: "None"    },
];
function loadSound(): NotifSound {
  return (localStorage.getItem(SOUND_KEY) as NotifSound) ?? "default";
}

const NotificationsSettings = () => {
  const { user, setUser } = useAuthStore();
  const prefs = user?.notificationPreferences ?? { message: true, sound: true, desktop: false };
  const [savingKey, setSavingKey] = useState<"message" | "sound" | "desktop" | null>(null);

  const [qh, setQhState] = useState<QuietHours>(defaultQH);
  useEffect(() => { setQhState(loadQH()); }, []);
  const updateQH = (patch: Partial<QuietHours>) => {
    const next = { ...qh, ...patch };
    setQhState(next);
    saveQH(next);
  };

  const [sound, setSoundState] = useState<NotifSound>("default");
  useEffect(() => { setSoundState(loadSound()); }, []);
  const updateSound = (s: NotifSound) => {
    setSoundState(s);
    localStorage.setItem(SOUND_KEY, s);
  };
  const previewSound = () => {
    if (sound === "none") { toast("🔇 Sounds are muted"); return; }
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = sound === "chime" ? "sine" : "triangle";
      osc.frequency.value = sound === "chime" ? 880 : 660;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch { toast("Could not preview sound"); }
  };

  const updatePref = async (key: "message" | "sound" | "desktop", value: boolean) => {
    if (!user) return;
    const prev = prefs;
    const next = { ...prev, [key]: value };
    setUser({ ...user, notificationPreferences: next });
    try {
      setSavingKey(key);
      const res = await userService.updateNotificationPreferences(next);
      if (res?.user) setUser(res.user);
    } catch {
      setUser({ ...user, notificationPreferences: prev });
      toast.error("Could not update notification preferences");
    } finally { setSavingKey(null); }
  };

  const toggleRows: { id: string; key: "message" | "sound" | "desktop"; label: string; sub: string; val: boolean }[] = [
    { id: "notif-msg",     key: "message", label: "Message notifications", sub: "Get notified when you receive new messages", val: prefs.message },
    { id: "notif-sound",   key: "sound",   label: "Notification sounds",   sub: "Play a sound when messages arrive",          val: prefs.sound   },
    { id: "notif-desktop", key: "desktop", label: "Desktop notifications", sub: "Show native desktop push notifications",     val: prefs.desktop },
  ];

  return (
    <div className="space-y-4">
      {/* Core toggles */}
      <div className="settings-card" aria-busy={savingKey !== null} aria-live="polite">
        <div className="settings-card-header">
          <h3 className="settings-card-title flex items-center gap-2">
            <Bell className="size-4 text-primary" /> Notification Controls
          </h3>
          <p className={cn("settings-card-desc settings-save-indicator transition-colors", savingKey && "text-primary")} role="status" aria-live="polite">
            <span className={cn("settings-save-dot", savingKey ? "settings-save-dot--saving" : "settings-save-dot--idle")} aria-hidden="true" />
            {savingKey ? "Saving preferences…" : "Changes are saved instantly."}
          </p>
        </div>
        <div className="settings-card-body">
          {toggleRows.map(({ id, key, label, sub, val }) => (
            <div key={id} className="settings-toggle-row">
              <div>
                <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
                <p id={`${id}-hint`} className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </div>
              <Switch id={id} checked={val} disabled={savingKey === key} aria-describedby={`${id}-hint`}
                onCheckedChange={(v) => updatePref(key, v)}
                className="data-[state=checked]:bg-primary shrink-0 transition-colors duration-200" />
            </div>
          ))}
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3 className="settings-card-title flex items-center gap-2">
            <Moon className="size-4 text-primary" /> Quiet Hours
          </h3>
          <p className="settings-card-desc">Mute sounds &amp; desktop notifications during selected hours.</p>
        </div>
        <div className="settings-card-body">
          <div className="settings-toggle-row">
            <div>
              <Label htmlFor="qh-toggle" className="text-sm font-medium">Enable Quiet Hours</Label>
              <p className="text-xs text-muted-foreground mt-0.5">No sounds or desktop popups during this window</p>
            </div>
            <Switch id="qh-toggle" checked={qh.enabled} onCheckedChange={(v) => updateQH({ enabled: v })}
              className="data-[state=checked]:bg-primary shrink-0" />
          </div>
          {qh.enabled && (
            <div className="mt-4 flex flex-wrap gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="flex-1 min-w-[120px]">
                <span className="settings-field-label mb-1 block">From</span>
                <input type="time" value={qh.from} onChange={(e) => updateQH({ from: e.target.value })} className="settings-field-input" />
              </label>
              <label className="flex-1 min-w-[120px]">
                <span className="settings-field-label mb-1 block">To</span>
                <input type="time" value={qh.to} onChange={(e) => updateQH({ to: e.target.value })} className="settings-field-input" />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Notification Sound */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3 className="settings-card-title flex items-center gap-2">
            <Volume2 className="size-4 text-primary" /> Notification Sound
          </h3>
          <p className="settings-card-desc">Choose the sound played when a new message arrives.</p>
        </div>
        <div className="settings-card-body">
          <div className="flex flex-wrap gap-2">
            {SOUND_OPTIONS.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => updateSound(id)}
                className={cn("settings-sound-chip", sound === id && "settings-sound-chip--active")}>
                {id === "none" ? <VolumeX className="size-3.5 shrink-0" /> : <Volume2 className="size-3.5 shrink-0" />}
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={previewSound} className="mt-3 settings-security-trigger">
            <Volume2 className="size-3.5" /> Preview sound
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationsSettings;
