import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { useSocialStore } from "@/stores/useSocialStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn, getStaggerEnterClass } from "@/lib/utils";
import type { SocialPost } from "@/types/social";

// ── Feed scoring — defined outside component so it is referentially stable ──
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
  const { accessToken, user } = useAuthStore();
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
  const [feedTab, setFeedTab] = useState<"all" | "photos" | "text">("all");

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

  const isInitialHomeLoading = loadingHome && homeFeed.length === 0;
  const isLoadingMore = loadingHome && homeFeed.length > 0;

  useEffect(() => {
    if (!accessToken || !user) return;
    fetchHomeFeed(1, false);
    fetchNotifications();
  }, [accessToken, user, fetchHomeFeed, fetchNotifications]);

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="social-page-shell">
        <div className="app-shell-panel social-shell-panel p-3 md:p-4">
          <div className="social-two-column-frame grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="social-feed-column min-h-0 overflow-y-auto beautiful-scrollbar space-stack-lg">
              <SocialTopHeader
                title="Home"
                subtitle="Connect with friends and discover updates"
                searchPlaceholder="Search people, posts, and groups"
                searchValue={searchQuery}
                onSearchValueChange={setSearchQuery}
              />

              <div className="flex justify-end">
                <BackToChatCard onClick={() => navigate("/")} />
              </div>

              <SocialStoriesRow
                currentUser={user}
                posts={homeFeed}
                onOpenProfile={(userId) => navigate(`/profile/${userId}`)}
                onCreateStory={() => setComposerOpenKey((current) => current + 1)}
              />

              {isInitialHomeLoading ? (
                <>
                  <div className="xl:hidden">
                    <PostComposerSkeleton compact staggerIndex={0} />
                  </div>
                  <div className="hidden xl:block">
                    <PostComposerSkeleton staggerIndex={0} />
                  </div>
                </>
              ) : (
                <PostComposer onCreate={createPost} openRequestKey={composerOpenKey} />
              )}

              {/* ── Filter bar with live count badges ────────────────────── */}
              <div className="flex items-center gap-0 overflow-x-auto beautiful-scrollbar">
                <div className="social-filter-tabs-container">
                  {(["all", "photos", "text"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className="social-filter-tab"
                      data-active={feedTab === tab}
                      onClick={() => setFeedTab(tab)}
                    >
                      <span className="relative z-10 flex items-center">
                        {tab === "all" ? "All posts" : tab === "photos" ? "Photos" : "Text"}
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
                      transform: `translateX(${
                        feedTab === "all" ? 0 : feedTab === "photos" ? 100 : 200
                      }%)`,
                    }}
                  />
                </div>
              </div>

              {/* ── Post list ─────────────────────────────────────────────── */}
              <div className="space-stack-md">
                {isInitialHomeLoading && <SocialPostSkeleton count={3} />}

                {filteredHomeFeed.map((post, index) => (
                  <div key={post._id} className={getStaggerEnterClass(index)}>
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
                  <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                    <div className="size-14 rounded-full bg-muted/50 flex items-center justify-center mb-3 ring-4 ring-background shadow-sm">
                      <span className="text-2xl">
                        {feedTab === "photos" ? "🖼️" : feedTab === "text" ? "📝" : searchQuery ? "🔍" : "🌱"}
                      </span>
                    </div>
                    <p className="text-[14px] font-semibold text-foreground/80">
                      {searchQuery
                        ? `No results for "${searchQuery}"`
                        : feedTab === "photos"
                        ? "No photo posts yet"
                        : feedTab === "text"
                        ? "No text-only posts yet"
                        : "Your feed is empty"}
                    </p>
                    <p className="text-[12px] text-muted-foreground/70 mt-1 max-w-[240px]">
                      {searchQuery
                        ? "Try adjusting your search terms"
                        : "Follow people or share something to get started"}
                    </p>
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
            <div className="order-last xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100svh-2.5rem)] xl:overflow-y-auto xl:beautiful-scrollbar space-y-3 xl:space-y-4 xl:pr-0.5">
              {/* Notifications first — always visible above the fold */}
              <SocialNotificationsPanel
                notifications={notifications}
                loading={loadingNotifications}
                compact
                onReadOne={markNotificationRead}
                onReadAll={markAllNotificationsRead}
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
