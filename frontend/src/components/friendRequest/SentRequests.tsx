import { useFriendStore } from "@/stores/useFriendStore";
import FriendRequestItem from "./FriendRequestItem";

const SentRequests = () => {
  const { sentList } = useFriendStore();

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
