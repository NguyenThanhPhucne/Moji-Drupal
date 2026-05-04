
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
import type { Participant } from "@/types/chat";

export interface ManageAdminsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manageableMembers: Participant[];
  groupAdminIds: Set<string>;
  adminActionTarget: string | null;
  onToggleAdminRole: (memberId: string, checked: boolean) => void;
}

export function ManageAdminsDialog(
  props: Readonly<ManageAdminsDialogProps>,
) {
  const {
    open,
    onOpenChange,
    manageableMembers,
    groupAdminIds,
    adminActionTarget,
    onToggleAdminRole,
  } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="chat-detail-dialog-shell chat-detail-dialog-shell--medium p-0">
        <div className="chat-detail-dialog-header">
          <DialogHeader>
            <DialogTitle className="chat-detail-dialog-title">Manage group admins</DialogTitle>
            <DialogDescription className="chat-detail-dialog-description">
              Group owners can assign or remove admin rights for members.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="chat-detail-dialog-body max-h-[60vh] overflow-y-auto beautiful-scrollbar space-y-2">
          {manageableMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No members available for admin assignment.
            </p>
          )}

          {manageableMembers.map((member) => {
            const memberId = String(member._id);
            const isAdmin = groupAdminIds.has(memberId);

            return (
              <div
                key={memberId}
                className="chat-detail-dialog-row chat-detail-dialog-row--subtle"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserAvatar
                    type="chat"
                    name={member.displayName}
                    avatarUrl={member.avatarUrl || undefined}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {member.displayName}
                    </p>
                    <div className="mt-0.5">
                      <GroupRoleBadge role={isAdmin ? "admin" : "member"} />
                    </div>
                  </div>
                </div>

                <Switch
                  checked={isAdmin}
                  disabled={adminActionTarget === memberId}
                  onCheckedChange={(checked) => {
                    onToggleAdminRole(memberId, checked);
                  }}
                />
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
