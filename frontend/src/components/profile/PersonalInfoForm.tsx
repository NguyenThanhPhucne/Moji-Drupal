import { useState, useRef, useEffect } from "react";
import { PenLine, Check, X } from "lucide-react";
import type { User } from "@/types/user";
import { userService } from "@/services/userService";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = { userInfo: User | null };

type Field = { key: "displayName" | "bio" | "phone"; label: string; multiline?: boolean; maxLen: number; placeholder: string };

const FIELDS: Field[] = [
  { key: "displayName", label: "Display Name", maxLen: 60,  placeholder: "Your display name" },
  { key: "bio",         label: "Bio",          maxLen: 240, placeholder: "Write a short bio…", multiline: true },
  { key: "phone",       label: "Phone",        maxLen: 20,  placeholder: "+84 xxx xxx xxx" },
];

function InlineEditField({ field, value, onSave }: {
  field: Field;
  value: string;
  onSave: (key: string, val: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(value); }, [value]);

  const cancel = () => { setDraft(value); setEditing(false); };
  const save   = async () => {
    if (draft === value) { cancel(); return; }
    setSaving(true);
    try {
      await onSave(field.key, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") cancel();
    if (e.key === "Enter" && !field.multiline) { e.preventDefault(); save(); }
  };

  return (
    <div className="settings-field">
      <div className="settings-field-header">
        <label className="settings-field-label">{field.label}</label>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="settings-field-edit-btn"
          >
            <PenLine className="size-3.5" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="settings-field-editing">
          {field.multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={draft}
              maxLength={field.maxLen}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
              rows={3}
              placeholder={field.placeholder}
              className="settings-field-input settings-field-input--textarea"
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={draft}
              maxLength={field.maxLen}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
              placeholder={field.placeholder}
              className="settings-field-input"
            />
          )}
          <div className="settings-field-actions">
            {field.multiline && (
              <span className={cn("settings-field-counter", draft.length > field.maxLen * 0.85 && "profile-counter-warning")}>
                {field.maxLen - draft.length}
              </span>
            )}
            <button type="button" onClick={cancel} className="settings-field-btn settings-field-btn--cancel">
              <X className="size-3.5" /> Cancel
            </button>
            <button type="button" onClick={save} disabled={saving} className="settings-field-btn settings-field-btn--save">
              <Check className="size-3.5" /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <p className="settings-field-value">
          {value || <span className="text-muted-foreground/60 italic">Not set</span>}
        </p>
      )}
    </div>
  );
}

const PersonalInfoForm = ({ userInfo }: Props) => {
  const { user, setUser } = useAuthStore();

  if (!userInfo) return null;

  const handleSave = async (key: string, val: string) => {
    // Optimistic update
    if (user) setUser({ ...user, [key]: val });

    try {
      const res = await userService.updateProfile({ [key]: val });
      if (res.user && user) setUser({ ...user, ...res.user });
      toast.success("Saved successfully!");
    } catch (err) {
      // Rollback
      if (user) setUser({ ...user });
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Failed to save");
      throw err;
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <h3 className="settings-card-title">Personal Information</h3>
        <p className="settings-card-desc">Your profile details, visible to others on Moji.</p>
      </div>

      <div className="settings-card-body">
        {FIELDS.map((field) => (
          <InlineEditField
            key={field.key}
            field={field}
            value={(userInfo[field.key] as string | null | undefined) ?? ""}
            onSave={handleSave}
          />
        ))}

        {/* Read-only fields */}
        <div className="settings-field">
          <label className="settings-field-label">Username</label>
          <p className="settings-field-value settings-field-value--readonly">
            @{userInfo.username}
          </p>
        </div>
        <div className="settings-field">
          <label className="settings-field-label">Email</label>
          <p className="settings-field-value settings-field-value--readonly">
            {userInfo.email}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PersonalInfoForm;
