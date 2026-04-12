import { useEffect, useMemo, useRef } from "react";
import {
  CircleDot,
  Compass,
  Flag,
  Hash,
  MessageCircle,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFriendStore } from "@/stores/useFriendStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { useChatStore } from "@/stores/useChatStore";
import { useMiniChatDockStore } from "@/stores/useMiniChatDockStore";
import { useSocialMotionStore } from "@/stores/useSocialMotionStore";
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

const CONTACT_SKELETON_KEYS = [
  "contact-skel-1",
  "contact-skel-2",
  "contact-skel-3",
  "contact-skel-4",
  "contact-skel-5",
  "contact-skel-6",
  "contact-skel-7",
  "contact-skel-8",
];

const SUGGESTION_SKELETON_KEYS = [
  "sugg-skel-1",
  "sugg-skel-2",
  "sugg-skel-3",
];

const MOTION_COPY = {
  "premium-strict": {
    title: "Premium strict",
    subtitle: "Calm, refined micro-motion",
  },
  "responsive-strict": {
    title: "Responsive strict",
    subtitle: "Faster hover and focus response",
  },
} as const;


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
  const { preset: motionPreset, setPreset: setMotionPreset } =
    useSocialMotionStore();
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

  let railClassName = "social-right-rail sticky top-0 h-screen overflow-y-auto beautiful-scrollbar space-y-4 pr-1 pl-0.5";
  if (compact) {
    railClassName = "social-right-rail space-y-3";
  } else if (embedded) {
    railClassName = "social-right-rail space-y-4";
  }

  const showContactsLoading = !hasFetchedRef.current || loading;
  const showSuggestionsLoading = !hasFetchedRef.current || loading;

  return (
    <aside className={railClassName}>
      <section className="social-rail-card social-motion-card">
        <div className="social-rail-head">
          <span className="social-rail-title">
            <Sparkles className="h-4 w-4" />
            Motion presets
          </span>
        </div>

        <p className="social-motion-note">
          Switch instantly between two strict animation styles.
        </p>

        <div className="social-motion-grid" role="radiogroup" aria-label="Motion presets">
          <button
            type="button"
            role="radio"
            aria-checked={motionPreset === "premium-strict"}
            data-active={motionPreset === "premium-strict"}
            className="social-motion-option"
            onClick={() => setMotionPreset("premium-strict")}
          >
            <span className="social-motion-option-icon" aria-hidden="true">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="social-motion-option-copy">
              <span className="social-motion-option-title">{MOTION_COPY["premium-strict"].title}</span>
              <span className="social-motion-option-subtitle">{MOTION_COPY["premium-strict"].subtitle}</span>
            </span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={motionPreset === "responsive-strict"}
            data-active={motionPreset === "responsive-strict"}
            className="social-motion-option"
            onClick={() => setMotionPreset("responsive-strict")}
          >
            <span className="social-motion-option-icon" aria-hidden="true">
              <Zap className="h-3.5 w-3.5" />
            </span>
            <span className="social-motion-option-copy">
              <span className="social-motion-option-title">{MOTION_COPY["responsive-strict"].title}</span>
              <span className="social-motion-option-subtitle">{MOTION_COPY["responsive-strict"].subtitle}</span>
            </span>
          </button>
        </div>
      </section>

      <section className="social-rail-card">
        <div className="social-rail-head">
          <span className="social-rail-title">
            <Users className="h-4 w-4" />
            Contacts
          </span>
          <span className="social-rail-counter">{contacts.length}</span>
        </div>

        <div className="social-rail-list relative">
          {showContactsLoading ? (
            <div className="space-y-1 py-1" aria-hidden="true">
              {CONTACT_SKELETON_KEYS.map((key) => (
                <div key={key} className="social-contact-item">
                  <div className="relative">
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-28 rounded-md bg-muted/60" />
                </div>
              ))}
            </div>
          ) : null}

          {!showContactsLoading && contacts.length > 0 ? (
            contacts.slice(0, 24).map((friend) => (
              <button
                key={friend._id}
              type="button"
              className="social-contact-item social-contact-hover social-scale-bounce-hover w-full text-left"
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
                <span className="social-contact-live-icon ml-auto flex-shrink-0" aria-hidden="true">
                  <CircleDot className="h-3 w-3" />
                </span>
              )}
            </button>
            ))
          ) : (
            !showContactsLoading && <p className="social-rail-empty">No contacts yet.</p>
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
          {showSuggestionsLoading ? (
             <div className="space-y-3 py-1" aria-hidden="true">
                {SUGGESTION_SKELETON_KEYS.map((key) => (
                  <div key={key} className="social-suggestion-item">
                    <div className="flex items-center gap-2 min-w-0">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <Skeleton className="h-4 w-28 rounded-md bg-muted/60" />
                    </div>
                    <Skeleton className="h-8 w-14 rounded-full bg-muted/40" />
                  </div>
                ))}
            </div>
          ) : null}

          {!showSuggestionsLoading && suggestions.length > 0 ? (
            suggestions.map((person) => (
              <div key={person._id} className="social-suggestion-item social-scale-bounce-hover transition-all duration-300">
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
             !showSuggestionsLoading && <p className="social-rail-empty">Suggestions will appear soon.</p>
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
              className="trending-chip-upgrade social-scale-bounce-hover"
              onClick={() => navigate(`/explore?tag=${encodeURIComponent(item.tag)}`)}
            >
              <Hash className="social-trending-tag-icon" />
              <span>{item.tag}</span>
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
