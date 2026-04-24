import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import UserAvatar from "../UserAvatar";
import { GroupRoleBadge } from "../GroupRoleBadge";

export interface GroupMemberWithRole {
  memberId: string;
  displayName: string;
  avatarUrl?: string | null;
  role: "owner" | "admin" | "member";
}

export interface GroupMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupMembersWithRole: GroupMemberWithRole[];
}

export function GroupMembersDialog({
  open,
  onOpenChange,
  groupMembersWithRole,
}: GroupMembersDialogProps) {
  const [membersAdminsOnly, setMembersAdminsOnly] = useState(false);

  const visibleGroupMembers = useMemo(() => {
    if (!membersAdminsOnly) {
      return groupMembersWithRole;
    }
    return groupMembersWithRole.filter((member) => member.role !== "member");
  }, [groupMembersWithRole, membersAdminsOnly]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="border-b border-border/60 px-5 py-4">
          <DialogHeader>
            <DialogTitle>Group members</DialogTitle>
            <DialogDescription>
              {visibleGroupMembers.length} of {groupMembersWithRole.length} participants.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="border-b border-border/60 px-4 py-2.5">
          <label className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
            <span>Admins only</span>
            <Switch
              checked={membersAdminsOnly}
              onCheckedChange={setMembersAdminsOnly}
            />
          </label>
        </div>

        <div className="max-h-[60vh] overflow-y-auto beautiful-scrollbar p-4 space-y-2">
          {visibleGroupMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No admins found in this group.
            </p>
          )}

          {visibleGroupMembers.map((member) => (
            <div
              key={member.memberId}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <UserAvatar
                  type="chat"
                  name={member.displayName}
                  avatarUrl={member.avatarUrl || undefined}
                />
                <p className="text-sm font-medium text-foreground truncate">
                  {member.displayName}
                </p>
              </div>

              <GroupRoleBadge role={member.role} />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
