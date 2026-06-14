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
  Phone,
  Video,
  Settings2,
  Hash,
} from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import FriendProfileMiniCard from "./FriendProfileMiniCard";
import { useFriendStore } from "@/stores/useFriendStore";

import NotificationPreferencesDialog from "./NotificationPreferencesDialog";
import { DeleteConversationDialog } from "./dialogs/DeleteConversationDialog";
import { GroupMembersDialog } from "./dialogs/GroupMembersDialog";
import { ManageAdminsDialog } from "./dialogs/ManageAdminsDialog";
import { JoinLinkDialog } from "./dialogs/JoinLinkDialog";
import { ManageChannelsDialog } from "./dialogs/ManageChannelsDialog";

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
  const { conversations, activeConversationId, isCallActive, setIsCallActive, setCallMode, deleteConversation, setGroupAdminRole } =
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
  const [showChannelsDialog, setShowChannelsDialog] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [isFriendActionLoading, setIsFriendActionLoading] = useState(false);
  const [adminActionTarget, setAdminActionTarget] = useState<string | null>(null);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const callDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (callDebounceRef.current) {
        clearTimeout(callDebounceRef.current);
      }
    };
  }, []);

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
      await setGroupAdminRole(chat._id, memberId, checked);
    } finally {
      setAdminActionTarget(null);
    }
  };

  const handleStartCall = (mode: "audio" | "video") => {
    if (isCallActive || isStartingCall) return;
    
    setIsStartingCall(true);
    setCallMode(mode);
    setIsCallActive(true);
    
    // Clear any pending timeout
    if (callDebounceRef.current) {
      clearTimeout(callDebounceRef.current);
    }
    
    // Reset the starting state after a short delay
    callDebounceRef.current = setTimeout(() => {
      setIsStartingCall(false);
      callDebounceRef.current = null;
    }, 300);
  };

  return (
    <>
      <header className="chat-header chat-header-shell chat-header-shell--elevated chat-window-header-main sticky top-0 z-40 flex w-full items-center px-4 py-3">
        <div className="chat-header-row w-full flex items-center justify-between">
          {/* Left — identity */}
          <div className="chat-header-left min-w-0">
            <SidebarTrigger className="-ml-0.5 h-9 w-9 rounded-xl text-foreground md:hidden" />
            <div
              className={cn(
                "chat-header-identity chat-header-identity--compact min-w-0 flex items-center gap-3 rounded-lg px-2 py-1.5",
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
                  return <span className || isStartingCall}
                  className="chat-header-action-btn chat-header-action-btn--command rounded-full h-8 w-8"
                  title="Start Voice Call"
                  aria-label="Start voice call"
                >
                  <Phone className="size-[18px]" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleStartCall("video")}
                  disabled={isCallActive || isStartingCall
                  size="icon"
                  onClick={() => handleStartCall("audio")}
                  disabled={isCallActive}
                  className="chat-header-action-btn chat-header-action-btn--command rounded-full h-8 w-8"
                  title="Start Voice Call"
                  aria-label="Start voice call"
                >
                  <Phone className="size-[18px]" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleStartCall("video")}
                  disabled={isCallActive}
                  className="chat-header-action-btn chat-header-action-btn--command rounded-full h-8 w-8"
                  title="Start Video Call"
                  aria-label="Start video call"
                >
                  <Video className="size-[18px]" />
                </Button>
              </div>
            )}

            <NotificationPreferencesDialog
              open={showNotifDialog}
              onOpenChange={setShowNotifDialog}
              triggerClassName="chat-header-action-btn chat-header-action-btn--command rounded-full hidden lg:inline-flex h-8 w-8"
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost" size="icon"
                  disabled={isDeleting}
                  aria-label="More options"
                  className="chat-header-action-btn chat-header-action-btn--command rounded-full h-8 w-8"
                >
                  <MoreVertical className="h-[18px] w-[18px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="chat-header-dropdown chat-header-dropdown-panel--command w-52 overflow-hidden p-1"
              >

                {/* Direct chat options */}
                {chat.type === "direct" && otherUser?._id && (
                  <DropdownMenuItem
                    onSelect={() => navigate(`/profile/${String(otherUser._id)}`)}
                    className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[12px] py-2"
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
                      className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[12px] py-2"
                    >
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Members
                      <span className="ml-auto text-[11px] text-muted-foreground">{chat.participants.length}</span>
                    </DropdownMenuItem>

                    {/* Admin-only: Manage Admins */}
                    {isOwner && (
                      <DropdownMenuItem
                        onSelect={() => setTimeout(() => setShowAdminsDialog(true), 100)}
                        className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[12px] py-2"
                      >
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        Manage Admins
                      </DropdownMenuItem>
                    )}

                    {/* Admin-only: Join Link */}
                    {isGroupAdmin && (
                      <DropdownMenuItem
                        onSelect={() => setTimeout(() => setShowJoinLinkDialog(true), 100)}
                        className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[12px] py-2"
                      >
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                        Invite Link
                      </DropdownMenuItem>
                    )}

                    {isGroupAdmin && (
                      <DropdownMenuItem
                        onSelect={() => setTimeout(() => setShowChannelsDialog(true), 100)}
                        className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[12px] py-2"
                      >
                        <Hash className="h-4 w-4 text-muted-foreground" />
                        Manage Channels
                      </DropdownMenuItem>
                    )}

                    {isGroupAdmin && (
                      <DropdownMenuItem
                        onSelect={() => navigate(`/settings/account`)}
                        className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[12px] py-2"
                      >
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                        Settings
                      </DropdownMenuItem>
                    )}
                  </>
                )}

                <DropdownMenuSeparator className="my-1" />
                <DropdownMenuItem
                  onSelect={() => setTimeout(() => setShowDeleteDialog(true), 100)}
                  className="chat-header-dropdown-item chat-header-dropdown-item--command chat-header-dropdown-item--danger gap-2 cursor-pointer rounded-lg font-medium text-[12px] py-2"
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
        groupMembersWithRole={groupMembersWithRole}
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

      {isGroupAdmin && (
        <ManageChannelsDialog
          open={showChannelsDialog}
          onOpenChange={setShowChannelsDialog}
          chat={chat}
          isGroupAdmin={isGroupAdmin}
        />
      )}
    </>
  );
};

export default ChatWindowHeader;
