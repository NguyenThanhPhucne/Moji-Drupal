import { formatOnlineTime } from "@/lib/utils";
import { useSocketStore } from "@/stores/useSocketStore";

const StatusBadge = ({
  status,
  userId,
}: {
  status: "online" | "recently-active" | "offline";
  userId?: string | null;
}) => {
  const { getLastActiveAt } = useSocketStore();
  const lastActiveAt = getLastActiveAt(userId);

  if (!userId || status === "offline") {
    return null;
  }

  if (status === "online") {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-[13px] w-[13px] items-center justify-center rounded-full bg-background">
        <span className="chat-presence-online-dot h-2 w-2 rounded-full" />
      </span>
    );
  }

  if (status === "recently-active" && lastActiveAt) {
    const timeStr = formatOnlineTime(new Date(lastActiveAt));
    return (
      <span className="absolute -bottom-1 -right-2 inline-flex items-center justify-center rounded-full bg-background px-[2px] py-[2px]">
        <span className="chat-presence-recent-pill flex h-3.5 items-center justify-center rounded-full px-1.5 text-[9px] font-bold">
          {timeStr}
        </span>
      </span>
    );
  }

  return null;
};

export default StatusBadge;
