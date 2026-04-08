import { useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { useSocialStore } from "@/stores/useSocialStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { getStaggerEnterClass } from "@/lib/utils";

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

  const filteredHomeFeed = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const currentUserId = String(user?._id || "");
    const interactedAuthorIds = new Set<string>();

    homeFeed.forEach((post) => {
      if (post.ownReaction) {
        interactedAuthorIds.add(String(post.authorId._id || ""));
      }

      const commentsForPost = postComments[post._id] || [];
      const userCommented = commentsForPost.some(
        (comment) => String(comment.authorId?._id || "") === currentUserId,
      );

      if (userCommented) {
        interactedAuthorIds.add(String(post.authorId._id || ""));
      }
    });

    const computeFeedScore = (post: (typeof homeFeed)[number]) => {
      const createdAtTs = new Date(post.createdAt).getTime();
      const ageHours = Math.max(0, (Date.now() - createdAtTs) / (1000 * 60 * 60));
      const recencyScore = Math.max(0, 72 - ageHours) * 1.1;
      const mediaScore = (post.mediaUrls?.length || 0) > 0 ? 14 : 0;
      const reactionScore = Math.min(28, Number(post.likesCount || 0) * 1.6);
      const commentScore = Math.min(34, Number(post.commentsCount || 0) * 2.2);
      const contextBoost = interactedAuthorIds.has(String(post.authorId._id || ""))
        ? 20
        : 0;

      return recencyScore + mediaScore + reactionScore + commentScore + contextBoost;
    };

    return homeFeed
      .filter((post) => {
        const hasMedia = Boolean(post.mediaUrls?.length);
        const matchesTab =
          feedTab === "all" ||
          (feedTab === "photos" && hasMedia) ||
          (feedTab === "text" && !hasMedia);

        if (!matchesTab) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const caption = String(post.caption || "").toLowerCase();
        const author = String(post.authorId.displayName || "").toLowerCase();
        const tags = (post.tags || []).join(" ").toLowerCase();

        return (
          caption.includes(normalizedQuery) ||
          author.includes(normalizedQuery) ||
          tags.includes(normalizedQuery)
        );
      })
      .sort((a, b) => computeFeedScore(b) - computeFeedScore(a));
  }, [feedTab, homeFeed, postComments, searchQuery, user?._id]);

  const isInitialHomeLoading = loadingHome && homeFeed.length === 0;
  const isLoadingMoreHome = loadingHome && homeFeed.length > 0;

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    fetchHomeFeed(1, false);
    fetchNotifications();
  }, [accessToken, user, fetchHomeFeed, fetchNotifications]);

  const loadMore = async () => {
    if (!homePagination.hasNextPage || loadingHome) {
      return;
    }

    await fetchHomeFeed(homePagination.page + 1, true);
  };

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="social-page-shell">
        <div className="app-shell-panel social-shell-panel p-4 md:p-6">
          <div className="social-two-column-frame grid min-h-0 gap-4 xl:grid-cols-[minmax(0,700px)_320px]">
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

              <div className="social-card social-home-filter-bar p-2">
                <button
                  type="button"
                  className="social-home-filter-chip"
                  data-active={feedTab === "all"}
                  onClick={() => setFeedTab("all")}
                >
                  All posts
                </button>
                <button
                  type="button"
                  className="social-home-filter-chip"
                  data-active={feedTab === "photos"}
                  onClick={() => setFeedTab("photos")}
                >
                  Photos
                </button>
                <button
                  type="button"
                  className="social-home-filter-chip"
                  data-active={feedTab === "text"}
                  onClick={() => setFeedTab("text")}
                >
                  Text
                </button>
              </div>

              <div className="space-stack-md">
                {isInitialHomeLoading && <SocialPostSkeleton count={3} />}
                {filteredHomeFeed.map((post, index) => (
                  <div
                    key={post._id}
                    className={getStaggerEnterClass(index)}
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
                {isLoadingMoreHome && (
                  <SocialPostSkeleton count={2} staggerFrom={homeFeed.length} />
                )}
                {!loadingHome && filteredHomeFeed.length === 0 && (
                  <div className="social-card-empty p-8 text-center">
                    No posts match your current filters.
                  </div>
                )}
              </div>

              {homePagination.hasNextPage && (
                <div className="flex justify-center">
                  {loadingHome ? (
                    <LoadingMoreSkeleton />
                  ) : (
                    <Button type="button" variant="outline" onClick={loadMore}>
                      Load more
                    </Button>
                  )}
                </div>
              )}
            </section>

            <div className="order-last space-y-3 xl:space-y-4">
              <div className="xl:hidden">
                <SocialRightRail compact />
              </div>

              <div className="hidden xl:block">
                <SocialRightRail />
              </div>

              <SocialNotificationsPanel
                notifications={notifications}
                loading={loadingNotifications}
                compact
                onReadOne={markNotificationRead}
                onReadAll={markAllNotificationsRead}
              />
            </div>
          </div>
        </div>
      </div>

      <SocialMiniChatDock />
    </SidebarProvider>
  );
};

export default HomeFeedPage;
