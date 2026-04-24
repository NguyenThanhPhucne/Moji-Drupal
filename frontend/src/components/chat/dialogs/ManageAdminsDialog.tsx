import React from "react";
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
import type { UserProfile } from "@/types/user";

export interface ManageAdminsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manageableMembers: UserProfile[];
  groupAdminIds: Set<string>;
  adminActionTarget: string | null;
  onToggleAdminRole: (memberId: string, checked: boolean) => void;
}

export function ManageAdminsDialog({
  open,
  onOpenChange,
  manageableMembers,
  groupAdminIds,
  adminActionTarget,
  onToggleAdminRole,
}: ManageAdminsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="border-b border-border/60 px-5 py-4">
          <DialogHeader>
            <DialogTitle>Manage group admins</DialogTitle>
            <DialogDescription>
              Group owners can assign or remove admin rights for members.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[60vh] overflow-y-auto beautiful-scrollbar p-4 space-y-2">
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
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
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
