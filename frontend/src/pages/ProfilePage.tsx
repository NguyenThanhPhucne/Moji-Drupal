import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import BackToChatCard from "@/components/chat/BackToChatCard";
import UserAvatar from "@/components/chat/UserAvatar";
import PostComposer from "@/components/social/PostComposer";
import SocialMiniChatDock from "@/components/social/SocialMiniChatDock";
import SocialPostCard from "@/components/social/SocialPostCard";
import ProfileHeaderSkeleton from "@/components/skeleton/ProfileHeaderSkeleton";
import SocialPostSkeleton from "@/components/skeleton/SocialPostSkeleton";
import LoadingMoreSkeleton from "@/components/skeleton/LoadingMoreSkeleton";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocialStore } from "@/stores/useSocialStore";
import { getStaggerEnterClass } from "@/lib/utils";

const ProfilePage = () => { // NOSONAR
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
    deletePost,
    deleteComment,
    fetchComments,
    loadMoreComments,
    setCommentsSortBy,
    fetchPostEngagement,
    addComment,
    createPost,
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
  const [photosDialogOpen, setPhotosDialogOpen] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  const profilePhotos = useMemo(
    () =>
      profilePosts
        .flatMap((post) => post.mediaUrls || [])
        .filter((url): url is string => Boolean(url)),
    [profilePosts],
  );

  const photoPreview = useMemo(() => profilePhotos.slice(0, 9), [profilePhotos]);
  const hasPhotoDialogContent = profilePhotos.length > 0;
  const canBrowsePhotos = profilePhotos.length > 1;
  const activePhotoUrl = hasPhotoDialogContent
    ? profilePhotos[activePhotoIndex]
    : null;
  const photoProgress = hasPhotoDialogContent
    ? ((activePhotoIndex + 1) / profilePhotos.length) * 100
    : 0;

  const dialogPhotoStrip = useMemo(() => {
    if (!profilePhotos.length) {
      return [] as Array<{ url: string; index: number }>;
    }

    const maxThumbs = 9;
    if (profilePhotos.length <= maxThumbs) {
      return profilePhotos.map((url, index) => ({ url, index }));
    }

    const halfWindow = Math.floor(maxThumbs / 2);
    let start = Math.max(0, activePhotoIndex - halfWindow);
    start = Math.min(start, profilePhotos.length - maxThumbs);

    return profilePhotos
      .slice(start, start + maxThumbs)
      .map((url, offset) => ({ url, index: start + offset }));
  }, [activePhotoIndex, profilePhotos]);

  const openPhotoViewer = (photoUrl: string) => {
    const index = profilePhotos.indexOf(photoUrl);
    setActivePhotoIndex(Math.max(index, 0));
    setPhotosDialogOpen(true);
  };

  const goPrevPhoto = () => {
    if (!profilePhotos.length) {
      return;
    }

    setActivePhotoIndex((current) =>
      current === 0 ? profilePhotos.length - 1 : current - 1,
    );
  };

  const goNextPhoto = () => {
    if (!profilePhotos.length) {
      return;
    }

    setActivePhotoIndex((current) =>
      current === profilePhotos.length - 1 ? 0 : current + 1,
    );
  };

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="social-page-shell">
        <div className="app-shell-panel social-shell-panel p-3 md:p-4">
          <section className="social-profile-layout social-profile-frame min-h-0 overflow-y-auto beautiful-scrollbar space-stack-lg">
            {loadingProfile && !profile ? (
              <ProfileHeaderSkeleton />
            ) : (
              <div className={`social-surface-card social-profile-hero overflow-hidden ${getStaggerEnterClass(0)}`}>
                <div className="social-profile-cover-gradient social-profile-cover relative h-[350px] w-full">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.7),transparent_55%)]" />
                  <div className="social-profile-hero-atmosphere" aria-hidden="true">
                    <span className="social-profile-hero-orb social-profile-hero-orb--a" />
                    <span className="social-profile-hero-orb social-profile-hero-orb--b" />
                    <span className="social-profile-hero-orb social-profile-hero-orb--c" />
                  </div>
                </div>

                <div className="social-profile-body relative px-6 pb-5 pt-24">
                  <div className="social-profile-avatar-wrap absolute left-6 top-0 h-40 w-40 overflow-hidden rounded-full border-4 border-white shadow-sm">
                    <UserAvatar
                      type="profile"
                      name={profile?.displayName || "Profile"}
                      avatarUrl={profile?.avatarUrl ?? undefined}
                      previewable
                      className="size-full rounded-full"
                    />
                  </div>

                  <div className="social-profile-heading flex flex-wrap items-end justify-between gap-4">
                    <div className="social-profile-identity space-y-1.5">
                      <div className="social-profile-meta-row">
                        <span className="social-profile-meta-pill">
                          {profile?._id === user?._id ? "Your profile" : "Community profile"}
                        </span>
                        <span className="social-profile-meta-pill social-profile-meta-pill--soft">
                          {profilePhotos.length} photos
                        </span>
                      </div>

                      <h1 className="social-text-main social-profile-name text-3xl font-bold tracking-tight">
                        {profile?.displayName || "Profile"}
                      </h1>
                      <p className="social-text-muted social-profile-username text-sm">@{profile?.username || "user"}</p>
                      {profile?.bio && <p className="social-text-main social-profile-bio text-sm leading-relaxed">{profile.bio}</p>}

                      {/* Premium stat chips */}
                      <div className="social-profile-stat-grid pt-1">
                        {[
                          { value: profile?.postCount ?? 0, label: "Posts" },
                          { value: profile?.friendCount ?? 0, label: "Friends" },
                          { value: profile?.followerCount ?? 0, label: "Followers" },
                          { value: profile?.followingCount ?? 0, label: "Following" },
                        ].map(({ value, label }) => (
                          <div key={label} className="profile-stat-chip">
                            <span className="profile-stat-chip-value">{value.toLocaleString()}</span>
                            <span className="profile-stat-chip-label">{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="social-profile-actions flex items-center gap-2 flex-wrap">
                      {profile?._id === user?._id ? (
                        <Button type="button" variant="secondary" className="social-profile-action-btn social-avatar-badge social-text-main hover:opacity-90 transition-all hover:shadow-md">
                          Edit profile
                        </Button>
                      ) : null}

                      {profile && user && profile._id !== user._id && (
                        <Button
                          type="button"
                          variant={profile.isFollowing ? "outline" : "default"}
                          className={profile.isFollowing ? "social-profile-action-btn follow-btn-following" : "social-profile-action-btn profile-action-gradient"}
                          onClick={() => toggleFollow(profile._id)}
                        >
                          {profile.isFollowing ? "Following" : "Follow"}
                        </Button>
                      )}

                      <div className="social-profile-backchat-wrap">
                        <BackToChatCard onClick={() => navigate("/")} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {profileAccessDenied ? (
              <div className={`access-denied-card ${getStaggerEnterClass(1)}`}>
                <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-primary/8 text-primary ring-8 ring-primary/5">
                  <Lock className="size-7" />
                </div>
                <h2 className="text-title-2 text-foreground">
                  Private profile
                </h2>
                <p className="mt-2 text-body-sm text-muted-foreground/80 max-w-[280px] mx-auto leading-relaxed">
                  Only friends can view this profile. Send a friend request to unlock their posts and photos.
                </p>
              </div>
            ) : (
              <div className={`social-profile-columns grid gap-4 lg:grid-cols-[4fr_6fr] ${getStaggerEnterClass(1)}`}>
                <aside className="social-profile-sidebar lg:sticky lg:top-20 lg:self-start">
                  <div className="social-card social-profile-panel p-4">
                    <h3 className="social-text-main text-base font-semibold">About</h3>
                    <p className="social-text-muted mt-2 text-sm">{profile?.bio || "No bio yet"}</p>
                  </div>
                  <div className="social-card social-profile-panel p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="social-text-main text-base font-semibold">Photos</h3>
                      {profilePhotos.length > 0 ? (
                        <button
                          type="button"
                          className="social-profile-photos-link"
                          onClick={() => openPhotoViewer(profilePhotos[0])}
                        >
                          View all ({profilePhotos.length})
                        </button>
                      ) : null}
                    </div>

                    {photoPreview.length > 0 ? (
                      <div className="social-profile-photos-grid mt-3">
                        {photoPreview.map((photoUrl, index) => {
                          const remaining = profilePhotos.length - photoPreview.length;
                          const showMore = index === photoPreview.length - 1 && remaining > 0;

                          return (
                            <button
                              key={`${photoUrl}-${index}`}
                              type="button"
                              className="social-profile-photo-tile"
                              onClick={() => openPhotoViewer(photoUrl)}
                            >
                              <img
                                src={photoUrl}
                                alt={`Profile ${index + 1}`}
                                className="social-profile-photo-image"
                                loading="lazy"
                              />
                              {showMore ? (
                                <span className="social-profile-photo-more">+{remaining}</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="social-text-muted mt-2 text-sm">No photos yet.</p>
                    )}
                  </div>
                  <div className="social-card social-profile-panel p-4">
                    <h3 className="social-text-main text-base font-semibold">Friends</h3>
                    <p className="social-text-muted mt-1 text-sm">{profile?.friendCount || 0} friends</p>

                    {profile?.friendsPreview?.length ? (
                      <div className="social-friends-preview-grid mt-3">
                        {profile.friendsPreview.map((friend) => (
                          <button
                            key={friend._id}
                            type="button"
                            className="social-friend-chip"
                            onClick={() => navigate(`/profile/${friend._id}`)}
                          >
                            <UserAvatar
                              type="sidebar"
                              name={friend.displayName}
                              avatarUrl={friend.avatarUrl ?? undefined}
                              className="social-friend-chip-avatar"
                            />
                            <span className="social-friend-chip-name">{friend.displayName}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="social-text-muted mt-2 text-sm">No friends to show yet.</p>
                    )}
                  </div>
                </aside>

                <div className="social-profile-main">
                  {profile?._id === user?._id && (
                    <PostComposer onCreate={createPost} />
                  )}

                  {isInitialProfileLoading && <SocialPostSkeleton count={2} />}
                  {profilePosts.map((post, index) => (
                    <div
                      key={post._id}
                      className="feed-card-stagger"
                      style={{ animationDelay: `${Math.min(index, 10) * 48}ms` }}
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
                        onOpenProfile={(id) => navigate(`/profile/${id}`)}
                      />
                    </div>
                  ))}
                  {isLoadingMoreProfile && (
                    <SocialPostSkeleton count={2} staggerFrom={profilePosts.length} />
                  )}
                  {!loadingProfile && profilePosts.length === 0 && (
                    <div className="social-card-empty p-8 text-center">
                      No posts yet.
                    </div>
                  )}
                </div>
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

          <Dialog open={photosDialogOpen} onOpenChange={setPhotosDialogOpen}>
            <DialogContent
              contentClassMode="bare"
              className="social-lightbox-dialog social-profile-photo-dialog max-w-[min(96vw,1200px)] sm:max-w-5xl p-3 sm:p-4"
            >
              <DialogHeader className="social-profile-photo-dialog-head">
                <div className="social-profile-photo-dialog-title-row">
                  <DialogTitle className="social-profile-photo-dialog-title">Photos</DialogTitle>
                  {hasPhotoDialogContent ? (
                    <span className="social-profile-photo-counter">
                      {activePhotoIndex + 1}/{profilePhotos.length}
                    </span>
                  ) : null}
                </div>

                <DialogDescription className="social-profile-photo-dialog-description">
                  {profilePhotos.length
                    ? `${activePhotoIndex + 1}/${profilePhotos.length} | Browse photos from this profile's posts.`
                    : "No photos available."}
                </DialogDescription>

                {hasPhotoDialogContent ? (
                  <div className="social-profile-photo-progress" aria-hidden="true">
                    <span style={{ width: `${photoProgress}%` }} />
                  </div>
                ) : null}
              </DialogHeader>

              <div className="social-lightbox-stage social-profile-photo-stage relative mt-2 flex h-[75vh] items-center justify-center overflow-hidden rounded-xl">
                <div className="social-profile-photo-stage-glow" aria-hidden="true" />

                {activePhotoUrl ? (
                  <img
                    src={activePhotoUrl}
                    alt={`Profile ${activePhotoIndex + 1}`}
                    className="social-profile-photo-active max-h-full max-w-full object-contain"
                  />
                ) : null}

                {canBrowsePhotos ? (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="social-profile-photo-nav social-profile-photo-nav--prev absolute left-3 top-1/2 -translate-y-1/2"
                      onClick={goPrevPhoto}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="social-profile-photo-nav social-profile-photo-nav--next absolute right-3 top-1/2 -translate-y-1/2"
                      onClick={goNextPhoto}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </>
                ) : null}
              </div>

              {dialogPhotoStrip.length > 1 ? (
                <div className="social-profile-photo-strip beautiful-scrollbar" aria-label="Photo thumbnails">
                  {dialogPhotoStrip.map(({ url, index }) => (
                    <button
                      key={`${url}-${index}`}
                      type="button"
                      className={`social-profile-photo-thumb ${index === activePhotoIndex ? "is-active" : ""}`}
                      onClick={() => setActivePhotoIndex(index)}
                    >
                      <img src={url} alt={`Gallery item ${index + 1}`} loading="lazy" />
                    </button>
                  ))}
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <SocialMiniChatDock />
    </SidebarProvider>
  );
};

export default ProfilePage;
