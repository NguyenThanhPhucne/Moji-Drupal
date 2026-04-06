import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useFriendStore } from "@/stores/useFriendStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import NotificationHub from "@/components/notifications/NotificationHub";

interface FriendRequestDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const FriendRequestDialog = ({ open, setOpen }: FriendRequestDialogProps) => {
  const { getAllFriendRequests, loading } = useFriendStore();
  const { resetUnreadCount } = useNotificationStore();

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      try {
        await getAllFriendRequests();
        resetUnreadCount();
      } catch (error) {
        console.error("Error loading friend requests", error);
      }
    };

    load();
  }, [open, getAllFriendRequests, resetUnreadCount]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="modal-content-shell flex flex-col gap-0 p-0 sm:max-w-md"
        style={{ height: "min(600px, 85svh)" }}
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Thông báo</DialogTitle>
          <DialogDescription>
            Xem và quản lý tất cả thông báo của bạn
          </DialogDescription>
        </DialogHeader>

        <NotificationHub loading={loading} />
      </DialogContent>
    </Dialog>
  );
};

export default FriendRequestDialog;
