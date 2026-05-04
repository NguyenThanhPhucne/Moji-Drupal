import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Trash2, UserRound, Users } from "lucide-react";

import { userService } from "@/services/userService";
import { useSocketStore } from "@/stores/useSocketStore";
import type { ProfileLite } from "@/types/chat";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Skeleton } from "../ui/skeleton";

interface FriendProfileMiniCardProps {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  children: React.ReactNode;
  onViewProfile?: () => void;
  onChat?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}

const FriendProfileMiniCard = (
  props: Readonly<FriendProfileMiniCardProps>,
) => {
  const {
    userId,
    displayName,
    avatarUrl,
    children,
    onViewProfile,
    onChat,
    onRemove,
    disabled,
  } = props;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  useEffect(() => {
    if (!open || profile || loading) {
      return;
    }

    const loadProfile = async () => {
      try {
        setLoading(true);
        const result = await userService.getProfileLite(userId);
        setProfile(result);
      } catch (error) {
        console.error("Error loading profile-lite", error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [open, profile, loading, userId]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        globalThis.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleOpen = () => {
    if (closeTimerRef.current) {
      globalThis.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpen(true);
  };

  const handleCloseSoon = () => {
    if (closeTimerRef.current) {
      globalThis.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = globalThis.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  };

  const resolvedProfile = profile || {
    _id: userId,
    displayName,
    username: "",
    avatarUrl,
    bio: "",
    lastActiveAt: null,
    mutualGroupsCount: 0,
    mutualGroups: [],
  };

  const { getUserPresence, getLastActiveAt } = useSocketStore();
  const presence = getUserPresence(userId);
  const realTimeLastActive = getLastActiveAt(userId);

  const finalLastActiveAt = realTimeLastActive || resolvedProfile.lastActiveAt;

  let lastActiveText = "No recent activity";
  if (presence === "online") {
    lastActiveText = "Active now";
  } else if (finalLastActiveAt) {
    lastActiveText = formatDistanceToNow(new Date(finalLastActiveAt), {
      addSuffix: true,
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onMouseEnter={handleOpen}
          onMouseLeave={handleCloseSoon}
          onClick={() => setOpen((prev) => !prev)}
          aria-label={`Open profile quick card for ${displayName}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="rounded-full outline-none disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
        >
          {children}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={10}
        className="chat-profile-mini-card-shell w-80 p-0 overflow-hidden"
        onMouseEnter={handleOpen}
        onMouseLeave={handleCloseSoon}
      >
        <div className="chat-profile-mini-card-body space-y-3 p-4">
          <div className="flex items-start gap-3">
            <div className="chat-profile-mini-card-avatar size-11 overflow-hidden rounded-full shrink-0 bg-muted">
              {resolvedProfile.avatarUrl ? (
                <img
                  src={resolvedProfile.avatarUrl}
                  alt={resolvedProfile.displayName}
                  className="size-full object-cover"
                />
              ) : (
                <div className="size-full flex items-center justify-center text-sm font-semibold text-muted-foreground">
                  {resolvedProfile.displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">
                {resolvedProfile.displayName}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {resolvedProfile.username
                  ? `@${resolvedProfile.username}`
                  : "@unknown"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {presence === "online" ? lastActiveText : `Last active ${lastActiveText}`}
              </p>
            </div>
          </div>

          <div className="chat-profile-mini-card-section rounded-lg p-3">
            <p className="chat-profile-mini-card-section-title text-xs font-medium mb-1">Bio</p>
            {loading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-5/6" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {resolvedProfile.bio || "No bio yet."}
              </p>
            )}
          </div>

          <div className="chat-profile-mini-card-section chat-profile-mini-card-section--secondary rounded-lg p-3">
            <p className="text-xs font-medium mb-1.5 flex items-center gap-1">
              <Users className="size-3.5" />
              Mutual groups ({resolvedProfile.mutualGroupsCount})
            </p>
            {loading ? (
              <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {resolvedProfile.mutualGroups.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    No mutual groups
                  </span>
                )}
                {resolvedProfile.mutualGroups.slice(0, 3).map((groupItem) => (
                  <span
                    key={groupItem._id}
                    className="chat-profile-mini-card-chip rounded-full px-2 py-1 text-[11px]"
                  >
                    {groupItem.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="chat-profile-mini-card-actions flex items-center gap-2">
            {onViewProfile && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="chat-profile-mini-card-action flex-1"
                onClick={onViewProfile}
                disabled={disabled}
              >
                <UserRound className="size-4" />
                Profile
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="chat-profile-mini-card-action chat-profile-mini-card-action--primary flex-1"
              onClick={onChat}
              disabled={disabled}
            >
              <MessageCircle className="size-4" />
              Chat
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="chat-profile-mini-card-action chat-profile-mini-card-action--danger text-destructive hover:text-destructive"
              onClick={onRemove}
              disabled={disabled}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default FriendProfileMiniCard;
