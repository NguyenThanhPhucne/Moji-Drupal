import { cn } from "@/lib/utils";

const StatusBadge = ({
  status,
}: {
  status: "online" | "recently-active" | "offline";
}) => {
  return (
    <div
      className={cn(
        "absolute -bottom-0.5 -right-0.5 size-4 rounded-full border-2 border-card transition-all duration-300 ease-out",
        status === "online" && "status-online",
        status === "recently-active" && "status-recently-active",
        status === "offline" && "status-offline",
      )}
    ></div>
  );
};

export default StatusBadge;
