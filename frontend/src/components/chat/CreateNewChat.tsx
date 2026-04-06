import { useFriendStore } from "@/stores/useFriendStore";
// Card import removed - using plain div instead
import { Dialog, DialogTrigger } from "../ui/dialog";
import { MessageCircle } from "lucide-react";
import FriendListModal from "../createNewChat/FriendListModal";
import { useState } from "react";

const CreateNewChat = () => {
  const [open, setOpen] = useState(false);
  const { getFriends } = useFriendStore();

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (nextOpen) {
      await getFriends();
    }
  };

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
