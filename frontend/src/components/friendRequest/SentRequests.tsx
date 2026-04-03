import { useFriendStore } from "@/stores/useFriendStore";
import FriendRequestItem from "./FriendRequestItem";
import FriendRequestSkeleton from "../skeleton/FriendRequestSkeleton";

const SentRequests = () => {
  const { sentList, loading } = useFriendStore();

  if (loading && (!sentList || sentList.length === 0)) {
    return <FriendRequestSkeleton count={2} />;
  }

  if (!sentList || sentList.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You have not sent any friend requests yet.
      </p>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      {sentList.map((req) => (
        <FriendRequestItem
          key={req._id}
          requestInfo={req}
          type="sent"
          actions={
            <p className="text-muted-foreground text-sm">
              Awaiting response...
            </p>
          }
        />
      ))}
    </div>
  );
};

export default SentRequests;
