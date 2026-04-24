import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Lock, Crown, ShieldCheck, BadgeCheck, Ban } from "lucide-react";
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
import { useI18n } from "@/lib/i18n";

const ProfilePage = () => { // NOSONAR
  const { locale, t } = useI18n();
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
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US"),
    [locale],
  );

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

  const goPrevPhoto = useCallback(() => {
    if (!profilePhotos.length) {
      return;
    }

    setActivePhotoIndex((current) =>
      current === 0 ? profilePhotos.length - 1 : current - 1,
    );
  }, [profilePhotos.length]);

  const goNextPhoto = useCallback(() => {
    if (!profilePhotos.length) {
      return;
    }

    setActivePhotoIndex((current) =>
      current === profilePhotos.length - 1 ? 0 : current + 1,
    );
  }, [profilePhotos.length]);

  const handlePhotoDialogKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!hasPhotoDialogContent) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevPhoto();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNextPhoto();
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        setActivePhotoIndex(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        setActivePhotoIndex(Math.max(0, profilePhotos.length - 1));
      }
    },
    [goNextPhoto, goPrevPhoto, hasPhotoDialogContent, profilePhotos.length],
  );

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="social-page-shell">
        <div className="app-shell-panel social-shell-panel p-3 md:p-4">
          <section
            className="social-profile-layout social-profile-layout--command social-profile-frame min-h-0 overflow-y-auto beautiful-scrollbar space-stack-lg"
            aria-label={t("profile.aria.content")}
          >
            {loadingProfile && !profile ? (
              <ProfileHeaderSkeleton />
            ) : (
              <section
                className={`social-surface-card social-profile-hero social-profile-hero-card social-profile-hero-card--command overflow-hidden ${getStaggerEnterClass(0)}`}
                aria-label={t("profile.aria.header")}
              >
                <div className="social-profile-cover-gradient social-profile-cover social-profile-cover--command relative h-[350px] w-full">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.7),transparent_55%)]" />
                  <div className="social-profile-hero-atmosphere" aria-hidden="true">
                    <span className="social-profile-hero-orb social-profile-hero-orb--a" />
                    <span className="social-profile-hero-orb social-profile-hero-orb--b" />
                    <span className="social-profile-hero-orb social-profile-hero-orb--c" />
                  </div>
                </div>

                <div className="social-profile-body social-profile-body--command relative px-6 pb-5 pt-24">
                  <div className="social-profile-avatar-wrap social-profile-avatar-wrap--command absolute left-6 top-0 h-40 w-40 overflow-hidden rounded-full border-4 border-white shadow-sm">
                    <UserAvatar
                      type="profile"
                      name={profile?.displayName || t("profile.default_name")}
                      avatarUrl={profile?.avatarUrl ?? undefined}
                      previewable
                      className="size-full rounded-full"
                    />
                  </div>

                  <div className="social-profile-heading social-profile-heading--command flex flex-wrap items-end justify-between gap-4">
                    <div className="social-profile-identity space-y-1.5">
                      <div className="social-profile-meta-row">
                        <span className="social-profile-meta-pill">
                          {profile?._id === user?._id
                            ? t("profile.meta.your_profile")
                            : t("profile.meta.community_profile")}
                        </span>
                        <span className="social-profile-meta-pill social-profile-meta-pill--soft">
                          {t("profile.meta.photos_count", {
                            count: numberFormatter.format(profilePhotos.length),
                          })}
                        </span>
                      </div>

                      <h1 className="social-text-main social-profile-name text-3xl font-bold tracking-tight flex items-center gap-2">
                        {profile?.displayName || t("profile.default_name")}
                        {profile?.isVerified && (
                          <BadgeCheck className="size-6 text-blue-500" />
                        )}
                        {profile?.role === "admin" && (
                          <Crown className="size-6 text-amber-500" />
                        )}
                        {profile?.role === "moderator" && (
                          <ShieldCheck className="size-6 text-indigo-500" />
                        )}
                        {profile?.isBanned && (
                          <span className="inline-flex items-center gap-1 text-sm bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium ml-2">
                            <Ban className="size-3.5" /> Banned
                          </span>
                        )}
                      </h1>
                      <p className="social-text-muted social-profile-username text-sm">
                        @{profile?.username || t("profile.username_fallback")}
                      </p>
                      {profile?.bio && <p className="social-text-main social-profile-bio text-sm leading-relaxed">{profile.bio}</p>}

                      {/* Premium stat chips */}
                      <div className="social-profile-stat-grid social-profile-stat-grid--command pt-1">
                        {[
                          {
                            value: profile?.postCount ?? 0,
                            label: t("profile.stats.posts"),
                          },
                          {
                            value: profile?.friendCount ?? 0,
                            label: t("profile.stats.friends"),
                          },
                          {
                            value: profile?.followerCount ?? 0,
                            label: t("profile.stats.followers"),
                          },
                          {
                            value: profile?.followingCount ?? 0,
                            label: t("profile.stats.following"),
                          },
                        ].map(({ value, label }) => (
                          <div key={label} className="profile-stat-chip">
                            <span className="profile-stat-chip-value">
                              {numberFormatter.format(value)}
                            </span>
                            <span className="profile-stat-chip-label">{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="social-profile-actions social-profile-actions--command flex items-center gap-2 flex-wrap">
                      {profile?._id === user?._id ? (
                        <Button type="button" variant="secondary" className="social-profile-action-btn social-avatar-badge social-text-main transition-colors hover:opacity-90">
                          {t("profile.action.edit_profile")}
                        </Button>
                      ) : null}

                      {profile && user && profile._id !== user._id && (
                        <Button
                          type="button"
                          variant={profile.isFollowing ? "outline" : "default"}
                          className={profile.isFollowing ? "social-profile-action-btn follow-btn-following" : "social-profile-action-btn profile-action-gradient"}
                          onClick={() => toggleFollow(profile._id)}
                        >
                          {profile.isFollowing
                            ? t("profile.action.following")
                            : t("profile.action.follow")}
                        </Button>
                      )}

                      <div className="social-profile-backchat-wrap">
                        <BackToChatCard onClick={() => navigate("/")} />
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {profileAccessDenied ? (
              <div className={`access-denied-card ${getStaggerEnterClass(1)}`}>
                <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-primary/8 text-primary ring-8 ring-primary/5">
                  <Lock className="size-7" />
                </div>
                <h2 className="text-title-2 text-foreground">
                  {t("profile.private.title")}
                </h2>
                <p className="mt-2 text-body-sm text-muted-foreground/80 max-w-[280px] mx-auto leading-relaxed">
                  {t("profile.private.subtitle")}
                </p>
              </div>
            ) : (
              <div className={`social-profile-columns social-profile-columns--command grid gap-4 lg:grid-cols-[4fr_6fr] ${getStaggerEnterClass(1)}`}>
                <aside
                  className="social-profile-sidebar social-profile-sidebar--command lg:sticky lg:top-20 lg:self-start"
                  aria-label={t("profile.aria.highlights")}
                >
                  <div className="social-card social-profile-panel social-profile-panel--command p-4">
                    <h3 className="social-text-main text-base font-semibold">
                      {t("profile.about")}
                    </h3>
                    <p className="social-text-muted mt-2 text-sm">
                      {profile?.bio || t("profile.no_bio")}
                    </p>
                  </div>
                  <div className="social-card social-profile-panel social-profile-panel--command p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="social-text-main text-base font-semibold">
                        {t("profile.photos")}
                      </h3>
                      {profilePhotos.length > 0 ? (
                        <button
                          type="button"
                          className="social-profile-photos-link"
                          onClick={() => openPhotoViewer(profilePhotos[0])}
                        >
                          {t("profile.photos.view_all", {
                            count: numberFormatter.format(profilePhotos.length),
                          })}
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
                                alt={t("profile.photos.alt", { index: index + 1 })}
                                className="social-profile-photo-image"
                                loading="lazy"
                              />
                              {showMore ? (
                                <span className="social-profile-photo-more">
                                  {t("profile.photos.remaining", {
                                    count: numberFormatter.format(remaining),
                                  })}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="social-text-muted mt-2 text-sm">
                        {t("profile.photos.empty")}
                      </p>
                    )}
                  </div>
                  <div className="social-card social-profile-panel social-profile-panel--command p-4">
                    <h3 className="social-text-main text-base font-semibold">
                      {t("profile.friends")}
                    </h3>
                    <p className="social-text-muted mt-1 text-sm">
                      {t("profile.friends.count", {
                        count: numberFormatter.format(profile?.friendCount || 0),
                      })}
                    </p>

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
                      <p className="social-text-muted mt-2 text-sm">
                        {t("profile.friends.empty")}
                      </p>
                    )}
                  </div>
                </aside>

                <section
                  className="social-profile-main social-profile-main--command"
                  aria-label={t("profile.aria.timeline")}
                >
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
                      {t("profile.posts.empty")}
                    </div>
                  )}
                </section>
              </div>
            )}

            {profilePagination.hasNextPage && !profileAccessDenied && (
              <div className="flex justify-center">
                {loadingProfile ? (
                  <LoadingMoreSkeleton />
                ) : (
                  <Button type="button" variant="outline" onClick={loadMore}>
                    {t("profile.load_more")}
                  </Button>
                )}
              </div>
            )}
          </section>

          <Dialog open={photosDialogOpen} onOpenChange={setPhotosDialogOpen}>
            <DialogContent
              contentClassMode="bare"
              className="social-lightbox-dialog social-profile-photo-dialog max-w-[min(96vw,1200px)] sm:max-w-5xl p-3 sm:p-4"
              onKeyDown={handlePhotoDialogKeyDown}
            >
              <DialogHeader className="social-profile-photo-dialog-head">
                <div className="social-profile-photo-dialog-title-row">
                  <DialogTitle className="social-profile-photo-dialog-title">
                    {t("profile.dialog.photos_title")}
                  </DialogTitle>
                  {hasPhotoDialogContent ? (
                    <span className="social-profile-photo-counter">
                      {t("profile.dialog.counter", {
                        current: numberFormatter.format(activePhotoIndex + 1),
                        total: numberFormatter.format(profilePhotos.length),
                      })}
                    </span>
                  ) : null}
                </div>

                <DialogDescription className="social-profile-photo-dialog-description">
                  {profilePhotos.length
                    ? t("profile.dialog.description", {
                        current: numberFormatter.format(activePhotoIndex + 1),
                        total: numberFormatter.format(profilePhotos.length),
                      })
                    : t("profile.dialog.no_photos")}
                </DialogDescription>

                {hasPhotoDialogContent ? (
                  <div className="social-profile-photo-progress" aria-hidden="true">
                    <span style={{ width: `${photoProgress}%` }} />
                  </div>
                ) : null}
              </DialogHeader>

              <div
                className="social-lightbox-stage social-profile-photo-stage relative mt-2 flex h-[75vh] items-center justify-center overflow-hidden rounded-xl"
                aria-label={t("profile.dialog.viewer_aria")}
              >
                <div className="social-profile-photo-stage-glow" aria-hidden="true" />

                {activePhotoUrl ? (
                  <img
                    src={activePhotoUrl}
                    alt={t("profile.photos.alt", { index: activePhotoIndex + 1 })}
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
                      aria-label={t("profile.dialog.prev_photo")}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="social-profile-photo-nav social-profile-photo-nav--next absolute right-3 top-1/2 -translate-y-1/2"
                      onClick={goNextPhoto}
                      aria-label={t("profile.dialog.next_photo")}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </>
                ) : null}
              </div>

              {dialogPhotoStrip.length > 1 ? (
                <div
                  className="social-profile-photo-strip beautiful-scrollbar"
                  aria-label={t("profile.dialog.thumbnails_aria")}
                >
                  {dialogPhotoStrip.map(({ url, index }) => (
                    <button
                      key={`${url}-${index}`}
                      type="button"
                      className={`social-profile-photo-thumb ${index === activePhotoIndex ? "is-active" : ""}`}
                      onClick={() => setActivePhotoIndex(index)}
                    >
                      <img
                        src={url}
                        alt={t("profile.dialog.gallery_item_alt", {
                          index: index + 1,
                        })}
                        loading="lazy"
                      />
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
