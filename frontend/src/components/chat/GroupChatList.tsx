import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import GroupChatCard from "./GroupChatCard";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_ORDER = ["Team", "Projects", "Support", "Social", "General"];
const COLLAPSE_STORAGE_PREFIX = "crm.channel.collapsed";

const inferCategory = (groupName: string) => {
  const normalized = String(groupName || "").toLowerCase();

  if (/support|help|ticket|incident|ops/.test(normalized)) {
    return "Support";
  }

  if (/project|sprint|roadmap|feature|release/.test(normalized)) {
    return "Projects";
  }

  if (/team|engineering|product|design|marketing|sales|hr/.test(normalized)) {
    return "Team";
  }

  if (/social|fun|random|coffee|lounge|hangout/.test(normalized)) {
    return "Social";
  }

  return "General";
};

const GroupChatList = () => {
  const { conversations } = useChatStore();
  const { user } = useAuthStore();
  const [collapsedCategories, setCollapsedCategories] = useState<
    Record<string, boolean>
  >({});
  const hydratedRef = useRef(false);
  const groupchats = (conversations || []).filter(
    (convo) => convo.type === "group",
  );
  const storageKey = `${COLLAPSE_STORAGE_PREFIX}:${user?._id || "guest"}`;

  const channelsByCategory = useMemo(() => {
    const grouped = groupchats.reduce<Record<string, typeof groupchats>>(
      (acc, conversation) => {
        const category = inferCategory(conversation.group?.name || "");
        if (!acc[category]) {
          acc[category] = [];
        }

        acc[category].push(conversation);
        return acc;
      },
      {},
    );

    return CATEGORY_ORDER.filter((category) => grouped[category]?.length).map(
      (category) => ({
        category,
        items: grouped[category],
      }),
    );
  }, [groupchats]);

  useEffect(() => {
    hydratedRef.current = false;
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      setCollapsedCategories(
        parsed && typeof parsed === "object" ? parsed : {},
      );
    } catch {
      setCollapsedCategories({});
    } finally {
      hydratedRef.current = true;
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(collapsedCategories));
  }, [collapsedCategories, storageKey]);

  if (!conversations || conversations.length === 0) return null;

  if (groupchats.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        No group chats
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
      <div className="mb-1 flex items-center justify-between px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/85">
          Text Channels
        </p>
        <span className="rounded-full border border-border/60 bg-muted/45 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {groupchats.length}
        </span>
      </div>

      {channelsByCategory.map(({ category, items }, categoryIndex) => {
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
              className="mb-1 flex w-full items-center justify-between rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/50"
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/85">
                {category}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="rounded-full border border-border/60 bg-muted/45 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {items.length}
                </span>
                <ChevronDown
                  className={cn(
                    "size-3.5 text-muted-foreground transition-transform duration-150",
                    isCollapsed && "-rotate-90",
                  )}
                />
              </span>
            </button>

            {!isCollapsed &&
              items.map((convo, itemIndex) => (
                <div
                  key={convo._id}
                  className="stagger-enter"
                  style={
                    {
                      "--stagger-index": (categoryIndex + itemIndex) % 10,
                    } as CSSProperties
                  }
                >
                  <GroupChatCard convo={convo} />
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
};

export default GroupChatList;
