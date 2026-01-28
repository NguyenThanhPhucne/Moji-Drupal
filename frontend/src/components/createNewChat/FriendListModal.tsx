import { useFriendStore } from "@/stores/useFriendStore";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { MessageCircleMore, Users } from "lucide-react";
import { Card } from "../ui/card";
import UserAvatar from "../chat/UserAvatar";
import { useChatStore } from "@/stores/useChatStore";
import { toast } from "sonner";
import { useState } from "react";

const FriendListModal = () => {
  const { friends } = useFriendStore();
  const { createConversation, loading } = useChatStore();
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

  const handleAddConversation = async (friendId: string) => {
    try {
      setCreatingFor(friendId);
      const success = await createConversation("direct", "", [friendId]);

      if (success) {
        const friend = friends.find((f) => f._id === friendId);
        toast.success(
          `Tạo cuộc trò chuyện với ${friend?.displayName} thành công! 💬`,
        );
      } else {
        toast.error("Không thể tạo cuộc trò chuyện. Vui lòng thử lại!");
      }
    } catch (error) {
      console.error("❌ [FriendListModal] Error:", error);
      toast.error("Có lỗi xảy ra. Vui lòng thử lại!");
    } finally {
      setCreatingFor(null);
    }
  };

  return (
    <DialogContent className="glass max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl capitalize">
          <MessageCircleMore className="size-5" />
          bắt đầu hội thoại mới
        </DialogTitle>
        <DialogDescription className="sr-only">
          Chọn bạn bè từ danh sách để bắt đầu cuộc trò chuyện
        </DialogDescription>
      </DialogHeader>

      {/* friends list */}
      <div className="space-y-4">
        <h1 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          danh sách bạn bè
        </h1>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {friends.map((friend) => (
            <Card
              onClick={() => handleAddConversation(friend._id)}
              key={friend._id}
              className="p-3 cursor-pointer transition-smooth hover:shadow-soft glass hover:bg-muted/30 group/friendCard"
              style={{
                opacity: loading && creatingFor === friend._id ? 0.6 : 1,
                pointerEvents: loading ? "none" : "auto",
              }}
            >
              <div className="flex items-center gap-3">
                {/* avatar */}
                <div className="relative">
                  <UserAvatar
                    type="sidebar"
                    name={friend.displayName}
                    avatarUrl={friend.avatarUrl}
                  />
                </div>

                {/* info */}
                <div className="flex-1 min-w-0 flex flex-col">
                  <h2 className="font-semibold text-sm truncate">
                    {friend.displayName}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    @{friend.username}
                  </span>
                </div>

                {/* loading state */}
                {loading && creatingFor === friend._id && (
                  <div className="text-xs text-muted-foreground">
                    Đang tạo...
                  </div>
                )}
              </div>
            </Card>
          ))}

          {friends.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="size-12 mx-auto mb-3 opacity-50" />
              Chưa có bạn bè. Thêm bạn vô để tám!
            </div>
          )}
        </div>
      </div>
    </DialogContent>
  );
};

export default FriendListModal;
