
import { Crown, Shield } from "lucide-react";
import type { GroupChannelRole } from "@/types/chat";

export const GroupRoleBadge = ({ role }: { role: GroupChannelRole }) => {
  if (role === "owner") {
    return (
      <span className="chat-role-pill chat-role-pill--owner inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
        <Crown className="size-2.5" />
        Owner
      </span>
    );
  }

  if (role === "admin") {
    return (
      <span className="chat-role-pill chat-role-pill--admin inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
        <Shield className="size-2.5" />
        Admin
      </span>
    );
  }

  return (
    <span className="chat-role-pill chat-role-pill--member inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium">
      Member
    </span>
  );
};
