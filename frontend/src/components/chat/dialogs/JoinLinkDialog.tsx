import { useState, useEffect } from "react";
import { Link, Copy, CheckCircle2, RotateCcw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Conversation, GroupJoinLinkMeta } from "@/types/chat";
import { useChatStore } from "@/stores/useChatStore";

export interface JoinLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chat: Conversation;
  isGroupAdmin: boolean;
  activeGroupJoinLink: GroupJoinLinkMeta | null;
}

export function JoinLinkDialog({
  open,
  onOpenChange,
  chat,
  isGroupAdmin,
  activeGroupJoinLink,
}: JoinLinkDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedJoinLink, setGeneratedJoinLink] = useState("");
  const [generatedJoinLinkExpiresAt, setGeneratedJoinLinkExpiresAt] = useState<Date | null>(null);
  const [joinLinkErrorMessage, setJoinLinkErrorMessage] = useState("");
  const [joinLinkCooldownSeconds, setJoinLinkCooldownSeconds] = useState(0);

  const [joinLinkHours, setJoinLinkHours] = useState(24);
  const [joinLinkMaxUsesInput, setJoinLinkMaxUsesInput] = useState("");
  const [joinLinkOneTime, setJoinLinkOneTime] = useState(false);
  const { createGroupJoinLink, revokeGroupJoinLink } = useChatStore();

  useEffect(() => {
    if (open) {
      const presetMaxUses =
        typeof activeGroupJoinLink?.maxUses === "number" &&
        Number.isFinite(activeGroupJoinLink.maxUses) &&
        !activeGroupJoinLink.oneTime
          ? String(Math.max(1, Math.floor(activeGroupJoinLink.maxUses)))
          : "";

      setJoinLinkMaxUsesInput(presetMaxUses);
      setJoinLinkOneTime(Boolean(activeGroupJoinLink?.oneTime));
    } else {
      setGeneratedJoinLink("");
      setGeneratedJoinLinkExpiresAt(null);
      setJoinLinkErrorMessage("");
      setJoinLinkCooldownSeconds(0);
      setJoinLinkMaxUsesInput("");
      setJoinLinkOneTime(false);
    }
  }, [open, activeGroupJoinLink]);

  useEffect(() => {
    if (joinLinkCooldownSeconds > 0 && open) {
      const timer = setInterval(() => {
        setJoinLinkCooldownSeconds((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [joinLinkCooldownSeconds, open]);

  const handleGenerateGroupJoinLink = async () => {
    if (chat.type !== "group" || !isGroupAdmin) {
      return;
    }

    if (joinLinkCooldownSeconds > 0) {
      return;
    }

    const normalizedMaxUsesInput = String(joinLinkMaxUsesInput || "").trim();
    const parsedMaxUses =
      normalizedMaxUsesInput.length > 0
        ? Number(normalizedMaxUsesInput)
        : null;

    if (
      !joinLinkOneTime &&
      parsedMaxUses !== null &&
      (!Number.isInteger(parsedMaxUses) || parsedMaxUses < 1 || parsedMaxUses > 500)
    ) {
      toast.error("Max uses must be an integer between 1 and 500");
      return;
    }

    const maxUses = joinLinkOneTime ? 1 : parsedMaxUses;

    try {
      setIsGenerating(true);
      setJoinLinkErrorMessage("");
      const result = await createGroupJoinLink(chat._id, {
        expiresInHours: joinLinkHours,
        maxUses,
        oneTime: joinLinkOneTime,
      });
      if (!result.ok || !result.joinLinkUrl) {
        if (result.retryAfterSeconds && result.retryAfterSeconds > 0) {
          setJoinLinkCooldownSeconds(result.retryAfterSeconds);
        }

        setJoinLinkErrorMessage(
          result.message || "Could not create join link right now.",
        );
        toast.error(result.message || "Could not create join link");
        return;
      }

      setGeneratedJoinLink(result.joinLinkUrl);
      setGeneratedJoinLinkExpiresAt(result.expiresAt ? new Date(result.expiresAt) : null);
      setJoinLinkOneTime(Boolean(result.oneTime));
      if (result.maxUses && !result.oneTime) {
        setJoinLinkMaxUsesInput(String(result.maxUses));
      } else if (!result.maxUses) {
        setJoinLinkMaxUsesInput("");
      }
      setJoinLinkCooldownSeconds(0);
      setJoinLinkErrorMessage("");
      toast.success("Join link created");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyJoinLink = async () => {
    if (!generatedJoinLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedJoinLink);
      toast.success("Join link copied");
    } catch {
      toast.error("Could not copy join link");
    }
  };

  const handleRevokeGroupJoinLink = async () => {
    if (chat.type !== "group" || !isGroupAdmin) {
      return;
    }

    try {
      await revokeGroupJoinLink(chat._id);
      setGeneratedJoinLink("");
      setGeneratedJoinLinkExpiresAt(null);
      toast.success("Join link revoked");
    } catch {
      toast.error("Could not revoke join link");
    }
  };

  const displayJoinLink = generatedJoinLink || activeGroupJoinLink?.url;
  const displayJoinLinkExpiresAt = generatedJoinLink
    ? generatedJoinLinkExpiresAt
    : activeGroupJoinLink?.expiresAt
      ? new Date(activeGroupJoinLink.expiresAt)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="border-b border-border/60 px-5 py-4">
          <DialogHeader>
            <DialogTitle>Group join link</DialogTitle>
            <DialogDescription>
              Create an expiring invite link for this group.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 p-4">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Link expiry
            </span>
            <select
              value={joinLinkHours}
              onChange={(event) => setJoinLinkHours(Number(event.target.value) || 24)}
              className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/35"
            >
              <option value={1}>1 hour</option>
              <option value={6}>6 hours</option>
              <option value={24}>24 hours</option>
              <option value={72}>72 hours</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Max uses (optional)
            </span>
            <input
              type="number"
              min={1}
              max={500}
              value={joinLinkOneTime ? "1" : joinLinkMaxUsesInput}
              onChange={(event) => setJoinLinkMaxUsesInput(event.target.value)}
              disabled={joinLinkOneTime}
              placeholder="Leave empty for unlimited"
              className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-65"
            />
          </label>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">One-time link</p>
              <p className="text-xs text-muted-foreground">
                Link expires immediately after a single use.
              </p>
            </div>
            <Switch
              checked={joinLinkOneTime}
              onCheckedChange={(checked) => {
                setJoinLinkOneTime(checked);
                if (checked) {
                  setJoinLinkMaxUsesInput("1");
                }
              }}
            />
          </div>

          <div className="pt-2">
            <Button
              type="button"
              className="w-full"
              disabled={isGenerating || joinLinkCooldownSeconds > 0}
              onClick={() => {
                void handleGenerateGroupJoinLink();
              }}
            >
              <Link className="mr-2 size-4" />
              {isGenerating
                ? "Generating..."
                : joinLinkCooldownSeconds > 0
                  ? `Wait ${joinLinkCooldownSeconds}s to retry`
                  : "Generate Link"}
            </Button>
            {joinLinkErrorMessage && (
              <p className="mt-2 text-center text-xs font-medium text-destructive">
                {joinLinkErrorMessage}
              </p>
            )}
          </div>
        </div>

        {displayJoinLink && (
          <div className="border-t border-border/60 bg-muted/10 p-5 space-y-3">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-500" />
                Active Link
              </h4>
              {displayJoinLinkExpiresAt && (
                <p className="text-xs text-muted-foreground font-medium">
                  Expires {formatDistanceToNow(displayJoinLinkExpiresAt, { addSuffix: true })}
                </p>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={displayJoinLink}
                className="h-10 flex-1 rounded-lg border border-primary/30 bg-primary/5 px-3 text-sm font-medium text-primary outline-none"
              />
              <Button
                type="button"
                variant="default"
                size="icon"
                className="size-10 shrink-0"
                onClick={() => {
                  void handleCopyJoinLink();
                }}
              >
                <Copy className="size-4" />
              </Button>
            </div>

            <Button
              type="button"
              variant="destructive"
              className="w-full h-9 text-xs"
              onClick={() => {
                void handleRevokeGroupJoinLink();
              }}
            >
              <RotateCcw className="mr-2 size-3.5" />
              Revoke Link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
