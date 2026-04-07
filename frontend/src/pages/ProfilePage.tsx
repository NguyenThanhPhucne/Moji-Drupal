import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import BackToChatCard from "@/components/chat/BackToChatCard";
import UserAvatar from "@/components/chat/UserAvatar";
import SocialPostCard from "@/components/social/SocialPostCard";
import ProfileHeaderSkeleton from "@/components/skeleton/ProfileHeaderSkeleton";
import SocialPostSkeleton from "@/components/skeleton/SocialPostSkeleton";
import LoadingMoreSkeleton from "@/components/skeleton/LoadingMoreSkeleton";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocialStore } from "@/stores/useSocialStore";
import { getStaggerEnterClass } from "@/lib/utils";

const ProfilePage = () => {
  const navigate = useNavigate();
  const { userId: userIdFromRoute } = useParams<{ userId: string }>();
  const { accessToken, user } = useAuthStore();
  const {
    profile,
    profilePosts,
    profilePagination,
    postComments,
    postCommentsPagination,
    postCommentsSortBy,
    loadingCommentsByPost,
    postEngagement,
    profileAccessDenied,
    loadingProfile,
    fetchProfile,
    fetchProfilePosts,
    toggleLike,
    fetchComments,
    loadMoreComments,
    setCommentsSortBy,
    fetchPostEngagement,
    addComment,
    toggleFollow,
  } = useSocialStore();

  const profileUserId = useMemo(
    () => userIdFromRoute || user?._id || "",
    [userIdFromRoute, user?._id],
  );

  useEffect(() => {
    if (!accessToken || !user || !profileUserId) {
      return;
    }

    const loadProfile = async () => {
      const canView = await fetchProfile(profileUserId);
      if (canView) {
        await fetchProfilePosts(profileUserId, 1, false);
      }
    };

    loadProfile();
  }, [accessToken, user, profileUserId, fetchProfile, fetchProfilePosts]);

  const loadMore = async () => {
    if (!profileUserId || !profilePagination.hasNextPage || loadingProfile) {
      return;
    }

    await fetchProfilePosts(profileUserId, profilePagination.page + 1, true);
  };

  const isInitialProfileLoading = loadingProfile && profilePosts.length === 0;
  const isLoadingMoreProfile = loadingProfile && profilePosts.length > 0;

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="app-shell-bg">
        <div className="app-shell-panel p-4 md:p-6">
          <section className="w-full min-h-0 overflow-y-auto beautiful-scrollbar pr-1 space-stack-lg">
            {loadingProfile && !profile ? (
              <ProfileHeaderSkeleton />
            ) : (
              <div className="elevated-card p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <UserAvatar
                      type="profile"
                      name={profile?.displayName || "Profile"}
                      avatarUrl={profile?.avatarUrl ?? undefined}
                      className="size-16 text-xl shadow-none shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="section-eyebrow">Profile</p>
                      <h1 className="text-title-1">
                        {profile?.displayName || "Profile"}
                      </h1>
                      <p className="text-body-sm text-muted-foreground">
                        @{profile?.username || "user"}
                      </p>
                      {profile?.bio && (
                        <p className="mt-2 text-body-sm text-foreground/90">
                          {profile.bio}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <span>{profile?.postCount || 0} posts</span>
                        <span>{profile?.followerCount || 0} followers</span>
                        <span>{profile?.followingCount || 0} following</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {profile && user && profile._id !== user._id && (
                      <Button
                        type="button"
                        variant={profile.isFollowing ? "outline" : "default"}
                        onClick={() => toggleFollow(profile._id)}
                      >
                        {profile.isFollowing ? "Following" : "Follow"}
                      </Button>
                    )}
                    <BackToChatCard onClick={() => navigate("/")} />
                  </div>
                </div>
              </div>
            )}

            {profileAccessDenied ? (
              <div className="elevated-card p-8 text-center">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Lock className="size-6" />
                </div>
                <h2 className="text-title-2">
                  Only friends can view this profile
                </h2>
                <p className="mt-2 text-body-sm text-muted-foreground">
                  Send a friend request and connect to unlock this profile.
                </p>
              </div>
            ) : (
              <div className="space-stack-md">
                {isInitialProfileLoading && <SocialPostSkeleton count={2} />}
                {profilePosts.map((post, index) => (
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
                      onOpenProfile={(id) => navigate(`/profile/${id}`)}
                    />
                  </div>
                ))}
                {isLoadingMoreProfile && (
                  <SocialPostSkeleton
                    count={2}
                    staggerFrom={profilePosts.length}
                  />
                )}
                {!loadingProfile && profilePosts.length === 0 && (
                  <div className="elevated-card p-8 text-center text-muted-foreground">
                    No posts yet.
                  </div>
                )}
              </div>
            )}

            {profilePagination.hasNextPage && !profileAccessDenied && (
              <div className="flex justify-center">
                {loadingProfile ? (
                  <LoadingMoreSkeleton />
                ) : (
                  <Button type="button" variant="outline" onClick={loadMore}>
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

export default ProfilePage;
