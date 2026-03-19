import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import BackToChatCard from "@/components/chat/BackToChatCard";
import PostComposer from "@/components/social/PostComposer";
import SocialPostCard from "@/components/social/SocialPostCard";
import SocialNotificationsPanel from "@/components/social/SocialNotificationsPanel";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useSocialStore } from "@/stores/useSocialStore";
import { useAuthStore } from "@/stores/useAuthStore";

const HomeFeedPage = () => {
  const navigate = useNavigate();
  const { accessToken, user } = useAuthStore();
  const {
    homeFeed,
    homePagination,
    postComments,
    postEngagement,
    loadingHome,
    createPost,
    fetchHomeFeed,
    toggleLike,
    fetchComments,
    fetchPostEngagement,
    addComment,
    notifications,
    fetchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useSocialStore();

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
          <div className="grid w-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-h-0 overflow-y-auto beautiful-scrollbar pr-1 space-stack-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="section-eyebrow">Social</p>
                  <h1 className="text-title-1">Home Feed</h1>
                  <p className="text-body-sm text-muted-foreground">
                    Updates from people you follow
                  </p>
                </div>
                <BackToChatCard onClick={() => navigate("/")} />
              </div>

              <PostComposer onCreate={createPost} />

              <div className="space-stack-md">
                {homeFeed.map((post) => (
                  <SocialPostCard
                    key={post._id}
                    post={post}
                    comments={postComments[post._id]}
                    engagement={postEngagement[post._id]}
                    onLike={toggleLike}
                    onFetchComments={fetchComments}
                    onFetchEngagement={fetchPostEngagement}
                    onComment={addComment}
                    onOpenProfile={(userId) => navigate(`/profile/${userId}`)}
                  />
                ))}
                {!loadingHome && homeFeed.length === 0 && (
                  <div className="elevated-card p-8 text-center text-muted-foreground">
                    Your home feed is empty. Follow people to see their posts.
                  </div>
                )}
              </div>

              {homePagination.hasNextPage && (
                <div className="flex justify-center">
                  <Button type="button" variant="outline" onClick={loadMore}>
                    {loadingHome ? "Loading..." : "Load more"}
                  </Button>
                </div>
              )}
            </section>

            <div className="hidden lg:block">
              <SocialNotificationsPanel
                notifications={notifications}
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
