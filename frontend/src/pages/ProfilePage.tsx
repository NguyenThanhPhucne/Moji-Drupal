import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Lock, UserRound } from "lucide-react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import BackToChatCard from "@/components/chat/BackToChatCard";
import SocialPostCard from "@/components/social/SocialPostCard";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocialStore } from "@/stores/useSocialStore";

const ProfilePage = () => {
  const navigate = useNavigate();
  const { userId: userIdFromRoute } = useParams<{ userId: string }>();
  const { accessToken, user } = useAuthStore();
  const {
    profile,
    profilePosts,
    profilePagination,
    postComments,
    postEngagement,
    profileAccessDenied,
    loadingProfile,
    fetchProfile,
    fetchProfilePosts,
    toggleLike,
    fetchComments,
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

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="app-shell-bg">
        <div className="app-shell-panel p-4 md:p-6">
          <section className="w-full min-h-0 overflow-y-auto beautiful-scrollbar pr-1 space-stack-lg">
            <div className="elevated-card p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <UserRound className="size-8" />
                  </div>
                  <div>
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

            {profileAccessDenied ? (
              <div className="elevated-card p-8 text-center">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Lock className="size-6" />
                </div>
                <h2 className="text-title-3">
                  Only friends can view this profile
                </h2>
                <p className="mt-2 text-body-sm text-muted-foreground">
                  Send a friend request and connect to unlock this profile.
                </p>
              </div>
            ) : (
              <div className="space-stack-md">
                {profilePosts.map((post) => (
                  <SocialPostCard
                    key={post._id}
                    post={post}
                    comments={postComments[post._id]}
                    engagement={postEngagement[post._id]}
                    onLike={toggleLike}
                    onFetchComments={fetchComments}
                    onFetchEngagement={fetchPostEngagement}
                    onComment={addComment}
                    onOpenProfile={(id) => navigate(`/profile/${id}`)}
                  />
                ))}
                {!loadingProfile && profilePosts.length === 0 && (
                  <div className="elevated-card p-8 text-center text-muted-foreground">
                    No posts yet.
                  </div>
                )}
              </div>
            )}

            {profilePagination.hasNextPage && !profileAccessDenied && (
              <div className="flex justify-center">
                <Button type="button" variant="outline" onClick={loadMore}>
                  {loadingProfile ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ProfilePage;
