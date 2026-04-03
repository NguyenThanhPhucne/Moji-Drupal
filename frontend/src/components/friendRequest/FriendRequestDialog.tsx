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
        // Reset notification count when opening the dialog.
        resetUnreadCount();
      } catch (error) {
        console.error("Error while loading requests", error);
      }
    };

    if (open) {
      loadRequest();
    }
  }, [open, getAllFriendRequests, resetUnreadCount]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="modal-stagger-item">
          <DialogTitle>Friend requests</DialogTitle>
        </DialogHeader>

        {/* Show new incoming requests */}
        <PendingFriendRequests />

        <Tabs value={tab} onValueChange={setTab} className="w-full modal-stagger-item">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="received">Received</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>

          <div className="mt-3 min-h-[300px]">
            <TabsContent
              value="received"
              forceMount
              className="mt-0 max-h-[300px] overflow-y-auto data-[state=inactive]:hidden"
            >
              <ReceivedRequests />
            </TabsContent>

            <TabsContent
              value="sent"
              forceMount
              className="mt-0 max-h-[300px] overflow-y-auto data-[state=inactive]:hidden"
            >
              <SentRequests />
            </TabsContent>

            <TabsContent
              value="notifications"
              forceMount
              className="mt-0 max-h-[300px] overflow-y-auto data-[state=inactive]:hidden"
            >
              <AcceptanceNotifications />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default FriendRequestDialog;
