import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Hash, Search, SearchX, SlidersHorizontal } from "lucide-react";
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
              <div className={getStaggerEnterClass(0)}>
                <SocialTopHeader
                  title="Explore"
                  subtitle="Discover trending posts, people, and topics"
                  searchPlaceholder="Search on explore"
                  searchValue={searchQuery}
                  onSearchValueChange={setSearchQuery}
                />
              </div>

              <div className={`social-feed-back-chat-row ${getStaggerEnterClass(1)}`}>
                <BackToChatCard onClick={() => navigate("/")} />
              </div>

              <div className={`social-feed-stories-slot ${getStaggerEnterClass(2)}`}>
                <SocialStoriesRow
                  currentUser={user}
                  posts={exploreFeed}
                  onOpenProfile={(userId) => navigate(`/profile/${userId}`)}
                />
              </div>

              <div className="social-feed-post-stack space-stack-md">
                <div className={`social-card social-explore-filter-panel p-3 ${getStaggerEnterClass(3)}`}>
                  <div className="social-explore-filter-row">
                    {activeTag ? (
                      <>
                        <span className="social-explore-tag-chip">
                          <Hash className="h-3.5 w-3.5" />
                          <span>{activeTag}</span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="social-explore-clear-btn"
                          onClick={() => {
                            setActiveTag("");
                            setSearchParams((params) => {
                              const next = new URLSearchParams(params);
                              next.delete("tag");
                              return next;
                            });
                          }}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          Clear filter
                        </Button>
                      </>
                    ) : (
                      <span className="social-explore-filter-hint">
                        <Search className="h-3.5 w-3.5" />
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
                  <div className="social-card-empty social-explore-empty-state p-8 text-center">
                    <div className="social-explore-empty-icon" aria-hidden="true">
                      <SearchX className="h-5 w-5" />
                    </div>
                    <p className="social-text-main text-sm font-semibold">No posts match your current filters.</p>
                    <p className="social-text-muted mt-1 text-xs">Try another keyword or clear the current filter.</p>
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

            <div className="social-feed-right-column order-last xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100svh-2.5rem)] xl:overflow-y-auto xl:beautiful-scrollbar space-y-3 xl:space-y-4 xl:pr-0.5">
              <div className="xl:hidden">
                <SocialRightRail compact explorePosts={exploreFeed} />
              </div>

              <div className="hidden xl:block">
                <SocialRightRail embedded explorePosts={exploreFeed} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <SocialMiniChatDock />
    </SidebarProvider>
  );
};

export default ExplorePage;
