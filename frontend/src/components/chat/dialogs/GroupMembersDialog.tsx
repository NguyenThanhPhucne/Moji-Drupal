import { useState, useMemo } from "react";
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
import { Search, Users } from "lucide-react";

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
  const [search, setSearch] = useState("");

  const visibleGroupMembers = useMemo(() => {
    let members = groupMembersWithRole;
    if (membersAdminsOnly) {
      members = members.filter((m) => m.role !== "member");
    }
    const q = search.trim().toLowerCase();
    if (q) {
      members = members.filter((m) =>
        m.displayName.toLowerCase().includes(q),
      );
    }
    return members;
  }, [groupMembersWithRole, membersAdminsOnly, search]);

  const adminCount = useMemo(
    () => groupMembersWithRole.filter((m) => m.role !== "member").length,
    [groupMembersWithRole],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="chat-detail-dialog-shell chat-detail-dialog-shell--medium p-0">
        <div className="chat-detail-dialog-header">
          <DialogHeader>
            <DialogTitle className="chat-detail-dialog-title flex items-center gap-2">
              <Users className="size-4 text-primary" />
              Group members
            </DialogTitle>
            <DialogDescription className="chat-detail-dialog-description">
              {groupMembersWithRole.length} members · {adminCount} admin{adminCount !== 1 ? "s" : ""}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Search + filter */}
        <div className="px-5 pb-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members…"
              className="pl-9 h-9 rounded-lg border-border/50 bg-muted/30 text-sm focus-visible:ring-primary/20"
            />
          </div>
          <label className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
            <span>Show admins only</span>
            <Switch
              checked={membersAdminsOnly}
              onCheckedChange={setMembersAdminsOnly}
            />
          </label>
        </div>

        <div className="chat-detail-dialog-body max-h-[60vh] overflow-y-auto beautiful-scrollbar space-y-1 px-3">
          {visibleGroupMembers.length === 0 && (
            <div className="text-center py-8">
              <Users className="size-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {search ? "No members match your search" : "No admins found in this group."}
              </p>
            </div>
          )}

          {visibleGroupMembers.map((member) => (
            <div
              key={member.memberId}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/40 group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar
                  type="chat"
                  name={member.displayName}
                  avatarUrl={member.avatarUrl || undefined}
                />
                <p className="text-sm font-medium text-foreground truncate group-hover:text-foreground/90">
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
