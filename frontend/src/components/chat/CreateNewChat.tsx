import { useFriendStore } from "@/stores/useFriendStore";
// Card import removed - using plain div instead
import { Dialog, DialogTrigger } from "../ui/dialog";
import { MessageCircle } from "lucide-react";
import FriendListModal from "../createNewChat/FriendListModal";
import { useState } from "react";
import { cn } from "@/lib/utils";

const CreateNewChat = ({ compact = false }: { compact?: boolean }) => {
  const [open, setOpen] = useState(false);
  const { getFriends } = useFriendStore();

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (nextOpen) {
      await getFriends();
    }
  };

  if (compact) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <button
            type="button"
            title="New message"
            aria-label="Start a new message"
            className={cn(
              "chat-sidebar-quick-action flex size-9 items-center justify-center rounded-xl border border-border/65 bg-background/80 text-muted-foreground/80 transition-[background-color,color,border-color,transform] duration-200",
              "hover:bg-muted/70 hover:text-foreground hover:border-border",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            <MessageCircle className="size-4.5" />
          </button>
        </DialogTrigger>

        <FriendListModal />
      </Dialog>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="flex-1 rounded-xl border bg-card text-card-foreground shadow-sm p-3 glass hover:shadow-soft transition-smooth cursor-pointer group/card">
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <button type="button" className="w-full text-left">
            <div className="flex items-center gap-4">
              <div className="size-8 bg-gradient-chat rounded-full flex items-center justify-center group-hover/card:scale-110 transition-bounce">
                <MessageCircle className="size-4 text-white" />
              </div>
              <span className="text-sm font-medium capitalize">
                send a new message
              </span>
            </div>
            </button>
          </DialogTrigger>

          <FriendListModal />
        </Dialog>
      </div>
    </div>
  );
};

export default CreateNewChat;
