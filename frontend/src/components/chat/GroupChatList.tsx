import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import GroupChatCard from "./GroupChatCard";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn, getStaggerEnterClass } from "@/lib/utils";

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
      <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
        <div className="size-10 rounded-full bg-muted/40 flex items-center justify-center mb-2">
          <span className="text-xl">📭</span>
        </div>
        <p className="text-[13px] font-medium text-foreground/70">No group chats</p>
        <p className="text-[11px] text-muted-foreground/60 mt-0.5">Your teams will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-2 space-y-0.5">
      <div className="mb-1.5 flex items-center justify-between px-3 pt-3 pb-1">
        <p className="text-[11px] font-semibold text-muted-foreground/70 tracking-[0.04em] uppercase">
          Groups
        </p>
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
              className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/60">
                {category}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground/50 font-medium">
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
                  className={getStaggerEnterClass(categoryIndex + itemIndex)}
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
