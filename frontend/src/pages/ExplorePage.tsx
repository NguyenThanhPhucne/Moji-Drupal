import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Compass } from "lucide-react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import BackToChatCard from "@/components/chat/BackToChatCard";
import SocialPostCard from "@/components/social/SocialPostCard";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useSocialStore } from "@/stores/useSocialStore";
import { useAuthStore } from "@/stores/useAuthStore";

const ExplorePage = () => {
  const navigate = useNavigate();
  const { accessToken, user } = useAuthStore();
  const {
    exploreFeed,
    explorePagination,
    postComments,
    postEngagement,
    loadingExplore,
    fetchExploreFeed,
    toggleLike,
    fetchComments,
    fetchPostEngagement,
    addComment,
  } = useSocialStore();

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    fetchExploreFeed(1, false);
  }, [accessToken, user, fetchExploreFeed]);

  const loadMore = async () => {
    if (!explorePagination.hasNextPage || loadingExplore) {
      return;
    }

    await fetchExploreFeed(explorePagination.page + 1, true);
  };

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="app-shell-bg">
        <div className="app-shell-panel p-4 md:p-6">
          <section className="w-full min-h-0 overflow-y-auto beautiful-scrollbar pr-1 space-stack-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="section-eyebrow">Discover</p>
                <h1 className="text-title-1 flex items-center gap-2">
                  <Compass className="size-6" />
                  Explore
                </h1>
                <p className="text-body-sm text-muted-foreground">
                  Trending posts from the community
                </p>
              </div>
              <BackToChatCard onClick={() => navigate("/")} />
            </div>

            <div className="space-stack-md">
              {exploreFeed.map((post) => (
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
              {!loadingExplore && exploreFeed.length === 0 && (
                <div className="elevated-card p-8 text-center text-muted-foreground">
                  Explore is quiet right now.
                </div>
              )}
            </div>

            {explorePagination.hasNextPage && (
              <div className="flex justify-center">
                <Button type="button" variant="outline" onClick={loadMore}>
                  {loadingExplore ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ExplorePage;
