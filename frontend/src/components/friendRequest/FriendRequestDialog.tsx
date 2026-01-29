import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFriendStore } from "@/stores/useFriendStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import SentRequests from "./SentRequests";
import ReceivedRequests from "./ReceivedRequests";
import { PendingFriendRequests } from "../notifications/PendingFriendRequests";
import { AcceptanceNotifications } from "../notifications/AcceptanceNotifications";

interface FriendRequestDialogProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

const FriendRequestDialog = ({ open, setOpen }: FriendRequestDialogProps) => {
  const [tab, setTab] = useState("received");
  const { getAllFriendRequests } = useFriendStore();
  const { resetUnreadCount } = useNotificationStore();

  useEffect(() => {
    const loadRequest = async () => {
      try {
        await getAllFriendRequests();
        // Reset notification count khi mở dialog
        resetUnreadCount();
      } catch (error) {
        console.error("Lỗi xảy ra khi load requests", error);
      }
    };

    if (open) {
      loadRequest();
    }
  }, [open, getAllFriendRequests, resetUnreadCount]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lời mời kết bạn</DialogTitle>
        </DialogHeader>

        {/* Hiển thị lời mời mới */}
        <PendingFriendRequests />

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="received">Đã nhận</TabsTrigger>
            <TabsTrigger value="sent">Đã gửi</TabsTrigger>
            <TabsTrigger value="notifications">Thông báo</TabsTrigger>
          </TabsList>

          <TabsContent value="received">
            <ReceivedRequests />
          </TabsContent>

          <TabsContent value="sent">
            <SentRequests />
          </TabsContent>

          <TabsContent
            value="notifications"
            className="max-h-96 overflow-y-auto"
          >
            <AcceptanceNotifications />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default FriendRequestDialog;
