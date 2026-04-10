import type { FriendRequest } from "@/types/user";
import type { ReactNode } from "react";
import UserAvatar from "../chat/UserAvatar";

interface RequestItemProps {
  requestInfo: FriendRequest;
  actions: ReactNode;
  type: "sent" | "received";
}

const FriendRequestItem = ({ requestInfo, actions, type }: RequestItemProps) => {
  if (!requestInfo) {
    return;
  }
  const info = type === "sent" ? requestInfo.to : requestInfo.from;

  if (!info) {
    return;
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl shadow-sm hover:shadow-md transition-shadow bg-card border border-border/60 p-4">
      <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar type="sidebar" name={info.displayName} />
            <div>
              <p className="font-medium text-foreground">{info.displayName}</p>
              <p className="text-sm text-muted-foreground">@{info.username}</p>
            </div>
          </div>
          {actions}
        </div>
        {requestInfo.message && (
          <div className="mt-1 rounded-md bg-muted/40 p-3 text-sm text-foreground/90 border border-border/50 relative">
            <div className="absolute -top-1.5 left-4 size-3 bg-muted/40 border-t border-l border-border/50 rotate-45" />
            <span className="italic">"{requestInfo.message}"</span>
          </div>
        )}
      </div>
  );
};

export default FriendRequestItem;
