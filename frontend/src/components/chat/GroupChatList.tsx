import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import GroupChatCard from "./GroupChatCard";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Inbox, Lock, LockOpen, Search, X } from "lucide-react";
import { cn, getStaggerEnterClass } from "@/lib/utils";
import ConversationSkeleton from "@/components/skeleton/ConversationSkeleton";
import { PrivatePinDialog } from "./dialogs/PrivatePinDialog";
import { Button } from "@/components/ui/button";

const CATEGORY_ORDER = ["Team", "Projects", "Support", "Social", "General"];
const COLLAPSE_STORAGE_PREFIX = "crm.channel.collapsed";

const inferCategory = (groupName: string) => {
  const normalized = String(groupName || "").toLowerCase();

  if (/support|help|ticket|incident|ops/.test(normalized)) return "Support";
  if (/project|sprint|roadmap|feature|release/.test(normalized)) return "Projects";
  if (/team|engineering|product|design|marketing|sales|hr/.test(normalized)) return "Team";
  if (/social|fun|random|coffee|lounge|hangout/.test(normalized)) return "Social";
  return "General";
};

const GroupChatList = () => {
  const conversations = useChatStore((state) => state.conversations);
  const convoLoading = useChatStore((state) => state.convoLoading);
  const privatePin = useChatStore((state) => state.privatePin);
  const { user } = useAuthStore();
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [showPrivateDialog, setShowPrivateDialog] = useState(false);
  const hydratedRef = useRef(false);

  const allGroupchats = (conversations || []).filter((c) => c.type === "group");

  // Private groups are those where isPrivateForMe is true (user hid this group per-user)
  const hiddenGroupIds = useMemo(() => {
    return new Set(
      allGroupchats
        .filter((c) => Boolean(c.isPrivateForMe))
        .map((c) => c._id),
    );
  }, [allGroupchats]);

  // Only show private groups if PIN is unlocked
  const groupchats = useMemo(() => {
    return allGroupchats.filter((c) => {
      if (c.isPrivateForMe && !privatePin) return false;
      return true;
    });
  }, [allGroupchats, privatePin]);

  const hiddenCount = hiddenGroupIds.size;

  const storageKey = `${COLLAPSE_STORAGE_PREFIX}:${user?._id || "guest"}`;

  const channelsByCategory = useMemo(() => {
    const grouped = groupchats.reduce<Record<string, typeof groupchats>>((acc, convo) => {
      const cat = inferCategory(convo.group?.name || "");
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(convo);
      return acc;
    }, {});

    return CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((c) => ({
      category: c,
      items: grouped[c],
    }));
  }, [groupchats]);

  useEffect(() => {
    hydratedRef.current = false;
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      setCollapsedCategories(parsed && typeof parsed === "object" ? parsed : {});
    } catch {
      setCollapsedCategories({});
    } finally {
      hydratedRef.current = true;
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    localStorage.setItem(storageKey, JSON.stringify(collapsedCategories));
  }, [collapsedCategories, storageKey]);

  if (convoLoading && (!conversations || conversations.length === 0)) {
    return <ConversationSkeleton />;
  }

  if (!conversations || conversations.length === 0) return null;

  if (allGroupchats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
        <div className="size-10 rounded-full bg-muted/40 flex items-center justify-center mb-2">
          <Inbox className="size-5 text-muted-foreground/75" />
        </div>
        <p className="text-[13px] font-medium text-foreground/70">No group chats</p>
        <p className="text-[11px] text-muted-foreground/60 mt-0.5">Your teams will appear here</p>
      </div>
    );
  }

  const query = filter.trim().toLowerCase();
  // When a query exists, flatten all groups and filter by name
  const filteredFlat = query
    ? groupchats.filter((c) => (c.group?.name || "").toLowerCase().includes(query))
    : null;

  return (
    <div className="chat-sidebar-section-list flex-1 overflow-y-auto pb-2 space-y-0.5">
      <div className="chat-sidebar-section-head mb-1.5 flex items-center justify-between px-3 pt-3 pb-1">
        <p className="chat-sidebar-section-title text-[11px] font-semibold text-muted-foreground/70 tracking-[0.04em] uppercase">
          Channels
        </p>
        <div className="flex items-center gap-1.5">
          {/* Hidden group count badge — only if there are hidden groups AND currently locked */}
          {hiddenCount > 0 && !privatePin && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground/70">
              <Lock className="size-2.5" />
              {hiddenCount}
            </span>
          )}
          <span className="chat-sidebar-section-count inline-flex items-center text-[10.5px] font-medium text-muted-foreground/60">
            {groupchats.length}
          </span>
          {/* PIN lock button — only if there are hidden groups */}
          {hiddenCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground/70 hover:text-foreground transition-colors"
              onClick={() => setShowPrivateDialog(true)}
              aria-label="Private groups"
              title={privatePin ? "Private groups unlocked — click to manage" : "Unlock private groups"}
            >
              {privatePin ? (
                <LockOpen className="size-3.5 text-emerald-500" />
              ) : (
                <Lock className="size-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Locked state hint */}
      {hiddenCount > 0 && !privatePin && (
        <button
          type="button"
          onClick={() => setShowPrivateDialog(true)}
          className="mx-3 mb-1.5 flex items-center gap-2 rounded-xl border border-dashed border-border/50 bg-muted/20 px-3 py-2 text-[11.5px] text-muted-foreground/60 hover:border-primary/30 hover:text-foreground/70 hover:bg-muted/35 transition-all w-[calc(100%-24px)]"
        >
          <Lock className="size-3 shrink-0" />
          <span className="truncate">
            {hiddenCount} private group{hiddenCount !== 1 ? "s" : ""} — unlock to view
          </span>
        </button>
      )}

      {/* Inline search — only when there are more than 4 groups */}
      {groupchats.length > 4 && (
        <div className="px-3 pb-1.5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-3 text-muted-foreground/50" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter channels…"
              className="h-7 w-full rounded-lg border border-border/50 bg-muted/35 pl-7 pr-7 text-[11.5px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                className="absolute right-2 text-muted-foreground/50 hover:text-foreground transition-colors"
                aria-label="Clear filter"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filtered flat view */}
      {filteredFlat !== null ? (
        filteredFlat.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] text-muted-foreground/60">
            No channels matching &ldquo;{filter}&rdquo;
          </div>
        ) : (
          filteredFlat.map((convo, index) => (
            <div
              key={convo._id}
              className={`chat-sidebar-card-enter ${getStaggerEnterClass(index)}`}
            >
              <GroupChatCard convo={convo} />
            </div>
          ))
        )
      ) : (
        /* Normal categorised view */
        channelsByCategory.map(({ category, items }, categoryIndex) => {
          const isCollapsed = collapsedCategories[category] ?? false;

          return (
            <div key={category} className="mb-1.5">
              <button
                type="button"
                onClick={() =>
                  setCollapsedCategories((prev) => ({
                    ...prev,
                    [category]: !isCollapsed,
                  }))
                }
                className="chat-sidebar-category-toggle mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
              >
                <span className="chat-sidebar-category-label text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/60">
                  {category}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="chat-sidebar-category-count text-[10px] text-muted-foreground/50 font-medium">
                    {items.length}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3 text-muted-foreground/50 transition-transform duration-150",
                      isCollapsed && "-rotate-90",
                    )}
                  />
                </span>
              </button>

              {!isCollapsed &&
                items.map((convo, itemIndex) => (
                  <div
                    key={convo._id}
                    className={`chat-sidebar-card-enter ${getStaggerEnterClass(categoryIndex + itemIndex)}`}
                  >
                    <GroupChatCard convo={convo} />
                  </div>
                ))}
            </div>
          );
        })
      )}

      <PrivatePinDialog
        open={showPrivateDialog}
        onOpenChange={setShowPrivateDialog}
        label="Private groups"
      />
    </div>
  );
};

export default GroupChatList;
