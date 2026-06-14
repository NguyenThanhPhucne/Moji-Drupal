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
      <span className="absolute bottom-0 right-0 z-10 h-[14px] w-[14px] rounded-full border-[2.5px] border-background bg-[hsl(var(--online))]" />
    );
  }

  if (status === "recently-active" && lastActiveAt) {
    const timeStr = formatOnlineTime(new Date(lastActiveAt));
    return (
      <span className="absolute -bottom-1 -right-1 z-10 flex h-[18px] items-center justify-center rounded-full border-[2.5px] border-background bg-[#1a2b1d] px-1.5 shadow-sm">
        <span className="text-[10px] font-bold text-[hsl(var(--online))] leading-none whitespace-nowrap">
          {timeStr}
        </span>
      </span>
    );
  }

  return null;
};

export default StatusBadge;
