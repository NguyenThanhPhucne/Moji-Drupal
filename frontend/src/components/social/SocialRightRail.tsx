import { useEffect, useMemo } from "react";
import {
  Compass,
  Ellipsis,
  Flag,
  MessageCircle,
  Store,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFriendStore } from "@/stores/useFriendStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { useChatStore } from "@/stores/useChatStore";
import { useMiniChatDockStore } from "@/stores/useMiniChatDockStore";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/chat/UserAvatar";
import type { SocialPost } from "@/types/social";

interface SocialRightRailProps {
  explorePosts?: SocialPost[];
  compact?: boolean;
}

const SPONSORED_ITEMS = [
  {
    title: "Build better communities",
    url: "meta.example.com",
  },
  {
    title: "Ship products faster with AI tools",
    url: "github.example.com",
  },
];

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

const SocialRightRail = ({ explorePosts = [], compact = false }: SocialRightRailProps) => {
  const navigate = useNavigate();
  const { friends, getFriends, loading } = useFriendStore();
  const { getUserPresence } = useSocketStore();
  const { createConversation } = useChatStore();
  const { openWindow } = useMiniChatDockStore();

  useEffect(() => {
    if (!friends.length && !loading) {
      void getFriends();
    }
  }, [friends.length, loading, getFriends]);

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
    <aside className={compact ? "space-y-3" : "social-right-rail sticky top-0 h-screen overflow-y-auto space-y-4 pr-1"}>
      <section className="social-rail-card">
        <div className="social-rail-head">
          <span className="social-rail-title">
            <Users className="h-4 w-4" />
            Contacts
          </span>
          <span className="social-rail-counter">{contacts.length}</span>
        </div>

        <div className="social-rail-list">
          {contacts.slice(0, 12).map((friend) => (
            <button
              key={friend._id}
              type="button"
              className="social-contact-item"
              onClick={() => void openDirectChat(friend)}
            >
              <div className="relative">
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
              <span className="social-contact-name">{friend.displayName}</span>
            </button>
          ))}

          {!contacts.length && <p className="social-rail-empty">No contacts yet.</p>}
        </div>
      </section>

      <section className="social-rail-card">
        <div className="social-rail-head">
          <span className="social-rail-title">
            <Store className="h-4 w-4" />
            Sponsored
          </span>
          <button type="button" className="social-rail-more-btn" aria-label="More sponsored options">
            <Ellipsis className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {SPONSORED_ITEMS.map((item) => (
            <div key={item.title} className="social-activity-item social-sponsored-item">
              <div className="social-sponsored-thumb" aria-hidden="true" />
              <div className="min-w-0">
                <p className="social-sponsored-title">{item.title}</p>
                <p className="social-sponsored-url">{item.url}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="social-rail-card">
        <div className="social-rail-head">
          <span className="social-rail-title">
            <Compass className="h-4 w-4" />
            People you may know
          </span>
        </div>

        <div className="space-y-2">
          {suggestions.map((person) => (
            <div key={person._id} className="social-suggestion-item">
              <div className="flex items-center gap-2 min-w-0">
                <UserAvatar type="chat" name={person.displayName} avatarUrl={person.avatarUrl || undefined} />
                <span className="truncate text-sm font-medium">{person.displayName}</span>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/profile/${person._id}`)}>
                View
              </Button>
            </div>
          ))}
          {!suggestions.length && <p className="social-rail-empty">Suggestions will appear soon.</p>}
        </div>
      </section>

      <section className="social-rail-card">
        <div className="social-rail-head">
          <span className="social-rail-title">
            <Flag className="h-4 w-4" />
            Your shortcuts
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {trendingTags.map((item) => (
            <button
              key={item.tag}
              type="button"
              className="social-trending-chip"
              onClick={() => navigate(`/explore?tag=${encodeURIComponent(item.tag)}`)}
            >
              #{item.tag}
              <span className="social-trending-count">{item.count}</span>
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
