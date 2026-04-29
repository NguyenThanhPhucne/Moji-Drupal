
import { Crown, Shield } from "lucide-react";
import type { GroupChannelRole } from "@/types/chat";

export const GroupRoleBadge = ({ role }: { role: GroupChannelRole }) => {
  if (role === "owner") {
    return (
      <span className="chat-header-context-pill inline-flex items-center gap-1 rounded-full border border-warning/45 bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
        <Crown className="size-2.5" />
        Owner
      </span>
    );
  }

  if (role === "admin") {
    return (
      <span className="chat-header-context-pill inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
        <Shield className="size-2.5" />
        Admin
      </span>
    );
  }

  return (
    <span className="chat-header-context-pill inline-flex items-center rounded-full border border-border/70 bg-muted/35 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      Member
    </span>
  );
};
