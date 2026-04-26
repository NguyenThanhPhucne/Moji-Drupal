import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Hash,
  Plus,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/useChatStore";
import type {
  Conversation,
  GroupChannelRole,
  GroupChannelAnalyticsPayload,
} from "@/types/chat";

/* ─── helpers (kept local to avoid re-export) ─── */
const formatUnreadCountLabel = (n: number) => (n > 99 ? "99+" : String(n));

const formatVoiceMinutes = (value: number) => {
  const v = Number(value || 0);
  if (!Number.isFinite(v) || v <= 0) return "0";
  return v.toFixed(v >= 10 ? 0 : 1);
};

const formatVoiceDurationLabel = (seconds: number) => {
  const s = Math.max(0, Math.round(Number(seconds || 0)));
  if (s <= 0) return "0s";
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  if (r <= 0) return `${m}m`;
  return `${m}m ${r}s`;
};

type PendingDestructiveAction =
  | { type: "channel"; channelId: string; channelName: string }
  | { type: "category"; categoryId: string; categoryName: string };

/* ─── Props ─── */
export interface ManageChannelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chat: Conversation;
  isGroupAdmin: boolean;
}

export function ManageChannelsDialog({
  open,
  onOpenChange,
  chat,
  isGroupAdmin,
}: ManageChannelsDialogProps) {
  const {
    updateGroupChannel,
    deleteGroupChannel,
    reorderGroupChannels,
    createGroupChannelCategory,
    updateGroupChannelCategory,
    deleteGroupChannelCategory,
    reorderGroupChannelCategories,
    fetchGroupChannelAnalytics,
  } = useChatStore();

  /* ─── local state ─── */
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [channelName, setChannelName] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [channelCategoryId, setChannelCategoryId] = useState("");
  const [sendRoles, setSendRoles] = useState<GroupChannelRole[]>(["owner", "admin", "member"]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  const [pendingAction, setPendingAction] = useState<PendingDestructiveAction | null>(null);

  const [analyticsDays, setAnalyticsDays] = useState(7);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analytics, setAnalytics] = useState<GroupChannelAnalyticsPayload | null>(null);

  /* ─── derived data ─── */
  const groupChannels =
    chat.type === "group"
      ? [...(chat.group?.channels || [])].sort(
          (a, b) => Number(a.position || 0) - Number(b.position || 0),
        )
      : [{ channelId: "general", name: "general", description: "" }];

  const groupChannelCategories =
    chat.type === "group"
      ? [...(chat.group?.channelCategories || [])].sort(
          (a, b) => Number(a.position || 0) - Number(b.position || 0),
        )
      : [];

  const selectedChannel =
    groupChannels.find((c) => c.channelId === selectedChannelId) ||
    groupChannels[0] ||
    null;

  /* ─── sync form when selected channel changes ─── */
  useEffect(() => {
    if (!open) return;
    const ch = groupChannels.find((c) => c.channelId === selectedChannelId) || groupChannels[0];
    if (!ch) return;
    setSelectedChannelId(ch.channelId);
    setChannelName(ch.name || "");
    setChannelDescription(ch.description || "");
    setChannelCategoryId(ch.categoryId || "");
    setSendRoles(
      ch.permissions?.sendRoles?.length ? ch.permissions.sendRoles : ["owner", "admin", "member"],
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelId, open, chat.group?.channels]);

  /* ─── init category drafts on open ─── */
  useEffect(() => {
    if (!open) return;
    setCategoryDrafts(
      (chat.group?.channelCategories || []).reduce<Record<string, string>>(
        (acc, cat) => { acc[cat.categoryId] = cat.name || ""; return acc; },
        {},
      ),
    );
  }, [open, chat.group?.channelCategories]);

  /* ─── load analytics on open ─── */
  const loadAnalytics = async (days = analyticsDays) => {
    if (chat.type !== "group" || !isGroupAdmin) return;
    try {
      setAnalyticsLoading(true);
      const result = await fetchGroupChannelAnalytics(chat._id, days);
      setAnalytics(result.ok ? (result.analytics || null) : null);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    if (open && isGroupAdmin) {
      void loadAnalytics(analyticsDays);
    }
    if (!open) {
      setNewCategoryName("");
      setPendingAction(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ─── handlers ─── */
  const handleSaveChannel = async () => {
    if (!selectedChannel) return;
    const name = channelName.trim();
    if (name.length < 2 || name.length > 40) {
      toast.error("Channel name must be 2-40 characters");
      return;
    }
    try {
      setIsSaving(true);
      const result = await updateGroupChannel(chat._id, selectedChannel.channelId, {
        name,
        description: channelDescription,
        categoryId: channelCategoryId || null,
        sendRoles,
      });
      if (!result.ok) { toast.error(result.message || "Could not update channel"); return; }
      toast.success("Channel updated");
      void loadAnalytics();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteChannel = () => {
    if (!selectedChannel) return;
    if (selectedChannel.channelId === "general") {
      toast.error("Default #general channel cannot be deleted");
      return;
    }
    setPendingAction({ type: "channel", channelId: selectedChannel.channelId, channelName: selectedChannel.name });
  };

  const handleMoveChannel = async (channelId: string, direction: "up" | "down") => {
    const ids = groupChannels.map((c) => c.channelId);
    const idx = ids.indexOf(channelId);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(idx, 1);
    next.splice(targetIdx, 0, moved);
    const ok = await reorderGroupChannels(chat._id, next);
    if (!ok) toast.error("Could not reorder channels");
    else toast.success("Channel order updated");
  };

  const handleToggleSendRole = (role: GroupChannelRole, checked: boolean) => {
    setSendRoles((prev) => {
      const next = new Set(prev);
      checked ? next.add(role) : next.delete(role);
      const arr = Array.from(next) as GroupChannelRole[];
      return arr.length === 0 ? ["owner", "admin", "member"] : arr;
    });
  };

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (name.length < 2 || name.length > 40) {
      toast.error("Category name must be 2-40 characters");
      return;
    }
    try {
      setIsCreatingCategory(true);
      const result = await createGroupChannelCategory(chat._id, name);
      if (!result.ok) { toast.error(result.message || "Could not create category"); return; }
      setNewCategoryName("");
      toast.success("Category created");
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleSaveCategoryName = async (categoryId: string) => {
    const name = String(categoryDrafts[categoryId] || "").trim();
    if (name.length < 2 || name.length > 40) {
      toast.error("Category name must be 2-40 characters");
      return;
    }
    const result = await updateGroupChannelCategory(chat._id, categoryId, { name });
    if (!result.ok) toast.error(result.message || "Could not update category");
    else toast.success("Category updated");
  };

  const handleMoveCategory = async (categoryId: string, direction: "up" | "down") => {
    const ids = groupChannelCategories.map((c) => c.categoryId);
    const idx = ids.indexOf(categoryId);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(idx, 1);
    next.splice(targetIdx, 0, moved);
    const ok = await reorderGroupChannelCategories(chat._id, next);
    if (!ok) toast.error("Could not reorder categories");
    else toast.success("Category order updated");
  };

  const handleDeleteCategory = (categoryId: string) => {
    const cat = groupChannelCategories.find((c) => c.categoryId === categoryId);
    setPendingAction({
      type: "category",
      categoryId,
      categoryName: cat?.name || "this category",
    });
  };

  const handleConfirmDestructiveAction = async () => {
    if (!pendingAction) return;
    if (pendingAction.type === "channel") {
      try {
        setIsDeleting(true);
        const result = await deleteGroupChannel(chat._id, pendingAction.channelId);
        if (!result.ok) { toast.error(result.message || "Could not delete channel"); return; }
        toast.success("Channel deleted");
        setPendingAction(null);
        void loadAnalytics();
      } finally { setIsDeleting(false); }
    } else {
      try {
        setIsDeletingCategory(true);
        const result = await deleteGroupChannelCategory(chat._id, pendingAction.categoryId);
        if (!result.ok) { toast.error(result.message || "Could not delete category"); return; }
        toast.success("Category deleted");
        setPendingAction(null);
      } finally { setIsDeletingCategory(false); }
    }
  };

  const isBusy = isDeleting || isDeletingCategory;
  const destructiveTitle = pendingAction?.type === "channel"
    ? `Delete #${pendingAction.channelName}?`
    : pendingAction?.type === "category"
    ? `Delete category "${pendingAction.categoryName}"?`
    : "Delete this item?";
  const destructiveDesc = pendingAction?.type === "channel"
    ? "This permanently removes all messages in this channel. This action cannot be undone."
    : pendingAction?.type === "category"
    ? "Channels in this category will become uncategorized. This action cannot be undone."
    : "This action cannot be undone.";

  /* ─── render ─── */
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <DialogHeader>
              <DialogTitle>Channel management</DialogTitle>
              <DialogDescription>
                Rename, delete, reorder channels, control send permissions by role, and review activity trends.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_1.3fr]">
            {/* ── Left column: channel + category list ── */}
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Channels
                </p>
              </div>

              <div className="max-h-[260px] space-y-1 overflow-y-auto beautiful-scrollbar pr-1">
                {groupChannels.map((channel, index) => {
                  const myChannelUnreadMap =
                    chat.type === "group"
                      ? (chat.group?.channelUnreadCounts as Record<string, Record<string, number>> | undefined)
                      : undefined;
                  const unread = Number((myChannelUnreadMap as Record<string, number> | undefined)?.[channel.channelId] || 0);
                  const isSelected = selectedChannel?.channelId === channel.channelId;

                  return (
                    <div
                      key={channel.channelId}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                        isSelected ? "border-primary/40 bg-primary/10" : "border-border/60 bg-background/70",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedChannelId(channel.channelId)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <Hash className="size-3 text-muted-foreground" />
                        <span className="truncate text-sm font-medium text-foreground">{channel.name}</span>
                        {unread > 0 && (
                          <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            {formatUnreadCountLabel(unread)}
                          </span>
                        )}
                      </button>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" className="size-6"
                          disabled={index === 0} onClick={() => void handleMoveChannel(channel.channelId, "up")}>
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-6"
                          disabled={index === groupChannels.length - 1} onClick={() => void handleMoveChannel(channel.channelId, "down")}>
                          <ArrowDown className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Categories sub-panel */}
              <div className="rounded-lg border border-border/60 bg-background/60 p-2.5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Categories
                </p>
                <div className="mb-2 flex items-center gap-2">
                  <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="New category" maxLength={40} className="h-8" disabled={isCreatingCategory} />
                  <Button type="button" size="sm" className="h-8 px-2.5"
                    onClick={() => void handleCreateCategory()} disabled={isCreatingCategory}>
                    <Plus className="mr-1 size-3" />Add
                  </Button>
                </div>

                <div className="max-h-[180px] space-y-1 overflow-y-auto beautiful-scrollbar pr-1">
                  {groupChannelCategories.length === 0 && (
                    <p className="py-2 text-xs text-muted-foreground">No categories yet.</p>
                  )}
                  {groupChannelCategories.map((category, index) => (
                    <div key={category.categoryId}
                      className="flex items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 py-1">
                      <Input value={categoryDrafts[category.categoryId] ?? category.name}
                        onChange={(e) => setCategoryDrafts((prev) => ({ ...prev, [category.categoryId]: e.target.value }))}
                        className="h-7 text-xs" />
                      <Button type="button" variant="ghost" size="icon" className="size-7"
                        onClick={() => void handleSaveCategoryName(category.categoryId)} title="Save name">
                        <Settings2 className="size-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-7"
                        disabled={index === 0} onClick={() => void handleMoveCategory(category.categoryId, "up")}>
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-7"
                        disabled={index === groupChannelCategories.length - 1}
                        onClick={() => void handleMoveCategory(category.categoryId, "down")}>
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive"
                        disabled={isBusy} onClick={() => handleDeleteCategory(category.categoryId)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Right column: channel settings + analytics ── */}
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channel settings</p>
                {selectedChannel ? (
                  <p className="mt-0.5 text-sm font-medium text-foreground">#{selectedChannel.name}</p>
                ) : (
                  <p className="mt-0.5 text-sm text-muted-foreground">Select a channel to manage.</p>
                )}
              </div>

              {selectedChannel && (
                <>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</span>
                    <Input value={channelName} onChange={(e) => setChannelName(e.target.value)}
                      maxLength={40} disabled={isSaving} />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</span>
                    <Input value={channelDescription} onChange={(e) => setChannelDescription(e.target.value)}
                      maxLength={120} disabled={isSaving} />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</span>
                    <select value={channelCategoryId} onChange={(e) => setChannelCategoryId(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/35">
                      <option value="">Uncategorized</option>
                      {groupChannelCategories.map((cat) => (
                        <option key={cat.categoryId} value={cat.categoryId}>{cat.name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="space-y-1.5 rounded-lg border border-border/60 bg-background/60 p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Send permissions</p>
                    {(["owner", "admin", "member"] as GroupChannelRole[]).map((role) => (
                      <label key={role} className="flex items-center justify-between gap-2 text-sm">
                        <span className="capitalize text-foreground">{role}</span>
                        <Switch checked={sendRoles.includes(role)}
                          onCheckedChange={(checked) => handleToggleSendRole(role, checked)} />
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Button type="button" onClick={() => void handleSaveChannel()} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save channel"}
                    </Button>
                    <Button type="button" variant="destructive"
                      onClick={handleDeleteChannel}
                      disabled={isDeleting || selectedChannel.channelId === "general"}>
                      {isDeleting ? "Deleting..." : "Delete channel"}
                    </Button>
                  </div>
                </>
              )}

              {/* Analytics */}
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="size-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin analytics</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={analyticsDays}
                      onChange={(e) => {
                        const days = Number(e.target.value) || 7;
                        setAnalyticsDays(days);
                        void loadAnalytics(days);
                      }}
                      className="h-7 rounded-md border border-border/70 bg-background px-2 text-xs">
                      <option value={7}>7d</option>
                      <option value={14}>14d</option>
                      <option value={30}>30d</option>
                    </select>
                    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs"
                      onClick={() => void loadAnalytics()}>Refresh</Button>
                  </div>
                </div>

                {analyticsLoading && <p className="text-xs text-muted-foreground">Loading analytics...</p>}

                {!analyticsLoading && analytics && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { label: "Messages", value: analytics.summary.currentMessages },
                        { label: "Active members", value: analytics.summary.currentActiveMembers },
                        { label: "Retention", value: `${analytics.summary.currentRetentionRate}%` },
                        { label: "Voice mins", value: formatVoiceMinutes(analytics.summary.currentVoiceMinutes) },
                        { label: "Avg memo", value: formatVoiceDurationLabel(analytics.summary.avgVoiceMemoLengthSeconds) },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-md border border-border/60 bg-muted/20 p-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">{stat.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="max-h-[150px] space-y-1 overflow-y-auto beautiful-scrollbar pr-1">
                      {analytics.channels.map((item) => (
                        <div key={item.channelId}
                          className="flex items-center justify-between rounded-md border border-border/60 bg-background px-2 py-1.5">
                          <p className="truncate text-xs font-medium text-foreground">#{item.name}</p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{item.currentMessages} msgs</span>
                            <span>{formatVoiceMinutes(item.currentVoiceMinutes)}m voice</span>
                            <span>avg {formatVoiceDurationLabel(item.avgVoiceMemoLengthSeconds)}</span>
                            <span className={cn("font-semibold", item.messageGrowthPercent >= 0 ? "text-online" : "text-destructive")}>
                              {item.messageGrowthPercent >= 0 ? "+" : ""}{item.messageGrowthPercent}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Destructive confirmation */}
      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(o) => !o && !isBusy && setPendingAction(null)}>
        <AlertDialogContent className="max-w-md rounded-2xl p-6 gap-6 outline-none bg-background border border-border/50 shadow-2xl">
          <AlertDialogHeader className="items-center text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/12 ring-8 ring-destructive/10">
              <Trash2 className="size-6 text-destructive" />
            </div>
            <div className="space-y-1.5">
              <AlertDialogTitle className="text-xl font-bold tracking-tight">{destructiveTitle}</AlertDialogTitle>
              <AlertDialogDescription className="text-[15px] font-medium leading-relaxed text-muted-foreground/80 px-2">
                {destructiveDesc}
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-row gap-3 sm:space-x-0 pt-2 w-full">
            <AlertDialogCancel disabled={isBusy}
              className="flex-1 h-11 rounded-full border-border/60 font-semibold transition-colors hover:bg-muted/55">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleConfirmDestructiveAction(); }}
              disabled={isBusy}
              className={cn("flex-1 h-11 rounded-full bg-destructive font-semibold text-white transition-colors hover:bg-destructive/90", isBusy && "opacity-70 pointer-events-none")}>
              {isDeleting ? "Deleting channel..." : isDeletingCategory ? "Deleting category..." : "Yes, delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
