import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import UserAvatar from "../UserAvatar";
import { GroupRoleBadge } from "../GroupRoleBadge";
import type { Participant } from "@/types/chat";
import { ShieldCheck, Search } from "lucide-react";
import { useState, useMemo } from "react";

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

  const [search, setSearch] = useState("");

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return manageableMembers;
    return manageableMembers.filter((m) =>
      m.displayName.toLowerCase().includes(q),
    );
  }, [manageableMembers, search]);

  const adminCount = useMemo(
    () => manageableMembers.filter((m) => groupAdminIds.has(String(m._id))).length,
    [manageableMembers, groupAdminIds],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="chat-detail-dialog-shell chat-detail-dialog-shell--medium p-0">
        <div className="chat-detail-dialog-header">
          <DialogHeader>
            <DialogTitle className="chat-detail-dialog-title flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              Manage admins
            </DialogTitle>
            <DialogDescription className="chat-detail-dialog-description">
              {adminCount} admin{adminCount !== 1 ? "s" : ""} of {manageableMembers.length} members.
              Toggle to grant or revoke admin rights.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Search */}
        {manageableMembers.length > 5 && (
          <div className="px-5 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members…"
                className="pl-9 h-9 rounded-lg border-border/50 bg-muted/30 text-sm focus-visible:ring-primary/20"
              />
            </div>
          </div>
        )}

        <div className="chat-detail-dialog-body max-h-[60vh] overflow-y-auto beautiful-scrollbar space-y-1 px-3">
          {filteredMembers.length === 0 && (
            <div className="text-center py-8">
              <ShieldCheck className="size-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {search ? "No members match your search" : "No members available for admin assignment."}
              </p>
            </div>
          )}

          {filteredMembers.map((member) => {
            const memberId = String(member._id);
            const isAdmin = groupAdminIds.has(memberId);

            return (
              <div
                key={memberId}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/40 group"
              >
                <div className="flex items-center gap-3 min-w-0">
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
