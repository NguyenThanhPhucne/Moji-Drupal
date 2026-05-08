import { useState, useCallback, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatStore } from "@/stores/useChatStore";
import { userService } from "@/services/userService";
import { toast } from "sonner";
import { Lock, LockOpen, KeyRound, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type DialogTab = "unlock" | "setup";

interface PrivatePinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Label shown in the dialog header, e.g. "Private messages" or "Private groups" */
  label?: string;
}

export function PrivatePinDialog({
  open,
  onOpenChange,
  label = "Private chats",
}: PrivatePinDialogProps) {
  const privatePin = useChatStore((state) => state.privatePin);
  const setPrivatePin = useChatStore((state) => state.setPrivatePin);
  const clearPrivatePin = useChatStore((state) => state.clearPrivatePin);
  const fetchConversations = useChatStore((state) => state.fetchConversations);

  const [tab, setTab] = useState<DialogTab>("unlock");
  const [unlockPin, setUnlockPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [showUnlockPin, setShowUnlockPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [shake, setShake] = useState(false);
  const [unlockSuccess, setUnlockSuccess] = useState(false);

  const unlockInputRef = useRef<HTMLInputElement>(null);

  // Reset state on open/close
  useEffect(() => {
    if (!open) {
      setUnlockPin("");
      setNewPin("");
      setCurrentPin("");
      setShake(false);
      setUnlockSuccess(false);
      setShowUnlockPin(false);
      setShowNewPin(false);
    } else {
      setTab(privatePin ? "setup" : "unlock");
      // Auto-focus the unlock input after a brief delay
      setTimeout(() => unlockInputRef.current?.focus(), 120);
    }
  }, [open, privatePin]);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 620);
  }, []);

  const handleUnlock = async () => {
    const pin = unlockPin.trim();
    if (!pin) {
      triggerShake();
      toast.error("Enter your PIN");
      return;
    }

    try {
      setIsUnlocking(true);
      const result = await userService.verifyPrivatePin(pin);
      if (!result?.allowed) {
        triggerShake();
        toast.error("Incorrect PIN");
        setUnlockPin("");
        return;
      }

      setUnlockSuccess(true);
      setPrivatePin(pin);
      await fetchConversations();
      setTimeout(() => {
        onOpenChange(false);
        toast.success(`${label} unlocked`);
      }, 600);
    } catch {
      triggerShake();
      toast.error("Failed to unlock. Try again.");
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleLock = async () => {
    clearPrivatePin();
    await fetchConversations();
    onOpenChange(false);
    toast.message(`${label} locked`);
  };

  const handleSavePin = async () => {
    const pin = newPin.trim();
    const current = currentPin.trim();

    if (!pin || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      triggerShake();
      toast.error("PIN must be 4–8 digits");
      return;
    }

    try {
      setIsSavingPin(true);
      await userService.setPrivatePin(pin, current || undefined);
      setPrivatePin(pin);
      await fetchConversations();
      toast.success("PIN saved successfully");
      onOpenChange(false);
    } catch (error) {
      const apiMessage =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { message?: unknown } } }).response?.data?.message === "string"
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      triggerShake();
      toast.error(apiMessage || "Failed to save PIN");
    } finally {
      setIsSavingPin(false);
    }
  };

  const isLocked = !privatePin;
  const isBusy = isUnlocking || isSavingPin;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden gap-0 rounded-2xl border border-border/50 shadow-2xl">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-4 border-b border-border/40 bg-gradient-to-b from-muted/30 to-transparent">
          <div className={cn(
            "relative flex size-14 items-center justify-center rounded-2xl transition-all duration-500",
            unlockSuccess
              ? "bg-emerald-500/15 ring-4 ring-emerald-500/20"
              : isLocked
              ? "bg-muted/60 ring-4 ring-border/40"
              : "bg-primary/10 ring-4 ring-primary/20",
          )}>
            {unlockSuccess ? (
              <Check className="size-7 text-emerald-500 animate-in zoom-in-50 duration-300" />
            ) : isLocked ? (
              <Lock className="size-7 text-muted-foreground/70" />
            ) : (
              <LockOpen className="size-7 text-primary" />
            )}
          </div>
          <DialogHeader className="text-center space-y-0.5 items-center">
            <DialogTitle className="text-[16px] font-bold">
              {unlockSuccess ? "Unlocked!" : label}
            </DialogTitle>
            <DialogDescription className="text-[12.5px]">
              {unlockSuccess
                ? "Your private chats are now visible"
                : isLocked
                ? "Enter your PIN to access hidden conversations"
                : "Manage your private chat PIN"}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-4">
          {/* Status badge */}
          <div className={cn(
            "flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-[12px] transition-colors duration-300",
            isLocked
              ? "border-border/50 bg-muted/25"
              : "border-emerald-500/30 bg-emerald-500/8",
          )}>
            <span className="flex items-center gap-2 font-medium text-foreground/80">
              <ShieldCheck className={cn("size-3.5", isLocked ? "text-muted-foreground/50" : "text-emerald-500")} />
              Status
            </span>
            <span className={cn(
              "font-semibold",
              isLocked ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400",
            )}>
              {isLocked ? "Locked" : "Unlocked"}
            </span>
          </div>

          {/* Session info */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/8 px-3 py-2.5 text-[11.5px] space-y-1">
            <p className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-400">
              <svg className="size-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              PIN is stored in your browser session
            </p>
            <p className="text-blue-600/80 dark:text-blue-300/70">
              You'll need to unlock again if you refresh the page or close your browser.
            </p>
          </div>

          {/* Tab toggle (only when setup exists and not locked) */}
          {!isLocked && (
            <div className="flex rounded-xl border border-border/50 bg-muted/25 p-1 gap-1">
              <button
                type="button"
                onClick={() => setTab("unlock")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-[12px] font-semibold transition-all",
                  tab === "unlock"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Lock / Unlock
              </button>
              <button
                type="button"
                onClick={() => setTab("setup")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-[12px] font-semibold transition-all",
                  tab === "setup"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Change PIN
              </button>
            </div>
          )}

          {/* Unlock / Lock section */}
          {(isLocked || tab === "unlock") && (
            <div className={cn("space-y-3 animate-in fade-in duration-200", shake && "animate-pin-shake")}>
              {isLocked ? (
                <>
                  <div className="relative">
                    <input
                      ref={unlockInputRef}
                      type={showUnlockPin ? "text" : "password"}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={8}
                      value={unlockPin}
                      onChange={(e) => setUnlockPin(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleUnlock(); }}
                      placeholder="Enter PIN"
                      disabled={isBusy}
                      className="h-11 w-full rounded-xl border border-border/60 bg-background pl-4 pr-10 text-[14px] font-mono tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:text-[13px] placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowUnlockPin((v) => !v)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                    >
                      {showUnlockPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    className="w-full h-11 rounded-xl font-semibold text-[13px] gap-2"
                    onClick={() => void handleUnlock()}
                    disabled={isBusy || !unlockPin}
                  >
                    {isUnlocking ? (
                      <span className="flex items-center gap-2">
                        <span className="size-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Unlocking…
                      </span>
                    ) : (
                      <>
                        <LockOpen className="size-4" />
                        Unlock
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 rounded-xl font-semibold text-[13px] gap-2 border-border/60"
                  onClick={() => void handleLock()}
                  disabled={isBusy}
                >
                  <Lock className="size-4" />
                  Lock {label}
                </Button>
              )}
            </div>
          )}

          {/* Set / Change PIN section */}
          {(!isLocked && tab === "setup") || isLocked ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pt-1">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/60 flex items-center gap-1">
                  <KeyRound className="size-3" />
                  {isLocked ? "Set up PIN" : "Change PIN"}
                </span>
                <div className="h-px flex-1 bg-border/50" />
              </div>

              <div className="relative">
                <input
                  type={showNewPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="New PIN (4–8 digits)"
                  disabled={isBusy}
                  className="h-10 w-full rounded-xl border border-border/60 bg-background pl-4 pr-10 text-[13.5px] font-mono tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:text-[12.5px] placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPin((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  {showNewPin ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>

              <Input
                type="password"
                inputMode="numeric"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                placeholder={isLocked ? "Skip if no PIN set" : "Current PIN"}
                disabled={isBusy}
                className="h-10 rounded-xl border-border/60 font-mono tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:text-[12.5px]"
              />

              <Button
                type="button"
                variant="secondary"
                className="w-full h-10 rounded-xl font-semibold text-[13px]"
                onClick={() => void handleSavePin()}
                disabled={isBusy || !newPin}
              >
                {isSavingPin ? "Saving…" : "Save PIN"}
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
