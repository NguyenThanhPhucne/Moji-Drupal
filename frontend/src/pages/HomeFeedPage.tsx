import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ImageOff, SearchX, Users } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import BackToChatCard from "@/components/chat/BackToChatCard";
import PostComposer from "@/components/social/PostComposer";
import SocialStoriesRow from "@/components/social/SocialStoriesRow";
import SocialTopHeader from "@/components/social/SocialTopHeader";
import SocialPostCard from "@/components/social/SocialPostCard";
import SocialNotificationsPanel from "@/components/social/SocialNotificationsPanel";
import SocialMiniChatDock from "@/components/social/SocialMiniChatDock";
import SocialRightRail from "@/components/social/SocialRightRail";
import PostComposerSkeleton from "@/components/skeleton/PostComposerSkeleton";
import SocialPostSkeleton from "@/components/skeleton/SocialPostSkeleton";
import LoadingMoreSkeleton from "@/components/skeleton/LoadingMoreSkeleton";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useSocialStore } from "@/stores/useSocialStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn, getStaggerEnterClass } from "@/lib/utils";
import { userService } from "@/services/userService";
import type { SocialPost } from "@/types/social";

// ── Feed scoring — defined outside component so it is referentially stable ──
type FeedTab = "all" | "photos" | "text";

const FEED_TAB_LABELS: Record<FeedTab, string> = {
  all: "All posts",
  photos: "Photos",
  text: "Text",
};

const FEED_TAB_OFFSET: Record<FeedTab, number> = {
  all: 0,
  photos: 100,
  text: 200,
};

const FEED_TABS: FeedTab[] = ["all", "photos", "text"];

const DEFAULT_SOCIAL_NOTIFICATION_PREFERENCES = Object.freeze({
  muted: false,
  follow: true,
  like: true,
  comment: true,
  friendAccepted: true,
  system: true,
  mutedUserIds: [] as string[],
  mutedConversationIds: [] as string[],
  digestEnabled: false,
  digestWindowHours: 6,
});

const computeFeedScore = (
  post: SocialPost,
  interactedAuthorIds: Set<string>,
) => {
  const ageHours = Math.max(
    0,
    (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60),
  );
  const recencyScore = Math.max(0, 72 - ageHours) * 1.1;
  const mediaScore = (post.mediaUrls?.length || 0) > 0 ? 14 : 0;
  const reactionScore = Math.min(28, Number(post.likesCount || 0) * 1.6);
  const commentScore = Math.min(34, Number(post.commentsCount || 0) * 2.2);
  const contextBoost = interactedAuthorIds.has(String(post.authorId._id || ""))
    ? 20
    : 0;
  return recencyScore + mediaScore + reactionScore + commentScore + contextBoost;
};

const HomeFeedPage = () => {
  const navigate = useNavigate();
  const { accessToken, user, setUser } = useAuthStore();
  const {
    homeFeed,
    homePagination,
    postComments,
    postCommentsPagination,
    postCommentsSortBy,
    loadingCommentsByPost,
    postEngagement,
    loadingHome,
    createPost,
    fetchHomeFeed,
    toggleLike,
    deletePost,
    deleteComment,
    fetchComments,
    loadMoreComments,
    setCommentsSortBy,
    fetchPostEngagement,
    addComment,
    notifications,
    loadingNotifications,
    fetchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useSocialStore();

  const [composerOpenKey, setComposerOpenKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [feedTab, setFeedTab] = useState<FeedTab>("all");
  const [savingNotificationPrefs, setSavingNotificationPrefs] = useState(false);

  const deliveryNotificationPreferences = useMemo(() => {
    return {
      message: user?.notificationPreferences?.message ?? true,
      sound: user?.notificationPreferences?.sound ?? true,
      desktop: user?.notificationPreferences?.desktop ?? false,
    };
  }, [
    user?.notificationPreferences?.desktop,
    user?.notificationPreferences?.message,
    user?.notificationPreferences?.sound,
  ]);

  const socialNotificationPreferences = useMemo(() => {
    const socialPrefs = user?.notificationPreferences?.social;
    return {
      muted: socialPrefs?.muted ?? DEFAULT_SOCIAL_NOTIFICATION_PREFERENCES.muted,
      follow: socialPrefs?.follow ?? DEFAULT_SOCIAL_NOTIFICATION_PREFERENCES.follow,
      like: socialPrefs?.like ?? DEFAULT_SOCIAL_NOTIFICATION_PREFERENCES.like,
      comment: socialPrefs?.comment ?? DEFAULT_SOCIAL_NOTIFICATION_PREFERENCES.comment,
      friendAccepted:
        socialPrefs?.friendAccepted ??
        DEFAULT_SOCIAL_NOTIFICATION_PREFERENCES.friendAccepted,
      system: socialPrefs?.system ?? DEFAULT_SOCIAL_NOTIFICATION_PREFERENCES.system,
      mutedUserIds:
        socialPrefs?.mutedUserIds ??
        DEFAULT_SOCIAL_NOTIFICATION_PREFERENCES.mutedUserIds,
      mutedConversationIds:
        socialPrefs?.mutedConversationIds ??
        DEFAULT_SOCIAL_NOTIFICATION_PREFERENCES.mutedConversationIds,
      digestEnabled:
        socialPrefs?.digestEnabled ??
        DEFAULT_SOCIAL_NOTIFICATION_PREFERENCES.digestEnabled,
      digestWindowHours:
        socialPrefs?.digestWindowHours ??
        DEFAULT_SOCIAL_NOTIFICATION_PREFERENCES.digestWindowHours,
    };
  }, [user?.notificationPreferences?.social]);

  // ── Infinite scroll sentinel ─────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreInFlight = useRef(false);

  const loadMore = useCallback(async () => {
    if (!homePagination.hasNextPage || loadingHome || loadMoreInFlight.current) return;
    loadMoreInFlight.current = true;
    await fetchHomeFeed(homePagination.page + 1, true);
    loadMoreInFlight.current = false;
  }, [homePagination.hasNextPage, homePagination.page, loadingHome, fetchHomeFeed]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) void loadMore(); },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // ── Feed scoring — stable memoization ───────────────────────────────────
  // interactedAuthorIds is separated so scoring only recalcs when homeFeed changes
  const interactedAuthorIds = useMemo(() => {
    const currentUserId = String(user?._id || "");
    const ids = new Set<string>();
    homeFeed.forEach((post) => {
      if (post.ownReaction) ids.add(String(post.authorId._id || ""));
      const commentsForPost = postComments[post._id] || [];
      if (commentsForPost.some((c) => String(c.authorId?._id || "") === currentUserId)) {
        ids.add(String(post.authorId._id || ""));
      }
    });
    return ids;
  }, [homeFeed, postComments, user?._id]);

  const filteredHomeFeed = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return homeFeed
      .filter((post) => {
        const hasMedia = Boolean(post.mediaUrls?.length);
        const matchesTab =
          feedTab === "all" ||
          (feedTab === "photos" && hasMedia) ||
          (feedTab === "text" && !hasMedia);
        if (!matchesTab) return false;
        if (!normalizedQuery) return true;
        const caption = String(post.caption || "").toLowerCase();
        const author = String(post.authorId.displayName || "").toLowerCase();
        const tags = (post.tags || []).join(" ").toLowerCase();
        return caption.includes(normalizedQuery) || author.includes(normalizedQuery) || tags.includes(normalizedQuery);
      })
      .sort((a, b) => computeFeedScore(b, interactedAuthorIds) - computeFeedScore(a, interactedAuthorIds));
  }, [feedTab, homeFeed, interactedAuthorIds, searchQuery]);

  // Live count badges per tab
  const tabCounts = useMemo(() => ({
    all: homeFeed.length,
    photos: homeFeed.filter((p) => Boolean(p.mediaUrls?.length)).length,
    text: homeFeed.filter((p) => !p.mediaUrls?.length).length,
  }), [homeFeed]);

  const emptyStateConfig = useMemo(() => {
    if (searchQuery) {
      return {
        icon: SearchX,
        title: `No results for "${searchQuery}"`,
        subtitle: "Try adjusting your search terms",
      };
    }

    if (feedTab === "photos") {
      return {
        icon: ImageOff,
        title: "No photo posts yet",
        subtitle: "Follow people or share something to get started",
      };
    }

    if (feedTab === "text") {
      return {
        icon: FileText,
        title: "No text-only posts yet",
        subtitle: "Follow people or share something to get started",
      };
    }

    return {
      icon: Users,
      title: "Your feed is empty",
      subtitle: "Follow people or share something to get started",
    };
  }, [feedTab, searchQuery]);

  const isInitialHomeLoading = loadingHome && homeFeed.length === 0;
  const isLoadingMore = loadingHome && homeFeed.length > 0;
  const EmptyStateIcon = emptyStateConfig.icon;
  const hasActiveFeedFilters =
    feedTab !== "all" || searchQuery.trim().length > 0;
  const feedTabButtonRefs = useRef<Record<FeedTab, HTMLButtonElement | null>>({
    all: null,
    photos: null,
    text: null,
  });

  const handleFeedFilterKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = FEED_TABS.indexOf(feedTab);
    if (currentIndex < 0) {
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      const nextIndex = (currentIndex + 1) % FEED_TABS.length;
      const nextTab = FEED_TABS[nextIndex];
      setFeedTab(nextTab);
      feedTabButtonRefs.current[nextTab]?.focus();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const nextIndex =
        (currentIndex - 1 + FEED_TABS.length) % FEED_TABS.length;
      const nextTab = FEED_TABS[nextIndex];
      setFeedTab(nextTab);
      feedTabButtonRefs.current[nextTab]?.focus();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setFeedTab("all");
      feedTabButtonRefs.current.all?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setFeedTab("text");
      feedTabButtonRefs.current.text?.focus();
    }
  };

  useEffect(() => {
    if (!accessToken || !user) return;
    fetchHomeFeed(1, false);
    fetchNotifications();
  }, [accessToken, user, fetchHomeFeed, fetchNotifications]);

  const handleUpdateSocialNotificationPreferences = useCallback(
    async (updates: {
      muted?: boolean;
      follow?: boolean;
      like?: boolean;
      comment?: boolean;
      friendAccepted?: boolean;
      system?: boolean;
      mutedUserIds?: string[];
      mutedConversationIds?: string[];
      digestEnabled?: boolean;
      digestWindowHours?: number;
    }) => {
      if (!user) {
        return;
      }

      const previousUser = user;
      const nextSocial = {
        ...socialNotificationPreferences,
        ...updates,
      };

      const nextNotificationPreferences = {
        message: deliveryNotificationPreferences.message,
        sound: deliveryNotificationPreferences.sound,
        desktop: deliveryNotificationPreferences.desktop,
        social: nextSocial,
      };

      setUser({
        ...user,
        notificationPreferences: nextNotificationPreferences,
      });

      try {
        setSavingNotificationPrefs(true);
        const response = await userService.updateNotificationPreferences({
          social: nextSocial,
        });

        if (response?.user) {
          setUser(response.user);
        }

        await fetchNotifications();
      } catch (error) {
        console.error("[home-feed] update social preferences error", error);
        setUser(previousUser);
        toast.error("Could not update notification preferences");
      } finally {
        setSavingNotificationPrefs(false);
      }
    },
    [
      deliveryNotificationPreferences.desktop,
      deliveryNotificationPreferences.message,
      deliveryNotificationPreferences.sound,
      fetchNotifications,
      setUser,
      socialNotificationPreferences,
      user,
    ],
  );

  const handleUpdateDeliveryNotificationPreferences = useCallback(
    async (updates: {
      message?: boolean;
      sound?: boolean;
      desktop?: boolean;
    }) => {
      if (!user) {
        return;
      }

      const previousUser = user;
      const nextNotificationPreferences = {
        message:
          updates.message ??
          deliveryNotificationPreferences.message,
        sound:
          updates.sound ??
          deliveryNotificationPreferences.sound,
        desktop:
          updates.desktop ??
          deliveryNotificationPreferences.desktop,
        social: socialNotificationPreferences,
      };

      setUser({
        ...user,
        notificationPreferences: nextNotificationPreferences,
      });

      try {
        setSavingNotificationPrefs(true);
        const response = await userService.updateNotificationPreferences(updates);
        if (response?.user) {
          setUser(response.user);
        }
      } catch (error) {
        console.error("[home-feed] update delivery preferences error", error);
        setUser(previousUser);
        toast.error("Could not update notification delivery settings");
      } finally {
        setSavingNotificationPrefs(false);
      }
    },
    [
      deliveryNotificationPreferences.desktop,
      deliveryNotificationPreferences.message,
      deliveryNotificationPreferences.sound,
      setUser,
      socialNotificationPreferences,
      user,
    ],
  );

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="social-page-shell">
        <div className="app-shell-panel social-shell-panel p-3 md:p-4">
          <div className="social-two-column-frame grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section
              className="social-feed-column min-h-0 overflow-y-auto beautiful-scrollbar space-stack-lg"
              aria-label="Home feed timeline"
            >
              <div className={getStaggerEnterClass(0)}>
                <SocialTopHeader
                  title="Home"
                  subtitle="Connect with friends and discover updates"
                  searchPlaceholder="Search people, posts, and groups"
                  searchValue={searchQuery}
                  onSearchValueChange={setSearchQuery}
                />
              </div>

              <div className={cn("social-feed-back-chat-row", getStaggerEnterClass(1))}>
                <BackToChatCard onClick={() => navigate("/")} />
              </div>

              <div className={cn("social-feed-stories-slot", getStaggerEnterClass(2))}>
                <SocialStoriesRow
                  currentUser={user}
                  posts={homeFeed}
                  onOpenProfile={(userId) => navigate(`/profile/${userId}`)}
                  onCreateStory={() => setComposerOpenKey((current) => current + 1)}
                />
              </div>

              {isInitialHomeLoading ? (
                <div className={cn("social-feed-composer-slot", getStaggerEnterClass(3))}>
                  <div className="xl:hidden">
                    <PostComposerSkeleton compact staggerIndex={0} />
                  </div>
                  <div className="hidden xl:block">
                    <PostComposerSkeleton staggerIndex={0} />
                  </div>
                </div>
              ) : (
                <div className={cn("social-feed-composer-slot", getStaggerEnterClass(3))}>
                  <PostComposer onCreate={createPost} openRequestKey={composerOpenKey} />
                </div>
              )}

              {/* ── Filter bar with live count badges ────────────────────── */}
              <div className={cn("social-feed-filter-wrap social-feed-filter-sticky", getStaggerEnterClass(4))}>
                <div
                  className="social-filter-tabs-container"
                  data-testid="feed-filter-tabs"
                  role="tablist"
                  aria-label="Feed filters"
                  onKeyDown={handleFeedFilterKeyDown}
                >
                  {FEED_TABS.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className="social-filter-tab micro-tap-chip"
                      data-active={feedTab === tab}
                      ref={(element) => {
                        feedTabButtonRefs.current[tab] = element;
                      }}
                      role="tab"
                      id={`feed-tab-${tab}`}
                      data-testid={`feed-tab-${tab}`}
                      aria-controls="home-feed-results"
                      aria-selected={feedTab === tab}
                      tabIndex={feedTab === tab ? 0 : -1}
                      onClick={() => setFeedTab(tab)}
                    >
                      <span className="relative z-10 flex items-center">
                        {FEED_TAB_LABELS[tab]}
                        {homeFeed.length > 0 && (
                          <span
                            key={`${tab}-${tabCounts[tab]}`}
                            className={cn(
                              "ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums transition-colors social-badge-pop",
                              feedTab === tab
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {tabCounts[tab]}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                  
                  {/* Sliding Pill Indicator */}
                  <div 
                    className="social-filter-pill-bg"
                    style={{
                      width: `${100 / 3}%`,
                      transform: `translateX(${FEED_TAB_OFFSET[feedTab]}%)`,
                    }}
                  />
                </div>
              </div>

              {/* ── Post list ─────────────────────────────────────────────── */}
              <div
                id="home-feed-results"
                className="social-feed-post-stack space-stack-md"
                role="region"
                aria-live="polite"
                aria-label={`Feed results for ${FEED_TAB_LABELS[feedTab]}`}
              >
                {isInitialHomeLoading && <SocialPostSkeleton count={3} />}

                {filteredHomeFeed.map((post, index) => (
                  <div
                    key={post._id}
                    className="feed-card-stagger"
                    style={{ animationDelay: `${Math.min(index, 10) * 48}ms` }}
                  >
                    <SocialPostCard
                      post={post}
                      comments={postComments[post._id]}
                      commentsPagination={postCommentsPagination[post._id]}
                      commentsLoading={loadingCommentsByPost[post._id]}
                      commentsSortBy={postCommentsSortBy[post._id]}
                      engagement={postEngagement[post._id]}
                      onLike={toggleLike}
                      onFetchComments={fetchComments}
                      onLoadMoreComments={loadMoreComments}
                      onSetCommentsSortBy={setCommentsSortBy}
                      onFetchEngagement={fetchPostEngagement}
                      onComment={addComment}
                      onDeletePost={deletePost}
                      onDeleteComment={deleteComment}
                      onOpenProfile={(userId) => navigate(`/profile/${userId}`)}
                    />
                  </div>
                ))}

                {isLoadingMore && (
                  <SocialPostSkeleton count={2} staggerFrom={homeFeed.length} />
                )}

                {/* ── Contextual empty state ──────────────────────────────── */}
                {!loadingHome && filteredHomeFeed.length === 0 && (
                  <div className="enterprise-empty-state enterprise-empty-state--feed px-6 text-center">
                    <div className="size-14 rounded-full bg-muted/50 flex items-center justify-center mb-3 ring-4 ring-background shadow-sm">
                      <EmptyStateIcon className="h-6 w-6 text-primary" />
                    </div>
                    <p className="text-[14px] font-semibold text-foreground/80">
                      {emptyStateConfig.title}
                    </p>
                    <p className="text-[12px] text-muted-foreground/70 mt-1 max-w-[240px]">
                      {emptyStateConfig.subtitle}
                    </p>
                    {hasActiveFeedFilters && (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3"
                        onClick={() => {
                          setSearchQuery("");
                          setFeedTab("all");
                        }}
                      >
                        Reset filters
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Infinite scroll sentinel ──────────────────────────────── */}
              <div ref={sentinelRef} className="h-4" aria-hidden="true" />
              {isLoadingMore && (
                <div className="flex justify-center pb-4">
                  <LoadingMoreSkeleton />
                </div>
              )}
            </section>

            {/* ── Right rail ──────────────────────────────────────────────── */}
            <div
              className="social-feed-right-column social-feed-right-column--enterprise order-last xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100svh-2.5rem)] xl:overflow-y-auto xl:beautiful-scrollbar space-y-3 xl:space-y-4 xl:pr-0.5"
              aria-label="Feed insights and quick actions"
            >
              {/* Notifications first — always visible above the fold */}
              <SocialNotificationsPanel
                notifications={notifications}
                loading={loadingNotifications}
                compact
                onReadOne={markNotificationRead}
                onReadAll={markAllNotificationsRead}
                deliveryPreferences={deliveryNotificationPreferences}
                socialPreferences={socialNotificationPreferences}
                preferencesBusy={savingNotificationPrefs}
                onUpdateDeliveryPreferences={handleUpdateDeliveryNotificationPreferences}
                onUpdateSocialPreferences={handleUpdateSocialNotificationPreferences}
              />

              <div className="xl:hidden">
                <SocialRightRail compact />
              </div>

              <div className="hidden xl:block">
                <SocialRightRail embedded />
              </div>
            </div>
          </div>
        </div>
      </div>

      <SocialMiniChatDock />
    </SidebarProvider>
  );
};

export default HomeFeedPage;
