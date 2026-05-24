import { useState } from "react";
import { Eye, EyeOff, Lock, Trash2, Check, ShieldCheck, AlertTriangle, Info } from "lucide-react";
import { userService } from "@/services/userService";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ─── Password strength ────────────────────────────────────────────────── */
type StrengthInfo = { score: number; label: string; colorClass: string };

function getStrength(pw: string): StrengthInfo {
  if (!pw) return { score: 0, label: "", colorClass: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: s, label: "Very weak", colorClass: "bg-destructive" };
  if (s === 2) return { score: s, label: "Weak",      colorClass: "bg-orange-500" };
  if (s === 3) return { score: s, label: "Fair",      colorClass: "bg-yellow-500" };
  if (s === 4) return { score: s, label: "Strong",    colorClass: "bg-green-500" };
  return          { score: s, label: "Very strong", colorClass: "bg-emerald-500" };
}

function PwInput({
  id, value, onChange, placeholder, autoComplete, trailing, className,
}: {
  id?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; autoComplete?: string;
  trailing?: React.ReactNode; className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={show ? "text" : "password"} value={value}
        autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("settings-field-input pr-16", className)} />
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        {trailing}
        <button type="button" onClick={() => setShow(v => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={show ? "Hide" : "Show"}>
          {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

const SECURITY_TIPS = [
  { icon: ShieldCheck, color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", title: "Use a unique password", desc: "Never reuse a password from another site. Unique passwords prevent credential stuffing attacks." },
  { icon: Info, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", title: "Make it 12+ characters", desc: "Longer passwords are exponentially harder to crack. Mix uppercase, lowercase, numbers & symbols." },
  { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", title: "Never share your password", desc: "Moji staff will never ask for your password. Treat it like a PIN — keep it private at all times." },
];

const SecuritySettings = () => {
  const { user, signOut } = useAuthStore();

  const [currentPw, setCurrentPw]   = useState("");
  const [newPw, setNewPw]           = useState("");
  const [confirmPw, setConfirmPw]   = useState("");
  const [pwSaving, setPwSaving]     = useState(false);
  const [pwSuccess, setPwSuccess]   = useState(false);

  const [deleteOpen, setDeleteOpen]       = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting]           = useState(false);

  const strength   = getStrength(newPw);
  const matchesNew = confirmPw.length > 0 && confirmPw === newPw;
  const mismatch   = confirmPw.length > 0 && confirmPw !== newPw;

  const resetPw = () => { setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwSuccess(false); };

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPw || !newPw || !confirmPw) { toast.error("Please fill in all fields"); return; }
    if (newPw.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (newPw !== confirmPw) { toast.error("Passwords do not match"); return; }
    setPwSaving(true);
    try {
      await userService.changePassword(currentPw, newPw);
      setPwSuccess(true);
      toast.success("Password changed successfully");
      setTimeout(resetPw, 2000);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Failed to change password");
    } finally { setPwSaving(false); }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== user?.username) { toast.error("Username does not match"); return; }
    setDeleting(true);
    try {
      await userService.deleteAccount().catch(() => null);
      toast.success("Account deleted");
      signOut();
    } finally { setDeleting(false); }
  };

  return (
    <div className="space-y-4">
      {/* ── Change Password ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3 className="settings-card-title flex items-center gap-2">
            <Lock className="size-4 text-primary" /> Change Password
          </h3>
          <p className="settings-card-desc">Update your password to keep your account secure.</p>
        </div>
        <div className="settings-card-body">
          <form onSubmit={handleChangePw} className="divide-y divide-border/40">
            <input type="text" autoComplete="username" value={user?.username ?? ""} readOnly className="sr-only" aria-hidden="true" />

            <div className="settings-field">
              <label className="settings-field-label" htmlFor="sec-cur-pw">Current password</label>
              <PwInput id="sec-cur-pw" value={currentPw} onChange={setCurrentPw} autoComplete="current-password" placeholder="Enter your current password" />
            </div>

            <div className="settings-field">
              <label className="settings-field-label" htmlFor="sec-new-pw">New password</label>
              <PwInput id="sec-new-pw" value={newPw} onChange={setNewPw} autoComplete="new-password" placeholder="At least 8 characters" />
              {newPw && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className={cn("h-1 flex-1 rounded-full transition-all duration-300", i <= strength.score ? strength.colorClass : "bg-muted/40")} />
                    ))}
                  </div>
                  <p className={cn("text-[11px] font-medium",
                    strength.score <= 2 ? "text-destructive" : strength.score === 3 ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400"
                  )}>{strength.label}</p>
                </div>
              )}
            </div>

            <div className="settings-field">
              <label className="settings-field-label" htmlFor="sec-conf-pw">Confirm new password</label>
              <PwInput id="sec-conf-pw" value={confirmPw} onChange={setConfirmPw} autoComplete="new-password" placeholder="Re-enter new password"
                className={cn(mismatch && "border-destructive/60", matchesNew && "border-green-500/60")}
                trailing={matchesNew ? <Check className="size-3.5 text-green-500 shrink-0" /> : undefined} />
              {mismatch && <p className="mt-1 text-[11px] text-destructive">Passwords do not match</p>}
            </div>

            <div className="settings-field">
              <div className="settings-field-actions">
                <button type="button" onClick={resetPw} className="settings-field-btn settings-field-btn--cancel">Reset</button>
                <button type="submit" disabled={pwSaving || mismatch || pwSuccess}
                  className={cn("settings-field-btn settings-field-btn--save flex items-center gap-2",
                    pwSuccess && "bg-green-500")}>
                  {pwSuccess ? <><Check className="size-3.5" /> Updated!</> : pwSaving ? "Saving…" : "Update password"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* ── Security Tips ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3 className="settings-card-title flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> Security Tips
          </h3>
          <p className="settings-card-desc">Best practices to keep your Moji account safe.</p>
        </div>
        <div className="settings-card-body divide-y divide-border/40">
          {SECURITY_TIPS.map(({ icon: Icon, color, bg, title, desc }) => (
            <div key={title} className="flex gap-3 p-4 hover:bg-muted/20 transition-colors">
              <div className={cn("flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center", bg)}>
                <Icon className={cn("size-4", color)} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Danger Zone ── */}
      <div className="settings-card settings-card--danger">
        <div className="settings-card-header">
          <h3 className="settings-card-title flex items-center gap-2 text-destructive">
            <Trash2 className="size-4" /> Danger Zone
          </h3>
          <p className="settings-card-desc">Permanent actions that cannot be reversed. Proceed with extreme care.</p>
        </div>
        <div className="settings-card-body">
          {!deleteOpen ? (
            <div className="p-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Delete this account</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-sm">
                  Once you delete your account, all your messages, posts, and data will be permanently removed with no way to recover them.
                </p>
              </div>
              <button type="button" onClick={() => setDeleteOpen(true)} className="settings-danger-trigger shrink-0">
                <Trash2 className="size-3.5" /> Delete
              </button>
            </div>
          ) : (
            <div className="p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Type your username <strong className="font-semibold text-foreground">@{user?.username}</strong> to confirm permanent deletion.
              </p>
              <input type="text" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                placeholder={user?.username} className="settings-field-input border-destructive/40 focus:border-destructive/70"
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
              <div className="settings-field-actions">
                <button type="button" onClick={() => { setDeleteOpen(false); setDeleteConfirm(""); }}
                  className="settings-field-btn settings-field-btn--cancel">Cancel</button>
                <button type="button" disabled={deleteConfirm !== user?.username || deleting}
                  onClick={handleDelete} className="settings-field-btn settings-field-btn--danger">
                  {deleting ? "Deleting…" : "Delete account"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SecuritySettings;
