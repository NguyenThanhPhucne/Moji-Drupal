import { cn } from "@/lib/utils";
import { useSocketStore } from "@/stores/useSocketStore";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const StatusBadge = ({
  status,
  userId,
}: {
  status: "online" | "recently-active" | "offline";
  userId?: string | null;
}) => {
  const { getLastActiveAt } = useSocketStore();
  const lastActiveAt = getLastActiveAt(userId);

  let statusLabel = "Offline";
  if (status === "online") {
    statusLabel = "Online";
  } else if (status === "recently-active") {
    statusLabel = "Recently active";
  }

  const lastActiveLabel =
    lastActiveAt && status !== "online"
      ? `Last active ${formatDistanceToNow(new Date(lastActiveAt), {
          addSuffix: true,
        })}`
      : "";

  const badgeNode = (
    <div
      className={cn(
        "absolute -bottom-0.5 -right-0.5 size-4 rounded-full border-2 border-card transition-all duration-300 ease-out",
        status === "online" && "status-online",
        status === "recently-active" && "status-recently-active",
        status === "offline" && "status-offline",
      )}
    ></div>
  );

  if (!userId) {
    return badgeNode;
  }

  return (
    <Tooltip delayDuration={180}>
      <TooltipTrigger asChild>
        <span className="absolute -bottom-0.5 -right-0.5 inline-flex">
          {badgeNode}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        <div className="space-y-0.5">
          <p className="font-semibold">{statusLabel}</p>
          {lastActiveLabel && <p>{lastActiveLabel}</p>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

export default StatusBadge;
