import type { User } from "@/types/user";
import { useSocketStore } from "@/stores/useSocketStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { userService } from "@/services/userService";
import { useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProfileHeroProps {
  user: User | null;
}

const COVER_GRADIENTS = [
  "linear-gradient(135deg, #1e3a5f, #0ea5e9)",
  "linear-gradient(135deg, #312e81, #7c3aed)",
  "linear-gradient(135deg, #134e4a, #0d9488)",
  "linear-gradient(135deg, #78350f, #f59e0b)",
  "linear-gradient(135deg, #881337, #e11d48)",
  "linear-gradient(135deg, #1e293b, #475569)",
];

const ProfileHero = ({ user }: ProfileHeroProps) => {
  const { getUserPresence } = useSocketStore();
  const { setUser } = useAuthStore();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverHovered, setIsHovered] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  if (!user) return null;

  const presence = getUserPresence(user._id);
  const PRESENCE_MAP: Record<string, { dot: string; ring: string; label: string }> = {
    online:           { dot: "bg-green-500 animate-pulse", ring: "ring-green-500", label: "Online" },
    "recently-active": { dot: "bg-amber-500", ring: "ring-amber-500", label: "Recently active" },
  };
  const presenceConfig = PRESENCE_MAP[presence ?? ""] ?? { dot: "bg-slate-400", ring: "ring-slate-400", label: "Offline" };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await userService.uploadAvatar(formData);
      setUser({ ...user, avatarUrl: data.avatarUrl });
      toast.success("Avatar updated!");
    } catch {
      toast.error("Avatar upload failed");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await userService.uploadCoverPhoto(formData);
      setUser({ ...user, coverPhotoUrl: data.coverPhotoUrl } as User);
      toast.success("Cover photo updated!");
    } catch {
      toast.error("Cover photo upload failed");
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const handleRemoveCover = async () => {
    try {
      await userService.removeCoverPhoto();
      setUser({ ...user, coverPhotoUrl: undefined } as User);
      toast.success("Cover photo removed");
    } catch {
      toast.error("Failed to remove cover photo");
    }
  };

  const fallbackGradient = COVER_GRADIENTS[user.displayName.charCodeAt(0) % COVER_GRADIENTS.length];
  const coverUrl = (user as User & { coverPhotoUrl?: string }).coverPhotoUrl;

  return (
    <div className="profile-hero">
      {/* Cover Photo */}
      <div
        className="profile-cover"
        style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : { background: fallbackGradient }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {uploadingCover && (
          <div className="profile-cover-uploading">
            <div className="profile-cover-spinner" />
          </div>
        )}

        {/* Cover Actions */}
        <div className={cn("profile-cover-actions", coverHovered && "profile-cover-actions--visible")}>
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className="profile-cover-btn"
          >
            <ImagePlus className="size-3.5" />
            {coverUrl ? "Change Cover" : "Upload Cover"}
          </button>
          {coverUrl && (
            <button
              type="button"
              onClick={handleRemoveCover}
              className="profile-cover-btn profile-cover-btn--danger"
            >
              <Trash2 className="size-3.5" />
              Remove
            </button>
          )}
        </div>

        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleCoverUpload}
        />
      </div>

      {/* Avatar + Info Row */}
      <div className="profile-hero-body">
        {/* Avatar */}
        <div className="profile-avatar-wrap">
          <div className={cn("profile-avatar-ring", presenceConfig.ring)}>
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName}
                className="profile-avatar-img"
              />
            ) : (
              <div className="profile-avatar-fallback">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            {uploadingAvatar && (
              <div className="profile-avatar-uploading">
                <div className="profile-cover-spinner" />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="profile-avatar-cam-btn"
            title="Change avatar"
          >
            <Camera className="size-3.5" />
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
        </div>

        {/* Name + Status */}
        <div className="profile-hero-info">
          <h2 className="profile-hero-name">{user.displayName}</h2>
          <p className="profile-hero-username">@{user.username}</p>
        </div>

        {/* Online Pill */}
        <div className="profile-presence-pill">
          <span className={cn("profile-presence-dot", presenceConfig.dot)} />
          {presenceConfig.label}
        </div>
      </div>
    </div>
  );
};

export default ProfileHero;
