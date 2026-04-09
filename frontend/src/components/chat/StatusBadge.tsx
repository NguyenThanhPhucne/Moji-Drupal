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
      <span className="absolute -bottom-[1px] -right-[1px] flex h-[13px] w-[13px] items-center justify-center rounded-full bg-background ring-[1.5px] ring-background">
        <span className="h-[9px] w-[9px] rounded-full bg-[#31a24c] shadow-[0_0_0_1px_rgba(255,255,255,0.6)]" />
      </span>
    );
  }

  if (status === "recently-active" && lastActiveAt) {
    const timeStr = formatOnlineTime(new Date(lastActiveAt));
    return (
      <span className="absolute -bottom-1 -right-2 flex items-center justify-center rounded-full bg-background p-[1.5px]">
        <span className="flex h-[14px] items-center justify-center rounded-full bg-amber-400/90 px-1.5 text-[9px] font-bold text-white leading-none shadow-sm">
          {timeStr}
        </span>
      </span>
    );
  }

  return null;
};

export default StatusBadge;
