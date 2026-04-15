import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import BackToChatCard from "@/components/chat/BackToChatCard";
import SocialPostCard from "@/components/social/SocialPostCard";
import SocialTopHeader from "@/components/social/SocialTopHeader";
import SocialPostSkeleton from "@/components/skeleton/SocialPostSkeleton";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { socialService } from "@/services/socialService";
import { useSocialStore } from "@/stores/useSocialStore";
import type { SocialPost } from "@/types/social";

const PostDetailPage = () => {
  const navigate = useNavigate();
  const { postId = "" } = useParams<{ postId: string }>();
  const {
    postComments,
    postCommentsPagination,
    postCommentsSortBy,
    loadingCommentsByPost,
    postEngagement,
    toggleLike,
    deletePost,
    deleteComment,
    fetchComments,
    loadMoreComments,
    setCommentsSortBy,
    fetchPostEngagement,
    addComment,
  } = useSocialStore();

  const [post, setPost] = useState<SocialPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!postId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let alive = true;

    const loadPost = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const result = await socialService.getPostById(postId);
        if (alive) {
          setPost(result);
        }
      } catch {
        if (alive) {
          setNotFound(true);
          setPost(null);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    void loadPost();

    return () => {
      alive = false;
    };
  }, [postId]);

  const heading = useMemo(() => {
    if (loading) {
      return "Loading post";
    }

    if (notFound) {
      return "Post not available";
    }

    return "Post detail";
  }, [loading, notFound]);

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="social-page-shell">
        <div className="app-shell-panel social-shell-panel p-4 md:p-6">
          <section
            className="social-feed-column w-full min-h-0 overflow-y-auto beautiful-scrollbar pr-1 space-stack-lg"
            aria-label="Post detail content"
          >
            <SocialTopHeader
              title={heading}
              subtitle="Shared post detail"
              searchPlaceholder="Search people or posts"
            />

            <div className="flex items-center gap-2 self-start sm:self-auto">
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                  <ArrowLeft className="mr-2 size-4" />
                  Back
                </Button>
                <BackToChatCard onClick={() => navigate("/")} />
            </div>

            {loading && (
              <div role="status" aria-live="polite" aria-label="Loading post detail">
                <SocialPostSkeleton count={1} />
              </div>
            )}

            {!loading && notFound && (
              <div className="social-card-empty p-8 text-center" role="status" aria-live="polite">
                This post could not be found or you do not have access.
              </div>
            )}

            {!loading && post && (
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
                onDeletePost={async (id) => {
                  const ok = await deletePost(id);
                  if (ok) {
                    navigate("/feed");
                  }
                  return ok;
                }}
                onDeleteComment={deleteComment}
                onOpenProfile={(userId) => navigate(`/profile/${userId}`)}
                onSelectTag={(tag) => navigate(`/explore?tag=${encodeURIComponent(tag)}`)}
              />
            )}
          </section>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default PostDetailPage;
