import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import BackToChatCard from "@/components/chat/BackToChatCard";
import PostComposer from "@/components/social/PostComposer";
import SocialPostCard from "@/components/social/SocialPostCard";
import SocialNotificationsPanel from "@/components/social/SocialNotificationsPanel";
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

      <div className="app-shell-bg">
        <div className="app-shell-panel p-4 md:p-6">
          <div className="grid w-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-h-0 overflow-y-auto beautiful-scrollbar pr-1 space-stack-lg">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="section-eyebrow">Social</p>
                  <h1 className="text-title-1">Home Feed</h1>
                  <p className="text-body-sm text-muted-foreground">
                    Updates from people you follow
                  </p>
                </div>
                <div className="self-start sm:self-auto">
                  <BackToChatCard onClick={() => navigate("/")} />
                </div>
              </div>

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
                <PostComposer onCreate={createPost} />
              )}

              <div className="space-stack-md">
                {isInitialHomeLoading && <SocialPostSkeleton count={3} />}
                {homeFeed.map((post, index) => (
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
                      onOpenProfile={(userId) => navigate(`/profile/${userId}`)}
                    />
                  </div>
                ))}
                {isLoadingMoreHome && (
                  <SocialPostSkeleton count={2} staggerFrom={homeFeed.length} />
                )}
                {!loadingHome && homeFeed.length === 0 && (
                  <div className="elevated-card p-8 text-center text-muted-foreground">
                    Your home feed is empty. Follow people to see their posts.
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

            <div className="order-last xl:hidden">
              <SocialNotificationsPanel
                notifications={notifications}
                loading={loadingNotifications}
                compact
                onReadOne={markNotificationRead}
                onReadAll={markAllNotificationsRead}
              />
            </div>

            <div className="hidden xl:block xl:sticky xl:top-0 xl:self-start">
              <SocialNotificationsPanel
                notifications={notifications}
                loading={loadingNotifications}
                onReadOne={markNotificationRead}
                onReadAll={markAllNotificationsRead}
              />
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default HomeFeedPage;
