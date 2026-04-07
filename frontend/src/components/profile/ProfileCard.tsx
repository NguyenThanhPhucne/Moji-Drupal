import type { User } from "@/types/user";
import { Card, CardContent } from "../ui/card";
import UserAvatar from "../chat/UserAvatar";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";
import { useSocketStore } from "@/stores/useSocketStore";
import AvatarUploader from "./AvatarUploader";

interface ProfileCardProps {
  user: User | null;
}

const ProfileCard = ({ user }: ProfileCardProps) => {
  const { getUserPresence } = useSocketStore();
  if (!user) return null;

  if (!user.bio) {
    user.bio = "Always learning, always building.";
  }

  const presence = getUserPresence(user._id);
  let badgeClassName = "profile-presence-badge profile-presence-badge--offline";
  let dotClassName = "profile-presence-dot profile-presence-dot--offline";
  let label = "offline";

  if (presence === "online") {
    badgeClassName = "profile-presence-badge profile-presence-badge--online";
    dotClassName = "profile-presence-dot profile-presence-dot--online";
    label = "online";
  } else if (presence === "recently-active") {
    badgeClassName = "profile-presence-badge profile-presence-badge--recent";
    dotClassName = "profile-presence-dot profile-presence-dot--recent";
    label = "recently active";
  }

  return (
    <Card className="profile-card-shell h-52 overflow-hidden p-0">
      <CardContent className="mt-20 pb-8 flex flex-col sm:flex-row items-center sm:items-end gap-6">
        <div className="relative">
          <UserAvatar
            type="profile"
            name={user.displayName}
            avatarUrl={user.avatarUrl ?? undefined}
            className="ring-4 ring-white shadow-lg"
          />

          <AvatarUploader />
        </div>

        {/* user info */}
        <div className="text-center sm:text-left flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {user.displayName}
          </h1>

          {user.bio && (
            <p className="text-white/70 text-sm mt-2 max-w-lg line-clamp-2">
              {user.bio}
            </p>
          )}
        </div>

        {/* status */}
        <Badge
          className={cn("flex items-center gap-1 capitalize", badgeClassName)}
        >
          <div className={cn("size-2 rounded-full", dotClassName)} />

          {label}
        </Badge>
      </CardContent>
    </Card>
  );
};

export default ProfileCard;
