import { useEffect, useMemo, useRef } from "react";
import {
  Compass,
  Flag,
  MessageCircle,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFriendStore } from "@/stores/useFriendStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { useChatStore } from "@/stores/useChatStore";
import { useMiniChatDockStore } from "@/stores/useMiniChatDockStore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import UserAvatar from "@/components/chat/UserAvatar";
import type { SocialPost } from "@/types/social";

interface SocialRightRailProps {
  explorePosts?: SocialPost[];
  compact?: boolean;
  /** When true, the rail is inside an already-scrollable container — skip sticky/h-screen */
  embedded?: boolean;
}


const getPresenceClassName = (
  presence: "online" | "recently-active" | "offline",
) => {
  if (presence === "online") {
    return "social-contact-presence--online";
  }

  if (presence === "recently-active") {
    return "social-contact-presence--recent";
  }

  return "social-contact-presence--offline";
};

const SocialRightRail = ({ explorePosts = [], compact = false, embedded = false }: SocialRightRailProps) => {
  const navigate = useNavigate();
  const { friends, getFriends, loading } = useFriendStore();
  const { getUserPresence } = useSocketStore();
  const { createConversation } = useChatStore();
  const { openWindow } = useMiniChatDockStore();
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!hasFetchedRef.current && !loading) {
      hasFetchedRef.current = true;
      void getFriends();
    }
  }, [loading, getFriends]);

  const contacts = useMemo(() => {
    const rank = (presence: "online" | "recently-active" | "offline") => {
      if (presence === "online") return 3;
      if (presence === "recently-active") return 2;
      return 1;
    };

    return [...friends]
      .map((friend) => ({
        ...friend,
        presence: getUserPresence(friend._id),
      }))
      .sort((a, b) => rank(b.presence) - rank(a.presence) || a.displayName.localeCompare(b.displayName));
  }, [friends, getUserPresence]);

  const trendingTags = useMemo(() => {
    const counter = new Map<string, number>();

    explorePosts.forEach((post) => {
      (post.tags || []).forEach((tag) => {
        const normalized = String(tag || "").trim().toLowerCase();
        if (!normalized) return;
        counter.set(normalized, (counter.get(normalized) || 0) + 1);
      });
    });

    return Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));
  }, [explorePosts]);

  const suggestions = useMemo(() => {
    const friendIds = new Set(friends.map((f) => String(f._id)));

    const map = new Map<string, SocialPost["authorId"]>();
    explorePosts.forEach((post) => {
      const authorId = String(post.authorId?._id || "");
      if (!authorId || friendIds.has(authorId)) return;
      if (!map.has(authorId)) {
        map.set(authorId, post.authorId);
      }
    });

    return Array.from(map.values()).slice(0, 3);
  }, [explorePosts, friends]);

  const openDirectChat = async (
    friend: (typeof contacts)[number],
  ) => {
    if (globalThis.innerWidth >= 1024) {
      openWindow({
        _id: friend._id,
        username: friend.username,
        displayName: friend.displayName,
        avatarUrl: friend.avatarUrl,
      });
      return;
    }

    const ok = await createConversation("direct", "", [friend._id]);
    if (ok) {
      navigate("/");
    }
  };

  return (
    <aside className={
      compact
        ? "space-y-3"
        : embedded
        ? "space-y-4"  // no sticky/h-screen — parent container handles scroll
        : "social-right-rail sticky top-0 h-screen overflow-y-auto beautiful-scrollbar space-y-4 pr-1 pl-0.5"
    }>
      <section className="social-rail-card">
        <div className="social-rail-head">
          <span className="social-rail-title">
            <Users className="h-4 w-4" />
            Contacts
          </span>
          <span className="social-rail-counter">{contacts.length}</span>
        </div>

        <div className="social-rail-list relative">
          {(!hasFetchedRef.current || loading) ? (
            <div className="space-y-1 py-1" aria-hidden="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={`contact-skel-${i}`} className="social-contact-item">
                  <div className="relative">
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-28 rounded-md bg-muted/60" />
                </div>
              ))}
            </div>
          ) : contacts.length > 0 ? (
            contacts.slice(0, 24).map((friend) => (
              <button
                key={friend._id}
              type="button"
              className="social-contact-item social-contact-hover w-full text-left"
              onClick={() => void openDirectChat(friend)}
            >
              <div className="relative flex-shrink-0">
                <UserAvatar
                  type="chat"
                  name={friend.displayName}
                  avatarUrl={friend.avatarUrl}
                  className="social-contact-avatar"
                />
                <span
                  className={`social-contact-presence ${getPresenceClassName(friend.presence)}`}
                />
              </div>
              <span className="social-contact-name flex-1 truncate">{friend.displayName}</span>
              {friend.presence === "online" && (
                <span className="ml-auto text-[10px] font-medium text-emerald-600 dark:text-emerald-400 flex-shrink-0">●</span>
              )}
            </button>
            ))
          ) : (
            <p className="social-rail-empty">No contacts yet.</p>
          )}
        </div>
      </section>


      <section className="social-rail-card">
        <div className="social-rail-head">
          <span className="social-rail-title">
            <Compass className="h-4 w-4" />
            People you may know
          </span>
        </div>

        <div className="space-y-2 relative">
          {(!hasFetchedRef.current || loading) ? (
             <div className="space-y-3 py-1" aria-hidden="true">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={`sugg-skel-${i}`} className="social-suggestion-item">
                    <div className="flex items-center gap-2 min-w-0">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <Skeleton className="h-4 w-28 rounded-md bg-muted/60" />
                    </div>
                    <Skeleton className="h-8 w-14 rounded-full bg-muted/40" />
                  </div>
                ))}
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map((person) => (
              <div key={person._id} className="social-suggestion-item">
                <div className="flex items-center gap-2 min-w-0">
                  <UserAvatar type="chat" name={person.displayName} avatarUrl={person.avatarUrl || undefined} />
                  <span className="truncate text-sm font-medium">{person.displayName}</span>
                </div>
                <Button type="button" size="sm" variant="outline" className="rounded-full shadow-sm hover:border-primary/50 text-[12px] h-7 px-3 active:scale-95 transition-all" onClick={() => navigate(`/profile/${person._id}`)}>
                  View
                </Button>
              </div>
            ))
          ) : (
             <p className="social-rail-empty">Suggestions will appear soon.</p>
          )}
        </div>
      </section>

      <section className="social-rail-card">
        <div className="social-rail-head">
          <span className="social-rail-title">
            <Flag className="h-4 w-4" />
            Your shortcuts
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {trendingTags.map((item) => (
            <button
              key={item.tag}
              type="button"
              className="trending-chip-upgrade"
              onClick={() => navigate(`/explore?tag=${encodeURIComponent(item.tag)}`)}
            >
              <span className="text-primary/70">#</span>{item.tag}
              <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">{item.count}</span>
            </button>
          ))}

          {!trendingTags.length && <p className="social-rail-empty">No shortcuts yet.</p>}
        </div>

        <Button type="button" variant="ghost" className="mt-2 w-full justify-start" onClick={() => navigate("/explore")}> 
          <MessageCircle className="h-4 w-4" />
          Open Explore
        </Button>
      </section>
    </aside>
  );
};

export default SocialRightRail;
