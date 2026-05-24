import { useState } from "react";
import { Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";

type ShortcutGroup = {
  label: string;
  shortcuts: { action: string; keys: string[] }[];
};

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Navigation",
    shortcuts: [
      { action: "Open command palette",    keys: ["⌘", "K"]         },
      { action: "Jump to conversation",    keys: ["⌘", "T"]         },
      { action: "Go to previous chat",     keys: ["Alt", "↑"]       },
      { action: "Go to next chat",         keys: ["Alt", "↓"]       },
      { action: "Open settings",           keys: ["⌘", ","]         },
    ],
  },
  {
    label: "Messaging",
    shortcuts: [
      { action: "Send message",            keys: ["Enter"]           },
      { action: "New line in message",     keys: ["Shift", "Enter"]  },
      { action: "Reply to message",        keys: ["R"]               },
      { action: "React to message",        keys: ["E"]               },
      { action: "Edit last message",       keys: ["↑"]               },
      { action: "Cancel / clear input",    keys: ["Esc"]             },
    ],
  },
  {
    label: "Media & Voice",
    shortcuts: [
      { action: "Toggle microphone",       keys: ["⌘", "D"]         },
      { action: "Start voice recording",   keys: ["⌘", "Shift", "V"] },
      { action: "Upload file",             keys: ["⌘", "U"]         },
    ],
  },
  {
    label: "App",
    shortcuts: [
      { action: "Toggle sidebar",          keys: ["⌘", "\\"]        },
      { action: "Toggle dark / light mode",keys: ["⌘", "Shift", "L"] },
      { action: "Mark all as read",        keys: ["Esc", "Esc"]      },
    ],
  },
];

const KBD_LS_KEY = "moji:keyboard_shortcuts_enabled";

const KeyboardShortcuts = () => {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(KBD_LS_KEY) !== "false");

  const toggle = (v: boolean) => {
    setEnabled(v);
    localStorage.setItem(KBD_LS_KEY, String(v));
  };

  return (
    <div className="space-y-5">
      {/* Enable toggle card */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3 className="settings-card-title flex items-center gap-2">
            <Keyboard className="size-4 text-primary" />
            Keyboard Shortcuts
          </h3>
          <p className="settings-card-desc">
            Speed up common actions with keyboard shortcuts.
          </p>
        </div>
        <div className="settings-card-body">
          <div className="settings-toggle-row">
            <div>
              <span className="text-sm font-medium">Enable keyboard shortcuts</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                When disabled, all shortcuts listed below will be inactive.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => toggle(!enabled)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200",
                enabled ? "bg-primary" : "bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                  enabled ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Shortcut reference */}
      <div className={cn("space-y-4 transition-opacity duration-200", !enabled && "pointer-events-none opacity-40")}>
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.label} className="settings-card">
            <div className="settings-card-header pb-2">
              <h3 className="settings-card-title text-sm">{group.label}</h3>
            </div>
            <div className="settings-card-body p-0">
              <table className="w-full text-sm">
                <tbody>
                  {group.shortcuts.map(({ action, keys }) => (
                    <tr
                      key={action}
                      className="settings-shortcut-row"
                    >
                      <td className="py-2 pl-4 pr-2 text-foreground/80">{action}</td>
                      <td className="py-2 pl-2 pr-4 text-right">
                        <span className="inline-flex items-center gap-1 justify-end flex-wrap">
                          {keys.map((k, i) => (
                            <kbd key={i} className="settings-kbd">{k}</kbd>
                          ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KeyboardShortcuts;
