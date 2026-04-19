import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleDot,
  Compass,
  Flag,
  Hash,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
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
import { cn } from "@/lib/utils";
import type { SocialPost } from "@/types/social";
import { toast } from "sonner";

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

type ContactPresenceFilter = "all" | "online" | "recently-active";

const CONTACT_FILTERS: Array<{ value: ContactPresenceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "online", label: "Online" },
  { value: "recently-active", label: "Recent" },
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

const SocialRightRail = ({ explorePosts = [], compact = false, embedded = false }: SocialRightRailProps) => {
  const navigate = useNavigate();
  const { friends, getFriends, loading } = useFriendStore();
  const { getUserPresence } = useSocketStore();
  const { createConversation } = useChatStore();
  const { openWindow } = useMiniChatDockStore();
  const { preset: motionPreset, setPreset: setMotionPreset } =
    useSocialMotionStore();
  const hasFetchedRef = useRef(false);
  const [contactQuery, setContactQuery] = useState("");
  const [presenceFilter, setPresenceFilter] = useState<ContactPresenceFilter>("all");
  const [isRefreshingContacts, setIsRefreshingContacts] = useState(false);
  const [openingContactId, setOpeningContactId] = useState<string | null>(null);
  const deferredContactQuery = useDeferredValue(contactQuery);
  const contactButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!hasFetchedRef.current && !loading) {
      hasFetchedRef.current = true;
      getFriends().catch((error) => {
        console.error("Failed to load friends in social rail", error);
      });
    }
  }, [loading, getFriends]);

  const refreshContacts = useCallback(async () => {
    setIsRefreshingContacts(true);
    try {
      await getFriends();
    } catch (error) {
      console.error("Failed to refresh contacts", error);
      toast.error("Could not refresh contacts right now.");
    } finally {
      setIsRefreshingContacts(false);
    }
  }, [getFriends]);

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

  const filteredContacts = useMemo(() => {
    const normalizedQuery = deferredContactQuery.trim().toLowerCase();

    return contacts.filter((contact) => {
      const matchesPresence =
        presenceFilter === "all" ? true : contact.presence === presenceFilter;

      if (!matchesPresence) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const displayName = String(contact.displayName || "").toLowerCase();
      const username = String(contact.username || "").toLowerCase();
      return displayName.includes(normalizedQuery) || username.includes(normalizedQuery);
    });
  }, [contacts, deferredContactQuery, presenceFilter]);
  const visibleContacts = useMemo(
    () => filteredContacts.slice(0, 24),
    [filteredContacts],
  );
  const contactPresenceSummary = useMemo(() => {
    return contacts.reduce(
      (accumulator, contact) => {
        if (contact.presence === "online") {
          accumulator.online += 1;
        } else if (contact.presence === "recently-active") {
          accumulator.recent += 1;
        } else {
          accumulator.offline += 1;
        }

        return accumulator;
      },
      {
        online: 0,
        recent: 0,
        offline: 0,
      },
    );
  }, [contacts]);

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
    const friendId = String(friend._id);
    if (openingContactId) {
      return;
    }

    setOpeningContactId(friendId);

    if (globalThis.innerWidth >= 1024) {
      openWindow({
        _id: friend._id,
        username: friend.username,
        displayName: friend.displayName,
        avatarUrl: friend.avatarUrl,
      });
      setOpeningContactId(null);
      return;
    }

    try {
      const ok = await createConversation("direct", "", [friend._id]);
      if (ok) {
        navigate("/");
        return;
      }

      toast.error("Could not open conversation right now.");
    } finally {
      setOpeningContactId(null);
    }
  };

  const handleContactClick = (friend: (typeof contacts)[number]) => {
    openDirectChat(friend).catch((error) => {
      console.error("Failed to open direct chat", error);
      setOpeningContactId(null);
      toast.error("Could not open conversation right now.");
    });
  };

  const handleContactItemKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    friendId: string,
  ) => {
    const currentIndex = visibleContacts.findIndex(
      (contact) => String(contact._id) === String(friendId),
    );

    if (currentIndex < 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = Math.min(visibleContacts.length - 1, currentIndex + 1);
      const nextId = String(visibleContacts[nextIndex]?._id || "");
      if (nextId) {
        contactButtonRefs.current[nextId]?.focus();
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = Math.max(0, currentIndex - 1);
      const nextId = String(visibleContacts[nextIndex]?._id || "");
      if (nextId) {
        contactButtonRefs.current[nextId]?.focus();
      }
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      const firstId = String(visibleContacts[0]?._id || "");
      if (firstId) {
        contactButtonRefs.current[firstId]?.focus();
      }
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const lastId = String(visibleContacts.at(-1)?._id || "");
      if (lastId) {
        contactButtonRefs.current[lastId]?.focus();
      }
    }
  };

  const railClassName = cn(
    "social-right-rail social-right-rail--command",
    compact ? "social-right-rail--compact space-y-3" : "space-y-4",
    embedded && "social-right-rail--embedded",
    !compact &&
      !embedded &&
      "sticky top-0 h-screen overflow-y-auto beautiful-scrollbar pr-1 pl-0.5",
  );

  const showContactsLoading = !hasFetchedRef.current && loading;
  const showSuggestionsLoading = !hasFetchedRef.current || loading;
  const hasContactsFilter = presenceFilter !== "all" || deferredContactQuery.trim().length > 0;

  return (
    <aside className={railClassName} aria-label="Social right rail">
      <section className="social-rail-card social-rail-card--command social-rail-card--motion social-motion-card">
        <div className="social-rail-head">
          <span className="social-rail-title">
            <SlidersHorizontal className="h-4 w-4" />
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
            className="social-motion-option micro-tap-chip"
            onClick={() => setMotionPreset("premium-strict")}
          >
            <span className="social-motion-option-icon" aria-hidden="true">
              <SlidersHorizontal className="h-3.5 w-3.5" />
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
            className="social-motion-option micro-tap-chip"
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

      <section className="social-rail-card social-rail-card--command social-rail-card--contacts">
        <div className="social-rail-head">
          <span className="social-rail-title">
            <Users className="h-4 w-4" />
            Contacts
          </span>
          <span className="social-rail-counter">{filteredContacts.length}/{contacts.length}</span>
        </div>

        <div className="social-contacts-toolbar mt-2 space-y-2">
          <div className="flex items-center gap-1.5">
            {CONTACT_FILTERS.map((filter) => {
              const active = presenceFilter === filter.value;

              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setPresenceFilter(filter.value)}
                  className={[
                    "micro-tap-chip rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    active
                      ? "border-primary/40 bg-primary/12 text-primary"
                      : "border-border/60 bg-background/65 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  ].join(" ")}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          <div className="social-contact-search-shell flex items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground/75" />
            <input
              value={contactQuery}
              onChange={(event) => setContactQuery(event.target.value)}
              placeholder="Find contact"
              aria-label="Search contacts"
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/65"
            />
            <button
              type="button"
              onClick={() => {
                refreshContacts().catch((error) => {
                  console.error("Failed to refresh contacts", error);
                });
              }}
              aria-label="Refresh contacts"
              className="micro-tap-chip rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              disabled={isRefreshingContacts}
            >
              <RefreshCw className={[
                "h-3.5 w-3.5",
                isRefreshingContacts ? "animate-spin" : "",
              ].join(" ")} />
            </button>
          </div>

          <div className="social-contacts-presence-strip social-contacts-presence-strip--command">
            <span className="social-presence-stat social-presence-stat--online">
              Online {contactPresenceSummary.online}
            </span>
            <span className="social-presence-stat social-presence-stat--recent">
              Recent {contactPresenceSummary.recent}
            </span>
            <span className="social-presence-stat social-presence-stat--offline">
              Offline {contactPresenceSummary.offline}
            </span>
          </div>
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

          {!showContactsLoading && filteredContacts.length > 0 ? (
            visibleContacts.map((friend) => {
              const friendId = String(friend._id);
              const isOpening = openingContactId === friendId;

              return (
              <button
                key={friend._id}
                type="button"
                ref={(element) => {
                  contactButtonRefs.current[friendId] = element;
                }}
                disabled={Boolean(openingContactId)}
                aria-busy={isOpening}
                className="social-contact-item social-contact-item--command social-contact-hover social-scale-bounce-hover w-full text-left disabled:cursor-wait disabled:opacity-70"
                onClick={() => handleContactClick(friend)}
                onKeyDown={(event) => handleContactItemKeyDown(event, friendId)}
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
                {isOpening ? (
                  <span className="ml-auto flex-shrink-0 text-muted-foreground" aria-hidden="true">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  </span>
                ) : null}
                {!isOpening && friend.presence === "online" ? (
                  <span className="social-contact-live-icon ml-auto flex-shrink-0" aria-hidden="true">
                    <CircleDot className="h-3 w-3" />
                  </span>
                ) : null}
              </button>
              );
            })
          ) : (
            !showContactsLoading && (
              <p className="social-rail-empty">
                {hasContactsFilter ? "No contacts match this filter." : "No contacts yet."}
              </p>
            )
          )}
        </div>
      </section>


      <section className="social-rail-card social-rail-card--command social-rail-card--suggestions">
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
              <div key={person._id} className="social-suggestion-item social-suggestion-item--command transition-colors duration-200">
                <div className="flex items-center gap-2 min-w-0">
                  <UserAvatar type="chat" name={person.displayName} avatarUrl={person.avatarUrl || undefined} />
                  <span className="truncate text-sm font-medium">{person.displayName}</span>
                </div>
                <Button type="button" size="sm" variant="outline" className="rounded-full shadow-sm hover:border-primary/50 text-[12px] h-7 px-3 transition-colors" onClick={() => navigate(`/profile/${person._id}`)}>
                  View
                </Button>
              </div>
            ))
          ) : (
             !showSuggestionsLoading && <p className="social-rail-empty">Suggestions will appear soon.</p>
          )}
        </div>
      </section>

      <section className="social-rail-card social-rail-card--command social-rail-card--shortcuts">
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
              className="trending-chip-upgrade trending-chip-upgrade--command micro-tap-chip"
              onClick={() => navigate(`/explore?tag=${encodeURIComponent(item.tag)}`)}
            >
              <Hash className="social-trending-tag-icon" />
              <span>{item.tag}</span>
              <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">{item.count}</span>
            </button>
          ))}

          {!trendingTags.length && <p className="social-rail-empty">No shortcuts yet.</p>}
        </div>

        <Button type="button" variant="ghost" className="social-rail-explore-btn mt-2 w-full justify-start" onClick={() => navigate("/explore")}> 
          <MessageCircle className="h-4 w-4" />
          Open Explore
        </Button>
      </section>
    </aside>
  );
};

export default SocialRightRail;
