import { useState, useMemo } from "react";
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

export function GroupMembersDialog(
  props: Readonly<GroupMembersDialogProps>,
) {
  const { open, onOpenChange, groupMembersWithRole } = props;
  const [membersAdminsOnly, setMembersAdminsOnly] = useState(false);

  const visibleGroupMembers = useMemo(() => {
    if (!membersAdminsOnly) {
      return groupMembersWithRole;
    }
    return groupMembersWithRole.filter((member) => member.role !== "member");
  }, [groupMembersWithRole, membersAdminsOnly]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="chat-detail-dialog-shell chat-detail-dialog-shell--medium p-0">
        <div className="chat-detail-dialog-header">
          <DialogHeader>
            <DialogTitle className="chat-detail-dialog-title">Group members</DialogTitle>
            <DialogDescription className="chat-detail-dialog-description">
              {visibleGroupMembers.length} of {groupMembersWithRole.length} participants.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="chat-detail-dialog-section-header">
          <label className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
            <span>Admins only</span>
            <Switch
              checked={membersAdminsOnly}
              onCheckedChange={setMembersAdminsOnly}
            />
          </label>
        </div>

        <div className="chat-detail-dialog-body max-h-[60vh] overflow-y-auto beautiful-scrollbar space-y-2">
          {visibleGroupMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No admins found in this group.
            </p>
          )}

          {visibleGroupMembers.map((member) => (
            <div
              key={member.memberId}
              className="chat-detail-dialog-row chat-detail-dialog-row--subtle"
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
