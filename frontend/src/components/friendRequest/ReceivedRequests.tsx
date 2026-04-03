import { useFriendStore } from "@/stores/useFriendStore";
import FriendRequestItem from "./FriendRequestItem";
import { Button } from "../ui/button";
import { toast } from "sonner";
import FriendRequestSkeleton from "../skeleton/FriendRequestSkeleton";

const ReceivedRequests = () => {
  const { acceptRequest, declineRequest, loading, receivedList } =
    useFriendStore();

  if (loading && (!receivedList || receivedList.length === 0)) {
    return <FriendRequestSkeleton count={3} />;
  }

  if (!receivedList || receivedList.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You have no friend requests yet.
      </p>
    );
  }

  const handleAccept = async (requestId: string) => {
    try {
      await acceptRequest(requestId);
      toast.success("Friend request accepted successfully");
    } catch (error) {
      console.error(error);
    }
  };

  const handleDecline = async (requestId: string) => {
    try {
      await declineRequest(requestId);
      toast.info("Friend request declined");
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-3 mt-4">
      {receivedList.map((req) => (
        <FriendRequestItem
          key={req._id}
          requestInfo={req}
          actions={
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleAccept(req._id)}
                disabled={loading}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="destructiveOutline"
                onClick={() => handleDecline(req._id)}
                disabled={loading}
              >
                Decline
              </Button>
            </div>
          }
          type="received"
        />
      ))}
    </div>
  );
};

export default ReceivedRequests;
