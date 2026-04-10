import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import BackToChatCard from "@/components/chat/BackToChatCard";
import SocialMiniChatDock from "@/components/social/SocialMiniChatDock";
import SocialStoriesRow from "@/components/social/SocialStoriesRow";
import SocialTopHeader from "@/components/social/SocialTopHeader";
import SocialPostCard from "@/components/social/SocialPostCard";
import SocialRightRail from "@/components/social/SocialRightRail";
import SocialPostSkeleton from "@/components/skeleton/SocialPostSkeleton";
import LoadingMoreSkeleton from "@/components/skeleton/LoadingMoreSkeleton";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
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
    deletePost,
    deleteComment,
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
    const currentUserId = String(user?._id || "");
    const interactedAuthorIds = new Set<string>();

    exploreFeed.forEach((post) => {
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

    const computeExploreScore = (post: (typeof exploreFeed)[number]) => {
      const createdAtTs = new Date(post.createdAt).getTime();
      const ageHours = Math.max(0, (Date.now() - createdAtTs) / (1000 * 60 * 60));
      const recencyScore = Math.max(0, 96 - ageHours) * 0.95;
      const mediaScore = (post.mediaUrls?.length || 0) > 0 ? 16 : 0;
      const reactionScore = Math.min(30, Number(post.likesCount || 0) * 1.75);
      const commentScore = Math.min(36, Number(post.commentsCount || 0) * 2.35);
      const contextBoost = interactedAuthorIds.has(String(post.authorId._id || ""))
        ? 18
        : 0;

      return recencyScore + mediaScore + reactionScore + commentScore + contextBoost;
    };

    return exploreFeed
      .filter((post) => {
        const matchesTag =
          !activeTag ||
          post.tags.some((tag) => tag.toLowerCase() === activeTag.toLowerCase());

        const caption = post.caption?.toLowerCase() || "";
        const matchesQuery = !normalizedQuery || caption.includes(normalizedQuery);

        return matchesTag && matchesQuery;
      })
      .sort((a, b) => computeExploreScore(b) - computeExploreScore(a));
  }, [activeTag, exploreFeed, postComments, searchQuery, user?._id]);

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

      <div className="social-page-shell">
        <div className="app-shell-panel social-shell-panel p-3 md:p-4">
          <div className="social-two-column-frame grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="social-feed-column w-full min-h-0 overflow-y-auto beautiful-scrollbar space-stack-lg">
              <SocialTopHeader
                title="Explore"
                subtitle="Discover trending posts, people, and topics"
                searchPlaceholder="Search on explore"
                searchValue={searchQuery}
                onSearchValueChange={setSearchQuery}
              />

              <div className="flex justify-end">
                <BackToChatCard onClick={() => navigate("/")} />
              </div>

              <SocialStoriesRow
                currentUser={user}
                posts={exploreFeed}
                onOpenProfile={(userId) => navigate(`/profile/${userId}`)}
              />

              <div className="space-stack-md">
                <div className="social-card p-3">
                  <div className="flex items-center gap-2">
                    {activeTag ? (
                      <>
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
                      </>
                    ) : (
                      <span className="social-text-muted text-sm">
                        Use the top search bar to filter posts by caption.
                      </span>
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
                    onDeletePost={deletePost}
                    onDeleteComment={deleteComment}
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
                <div className="social-card-empty p-8 text-center">
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

            <div className="order-last xl:hidden">
              <SocialRightRail compact explorePosts={exploreFeed} />
            </div>

            <div className="hidden xl:block">
              <SocialRightRail explorePosts={exploreFeed} />
            </div>
          </div>
        </div>
      </div>

      <SocialMiniChatDock />
    </SidebarProvider>
  );
};

export default ExplorePage;
