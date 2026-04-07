import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Compass } from "lucide-react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import BackToChatCard from "@/components/chat/BackToChatCard";
import SocialPostCard from "@/components/social/SocialPostCard";
import SocialPostSkeleton from "@/components/skeleton/SocialPostSkeleton";
import LoadingMoreSkeleton from "@/components/skeleton/LoadingMoreSkeleton";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSocialStore } from "@/stores/useSocialStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { getStaggerEnterClass } from "@/lib/utils";

const ExplorePage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { accessToken, user } = useAuthStore();
  const {
    exploreFeed,
    explorePagination,
    postComments,
    postCommentsPagination,
    postCommentsSortBy,
    loadingCommentsByPost,
    postEngagement,
    loadingExplore,
    fetchExploreFeed,
    toggleLike,
    fetchComments,
    loadMoreComments,
    setCommentsSortBy,
    fetchPostEngagement,
    addComment,
  } = useSocialStore();

  const isInitialExploreLoading = loadingExplore && exploreFeed.length === 0;
  const isLoadingMoreExplore = loadingExplore && exploreFeed.length > 0;
  const [activeTag, setActiveTag] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const tagFromQuery = searchParams.get("tag") || "";
    if (tagFromQuery) {
      setActiveTag(tagFromQuery.toLowerCase());
    }
  }, [searchParams]);

  const filteredExploreFeed = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return exploreFeed.filter((post) => {
      const matchesTag =
        !activeTag ||
        post.tags.some((tag) => tag.toLowerCase() === activeTag.toLowerCase());

      const caption = post.caption?.toLowerCase() || "";
      const matchesQuery = !normalizedQuery || caption.includes(normalizedQuery);

      return matchesTag && matchesQuery;
    });
  }, [activeTag, searchQuery, exploreFeed]);

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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <div className="self-start sm:self-auto">
                <BackToChatCard onClick={() => navigate("/")} />
              </div>
            </div>

            <div className="space-stack-md">
              <div className="elevated-card p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search captions in explore"
                    className="sm:max-w-sm"
                  />
                  {activeTag && (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
                        #{activeTag}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setActiveTag("");
                          setSearchParams((params) => {
                            const next = new URLSearchParams(params);
                            next.delete("tag");
                            return next;
                          });
                        }}
                      >
                        Clear tag
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {isInitialExploreLoading && <SocialPostSkeleton count={3} />}
              {filteredExploreFeed.map((post, index) => (
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
                    onSelectTag={(tag) => {
                      setActiveTag(tag);
                      setSearchParams((params) => {
                        const next = new URLSearchParams(params);
                        next.set("tag", tag);
                        return next;
                      });
                    }}
                  />
                </div>
              ))}
              {isLoadingMoreExplore && (
                <SocialPostSkeleton
                  count={2}
                  staggerFrom={exploreFeed.length}
                />
              )}
              {!loadingExplore && filteredExploreFeed.length === 0 && (
                <div className="elevated-card p-8 text-center text-muted-foreground">
                  No posts match your current filters.
                </div>
              )}
            </div>

            {explorePagination.hasNextPage && (
              <div className="flex justify-center">
                {loadingExplore ? (
                  <LoadingMoreSkeleton />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={loadMore}
                  >
                    Load more
                  </Button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ExplorePage;
