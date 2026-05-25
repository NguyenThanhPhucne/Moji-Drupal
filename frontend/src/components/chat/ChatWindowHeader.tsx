import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import { SidebarTrigger } from "../ui/sidebar";
import { useAuthStore } from "@/stores/useAuthStore";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useSocketStore } from "@/stores/useSocketStore";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  MoreVertical,
  Trash2,
  UserCircle,
  Users,
  ShieldCheck,
  Link2,
  Video,
  Settings2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import FriendProfileMiniCard from "./FriendProfileMiniCard";
import { useFriendStore } from "@/stores/useFriendStore";

import NotificationPreferencesDialog from "./NotificationPreferencesDialog";
import { DeleteConversationDialog } from "./dialogs/DeleteConversationDialog";
import { GroupMembersDialog } from "./dialogs/GroupMembersDialog";
import { ManageAdminsDialog } from "./dialogs/ManageAdminsDialog";
import { JoinLinkDialog } from "./dialogs/JoinLinkDialog";

function resolveDirectPeer(chat: Conversation, userId?: string) {
  if (chat.type !== "direct") return null;
  const others = chat.participants.filter(
    (p) => String(p._id) !== String(userId),
  );
  return others.length > 0 ? others[0] : null;
}

type GroupMemberRole = "owner" | "admin" | "member";
const GROUP_ROLE_PRIORITY: Record<GroupMemberRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
};

function getGroupMemberRole(
  memberId: string,
  ownerId: string,
  adminIds: Set<string>,
): GroupMemberRole {
  if (memberId === ownerId) return "owner";
  if (adminIds.has(memberId)) return "admin";
  return "member";
}

const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => {
  const { conversations, activeConversationId, isCallActive, setIsCallActive, deleteConversation, toggleGroupAdminRole } =
    useChatStore();
  const { user } = useAuthStore();
  const { getUserPresence } = useSocketStore();
  const { removeFriend } = useFriendStore();
  const navigate = useNavigate();

  // dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showNotifDialog, setShowNotifDialog] = useState(false);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [showAdminsDialog, setShowAdminsDialog] = useState(false);
  const [showJoinLinkDialog, setShowJoinLinkDialog] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [isFriendActionLoading, setIsFriendActionLoading] = useState(false);
  const [adminActionTarget, setAdminActionTarget] = useState<string | null>(null);

  chat =
    chat ??
    conversations.find((c) => String(c._id) === String(activeConversationId || ""));

  const userId = String(user?._id || "");
  const ownerId = String(chat?.group?.createdBy || "");
  const groupAdminIds = useMemo(
    () => new Set((chat?.group?.adminIds || []).map(String)),
    [chat?.group?.adminIds],
  );

  const isOwner = userId === ownerId;
  const isGroupAdmin = isOwner || groupAdminIds.has(userId);

  const otherUser = useMemo(() => {
    if (chat?.type !== "direct") return null;
    return resolveDirectPeer(chat, userId);
  }, [chat, userId]);

  const groupMembersWithRole = useMemo(() => {
    if (chat?.type !== "group") return [];
    return chat.participants
      .map((p) => {
        const memberId = String(p._id || "");
        return { ...p, memberId, role: getGroupMemberRole(memberId, ownerId, groupAdminIds) };
      })
      .sort((a, b) => {
        const diff = GROUP_ROLE_PRIORITY[a.role] - GROUP_ROLE_PRIORITY[b.role];
        return diff !== 0 ? diff : String(a.displayName || "").localeCompare(String(b.displayName || ""));
      });
  }, [chat, groupAdminIds, ownerId]);

  // Members excludes owner (can't toggle owner's admin)
  const manageableMembers = useMemo(
    () => (chat?.participants || []).filter((p) => String(p._id) !== ownerId),
    [chat, ownerId],
  );

  const activeGroupJoinLink = chat?.group?.joinLink ?? null;

  if (!chat) {
    return (
      <header className="chat-header chat-header-shell chat-window-header-main sticky top-0 z-40 flex w-full items-center gap-2 px-4 py-2 md:hidden">
        <SidebarTrigger className="-ml-1 h-9 w-9 rounded-xl text-foreground" />
      </header>
    );
  }

  if (chat.type === "direct" && (!user || !otherUser)) return null;

  const handleDeleteConversation = async () => {
    try {
      setIsDeleting(true);
      const ok = await deleteConversation(chat._id);
      if (ok) {
        toast.success("Conversation deleted");
        setShowDeleteDialog(false);
        navigate("/");
      } else {
        toast.error("Cannot delete conversation");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!otherUser?._id) return;
    try {
      setIsFriendActionLoading(true);
      const result = await removeFriend(String(otherUser._id));
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setIsFriendActionLoading(false);
    }
  };

  const handleToggleAdminRole = async (memberId: string, checked: boolean) => {
    if (!chat || !isOwner) return;
    try {
      setAdminActionTarget(memberId);
      await toggleGroupAdminRole(chat._id, memberId, checked);
    } finally {
      setAdminActionTarget(null);
    }
  };

  return (
    <>
      <header className="chat-header chat-header-shell chat-window-header-main sticky top-0 z-40 flex w-full items-center px-4 py-3">
        <div className="chat-header-row w-full flex items-center justify-between">
          {/* Left — identity */}
          <div className="chat-header-left min-w-0">
            <SidebarTrigger className="-ml-0.5 h-9 w-9 rounded-xl text-foreground md:hidden" />
            <div
              className={cn(
                "chat-header-identity min-w-0 flex items-center gap-3 rounded-lg px-2 py-1.5",
                chat.type === "direct" ? "hover:bg-muted/40" : "",
              )}
            >
              <div className="relative flex-shrink-0">
                {chat.type === "direct" ? (
                  <>
                    <FriendProfileMiniCard
                      userId={String(otherUser?._id || "")}
                      displayName={otherUser?.displayName || ""}
                      avatarUrl={otherUser?.avatarUrl || undefined}
                      onViewProfile={() => navigate(`/profile/${String(otherUser?._id || "")}`)}
                      onChat={() => navigate(`/direct/${String(otherUser?._id || "")}`)}
                      onRemove={handleRemoveFriend}
                      disabled={isFriendActionLoading}
                    >
                      <UserAvatar type="sidebar" name={otherUser?.displayName || ""} avatarUrl={otherUser?.avatarUrl || undefined} />
                    </FriendProfileMiniCard>
                    <StatusBadge status={getUserPresence(otherUser?._id)} userId={otherUser?._id} />
                  </>
                ) : (
                  <GroupChatAvatar participants={chat.participants} type="sidebar" />
                )}
              </div>

              <div key={chat._id} className="chat-header-title-block min-w-0 flex flex-col justify-center gap-0.5">
                <h2 className="chat-header-title truncate font-semibold text-[15px] text-foreground">
                  {chat.type === "direct" ? otherUser?.displayName : chat.group?.name}
                </h2>
                {chat.type === "group" && (
                  <span className="text-[11px] text-muted-foreground">
                    {chat.participants.length} members
                    {isGroupAdmin && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-primary/80">
                        <ShieldCheck className="size-3" />
                        {isOwner ? "Owner" : "Admin"}
                      </span>
                    )}
                  </span>
                )}
                {chat.type === "direct" && (() => {
                  const pres = getUserPresence(otherUser?._id);
                  if (pres === "online") return <span className="text-[11px] text-[hsl(var(--status-success))] font-medium">Active</span>;
                  if (pres === "recently-active") return <span className="text-[11px] text-[hsl(var(--status-warning)/0.7)] font-medium">Away</span>;
                  return <span className="text-[11px] text-muted-foreground">Offline</span>;
                })()}
              </div>
            </div>
          </div>

          {/* Right — actions */}
          <div className="chat-header-actions flex flex-shrink-0 items-center gap-2">
            {(chat.type === "group" || chat.type === "direct") && (
              <Button
                variant="ghost" size="icon"
                onClick={() => setIsCallActive(true)}
                disabled={isCallActive}
                className="rounded-full hidden lg:inline-flex h-8 w-8 text-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors"
                title="Start Video Call"
              >
                <Video className="size-[18px]" />
              </Button>
            )}

            <NotificationPreferencesDialog
              open={showNotifDialog}
              onOpenChange={setShowNotifDialog}
              triggerClassName="rounded-full hidden lg:inline-flex h-8 w-8 text-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors"
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost" size="icon"
                  disabled={isDeleting}
                  aria-label="More options"
                  className="rounded-full h-8 w-8 text-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  <MoreVertical className="h-[18px] w-[18px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-lg border-border/60 overflow-hidden p-1">

                {/* Direct chat options */}
                {chat.type === "direct" && otherUser?._id && (
                  <DropdownMenuItem
                    onSelect={() => navigate(`/profile/${String(otherUser._id)}`)}
                    className="gap-2 cursor-pointer rounded-lg font-medium text-[12px] py-2"
                  >
                    <UserCircle className="h-4 w-4 text-muted-foreground" />
                    View profile
                  </DropdownMenuItem>
                )}

                {/* Group options */}
                {chat.type === "group" && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => setTimeout(() => setShowMembersDialog(true), 100)}
                      className="gap-2 cursor-pointer rounded-lg font-medium text-[12px] py-2"
                    >
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Members
                      <span className="ml-auto text-[11px] text-muted-foreground">{chat.participants.length}</span>
                    </DropdownMenuItem>

                    {/* Admin-only: Manage Admins */}
                    {isOwner && (
                      <DropdownMenuItem
                        onSelect={() => setTimeout(() => setShowAdminsDialog(true), 100)}
                        className="gap-2 cursor-pointer rounded-lg font-medium text-[12px] py-2"
                      >
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        Manage Admins
                      </DropdownMenuItem>
                    )}

                    {/* Admin-only: Join Link */}
                    {isGroupAdmin && (
                      <DropdownMenuItem
                        onSelect={() => setTimeout(() => setShowJoinLinkDialog(true), 100)}
                        className="gap-2 cursor-pointer rounded-lg font-medium text-[12px] py-2"
                      >
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                        Invite Link
                      </DropdownMenuItem>
                    )}

                    {isGroupAdmin && (
                      <DropdownMenuItem
                        onSelect={() => navigate(`/group/${chat._id}/settings`)}
                        className="gap-2 cursor-pointer rounded-lg font-medium text-[12px] py-2"
                      >
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                        Group Settings
                      </DropdownMenuItem>
                    )}
                  </>
                )}

                <DropdownMenuSeparator className="my-1" />
                <DropdownMenuItem
                  onSelect={() => setTimeout(() => setShowDeleteDialog(true), 100)}
                  className="gap-2 cursor-pointer rounded-lg font-medium text-[12px] py-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {chat.type === "group" && isOwner ? "Delete group" : "Leave / Delete"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Dialogs ─────────────────────────────────────────── */}
      <DeleteConversationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        isDeleting={isDeleting}
        onConfirm={handleDeleteConversation}
        chatType={chat.type}
        chatName={chat.type === "direct" ? (otherUser?.displayName ?? "this contact") : (chat.group?.name ?? "this group")}
      />

      <GroupMembersDialog
        open={showMembersDialog}
        onOpenChange={setShowMembersDialog}
        groupMembersWithRole={groupMembersWithRole as any}
      />

      {isOwner && (
        <ManageAdminsDialog
          open={showAdminsDialog}
          onOpenChange={setShowAdminsDialog}
          manageableMembers={manageableMembers}
          groupAdminIds={groupAdminIds}
          adminActionTarget={adminActionTarget}
          onToggleAdminRole={handleToggleAdminRole}
        />
      )}

      {isGroupAdmin && (
        <JoinLinkDialog
          open={showJoinLinkDialog}
          onOpenChange={setShowJoinLinkDialog}
          chat={chat}
          isGroupAdmin={isGroupAdmin}
          activeGroupJoinLink={activeGroupJoinLink}
        />
      )}
    </>
  );
};

export default ChatWindowHeader;
