import { useState } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface IUserAvatarProps {
  type: "sidebar" | "chat" | "profile";
  name: string;
  avatarUrl?: string;
  className?: string;
  previewable?: boolean;
}

const UserAvatar = ({
  type,
  name,
  avatarUrl,
  className,
  previewable,
}: IUserAvatarProps) => {
  if (!name) {
    name = "Coming";
  }

  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const canPreview = Boolean(avatarUrl) && (previewable ?? type !== "profile");

  const openPreview = (event: React.MouseEvent | React.KeyboardEvent) => {
    if (!canPreview) {
      return;
    }

    event.stopPropagation();
    setAvatarPreviewOpen(true);
  };

  // Hash name to a deterministic number 1-5 for vibrant gradients
  const getAvatarGradient = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `bg-avatar-${(Math.abs(hash) % 5) + 1}`;
  };

  const gradientClass = getAvatarGradient(name);

  return (
    <>
      <Avatar
        className={cn(
          type === "sidebar" && "size-[42px] text-sm",
          type === "chat" && "size-8 text-sm",
          type === "profile" && "size-24 text-3xl shadow-md",
          canPreview && "cursor-zoom-in hover:brightness-110 focus-visible:ring-2 ring-primary ring-offset-2 ring-offset-background transition-all duration-200",
          className ?? "",
        )}
        role={canPreview ? "button" : undefined}
        tabIndex={canPreview ? 0 : undefined}
        onClick={canPreview ? openPreview : undefined}
        onKeyDown={
          canPreview
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openPreview(event);
                }
              }
            : undefined
        }
        aria-label={canPreview ? `View ${name} avatar` : undefined}
      >
        <AvatarImage src={avatarUrl} alt={name} />
        <AvatarFallback className={cn(gradientClass, "font-semibold pointer-events-none")}>
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {canPreview && (
        <Dialog open={avatarPreviewOpen} onOpenChange={setAvatarPreviewOpen}>
          <DialogContent
            contentClassMode="bare"
            className="social-lightbox-dialog max-w-[min(94vw,860px)] sm:max-w-3xl p-3 sm:p-4"
          >
            <DialogHeader>
              <DialogTitle>{name}</DialogTitle>
              <DialogDescription>Avatar preview</DialogDescription>
            </DialogHeader>

            <div className="social-lightbox-stage mt-2 flex h-[72vh] sm:h-[76vh] items-center justify-center overflow-hidden rounded-xl p-1 sm:p-2">
              <img
                src={avatarUrl}
                alt={`${name} avatar`}
                className="max-h-full max-w-full rounded-xl object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default UserAvatar;
