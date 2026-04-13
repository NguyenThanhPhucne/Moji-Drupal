import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import { SidebarTrigger } from "../ui/sidebar";
import { useAuthStore } from "@/stores/useAuthStore";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useSocketStore } from "@/stores/useSocketStore";
import { Button } from "../ui/button";
import { cn, formatOnlineTime } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Bell,
  LoaderCircle,
  MoreVertical,
  Trash2,
  Phone,
  Video,
  UserCircle,
  Megaphone,
  ShieldCheck,
  Users,
  Crown,
  Shield,
  Link2,
  Copy,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { useNavigate } from "react-router-dom";
import GlobalSearchDialog from "./GlobalSearchDialog";
import FriendProfileMiniCard from "./FriendProfileMiniCard";
import { useFriendStore } from "@/stores/useFriendStore";
import { Switch } from "../ui/switch";
import NotificationPreferencesDialog from "./NotificationPreferencesDialog";

function resolveDirectPeer(chat: Conversation, userId?: string) {
  if (chat.type !== "direct") {
    return null;
  }

  const otherUsers = chat.participants.filter((participant) => String(participant._id) !== String(userId));
  return otherUsers.length > 0 ? otherUsers[0] : null;
}

function getGroupPresenceText(
  chat: Conversation,
  onlineUsers: string[],
) {
  const total = chat.participants.length;
  const onlineSet = new Set(onlineUsers);
  const onlineCount = chat.participants.filter(
    (p) => onlineSet.has(String(p._id)),
  ).length;

  if (onlineCount > 0) {
    return `${total} members · ${onlineCount} online`;
  }
  return `${total} members`;
}

type GroupMemberRole = "owner" | "admin" | "member";

const GROUP_ROLE_PRIORITY: Record<GroupMemberRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
};

const getGroupMemberRole = (
  memberId: string,
  ownerId: string,
  adminIds: Set<string>,
): GroupMemberRole => {
  if (memberId === ownerId) {
    return "owner";
  }

  if (adminIds.has(memberId)) {
    return "admin";
  }

  return "member";
};

const getGroupRoleLabel = (role: GroupMemberRole) => {
  if (role === "owner") {
    return "Owner";
  }

  if (role === "admin") {
    return "Admin";
  }

  return "Member";
};

const GroupRoleBadge = ({ role }: { role: GroupMemberRole }) => {
  if (role === "owner") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/45 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
        <Crown className="size-2.5" />
        Owner
      </span>
    );
  }

  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
        <Shield className="size-2.5" />
        Admin
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/35 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      Member
    </span>
  );
};

const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => { // NOSONAR
  const { conversations, activeConversationId } = useChatStore();
  const { user } = useAuthStore();
  const { getUserPresence, getLastActiveAt, onlineUsers } = useSocketStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFriendActionLoading, setIsFriendActionLoading] = useState(false);
  const [showManageAdminsDialog, setShowManageAdminsDialog] = useState(false);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [membersAdminsOnly, setMembersAdminsOnly] = useState(false);
  const [isAnnouncementUpdating, setIsAnnouncementUpdating] = useState(false);
  const [adminActionTarget, setAdminActionTarget] = useState<string | null>(null);
  const [showJoinLinkDialog, setShowJoinLinkDialog] = useState(false);
  const [isJoinLinkGenerating, setIsJoinLinkGenerating] = useState(false);
  const [joinLinkHours, setJoinLinkHours] = useState(24);
  const [generatedJoinLink, setGeneratedJoinLink] = useState("");
  const [generatedJoinLinkExpiresAt, setGeneratedJoinLinkExpiresAt] = useState<string | null>(null);
  const navigate = useNavigate();
  const {
    createConversation,
    setActiveConversation,
    fetchMessages,
    deleteConversation,
    setGroupAnnouncementMode,
    setGroupAdminRole,
    createGroupJoinLink,
    revokeGroupJoinLink,
  } = useChatStore();
  const { removeFriend } = useFriendStore();

  chat = chat ?? conversations.find((c) => c._id === activeConversationId);

  const myUserId = String(user?._id || "");
  const ownerId = String(chat?.group?.createdBy || "");
  const groupAdminIds = useMemo(
    () => new Set((chat?.group?.adminIds || []).map(String)),
    [chat?.group?.adminIds],
  );
  const otherUser = useMemo(() => {
    if (chat?.type !== "direct") {
      return null;
    }

    return resolveDirectPeer(chat, user?._id);
  }, [chat, user?._id]);

  const groupPresenceText = chat?.type === "group"
    ? getGroupPresenceText(chat, onlineUsers)
    : null;
  const isGroupCreator =
    chat?.type === "group" &&
    ownerId === myUserId;
  const isGroupAdmin =
    chat?.type === "group" &&
    (isGroupCreator || groupAdminIds.has(myUserId));
  const announcementOnly =
    chat?.type === "group" &&
    Boolean(chat.group?.announcementOnly);
  const currentUserGroupRole: GroupMemberRole =
    chat?.type === "group"
      ? getGroupMemberRole(myUserId, ownerId, groupAdminIds)
      : "member";
  const currentGroupRoleLabel = getGroupRoleLabel(currentUserGroupRole);
  const groupAdminCount = useMemo(() => {
    if (chat?.type !== "group") {
      return 0;
    }

    const effectiveAdmins = new Set<string>([ownerId]);
    groupAdminIds.forEach((memberId) => {
      if (memberId) {
        effectiveAdmins.add(memberId);
      }
    });

    return effectiveAdmins.size;
  }, [chat?.type, groupAdminIds, ownerId]);
  const groupMembersWithRole = useMemo(() => {
    if (chat?.type !== "group") {
      return [];
    }

    return chat.participants
      .map((participant) => {
        const memberId = String(participant._id || "");
        return {
          ...participant,
          memberId,
          role: getGroupMemberRole(memberId, ownerId, groupAdminIds),
        };
      })
      .sort((a, b) => {
        const roleDiff = GROUP_ROLE_PRIORITY[a.role] - GROUP_ROLE_PRIORITY[b.role];
        if (roleDiff !== 0) {
          return roleDiff;
        }

        return String(a.displayName || "").localeCompare(
          String(b.displayName || ""),
        );
      });
  }, [chat, groupAdminIds, ownerId]);
  const visibleGroupMembers = useMemo(() => {
    if (!membersAdminsOnly) {
      return groupMembersWithRole;
    }

    return groupMembersWithRole.filter((member) => member.role !== "member");
  }, [groupMembersWithRole, membersAdminsOnly]);
  const manageableMembers = useMemo(() => {
    if (chat?.type !== "group") {
      return [];
    }

    return chat.participants.filter(
      (participant) => String(participant._id) !== ownerId,
    );
  }, [chat, ownerId]);
  const activeGroupJoinLink =
    chat?.type === "group" ? chat.group?.joinLink || null : null;
  const hasActiveGroupJoinLink = Boolean(activeGroupJoinLink?.isActive);

  if (!chat) {
    return (
      <header className="md:hidden sticky top-0 z-10 flex items-center gap-2 px-4 py-2 w-full">
        <SidebarTrigger className="-ml-1 text-foreground" />
      </header>
    );
  }

  if (chat.type === "direct" && (!user || !otherUser)) {
    return null;
  }
  // contextLabel kept for future use (e.g. tooltip, accessibility aria-label)

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

  const handleQuickChat = async () => {
    if (!otherUser?._id) {
      return;
    }

    if (chat?.type === "direct") {
      setActiveConversation(chat._id);
      await fetchMessages(chat._id);
      return;
    }

    await createConversation("direct", "", [String(otherUser._id)]);
  };

  const handleRemoveFriend = async () => {
    if (!otherUser?._id) {
      return;
    }

    try {
      setIsFriendActionLoading(true);
      const result = await removeFriend(String(otherUser._id));
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsFriendActionLoading(false);
    }
  };

  const handleToggleAnnouncementMode = async () => {
    if (chat.type !== "group" || !isGroupAdmin) {
      return;
    }

    try {
      setIsAnnouncementUpdating(true);
      const ok = await setGroupAnnouncementMode(chat._id, !announcementOnly);
      if (!ok) {
        toast.error("Could not update announcement mode");
        return;
      }

      const enablingAnnouncementMode = announcementOnly === false;

      toast.success(
        enablingAnnouncementMode
          ? "Announcement mode enabled"
          : "Announcement mode disabled",
      );
    } finally {
      setIsAnnouncementUpdating(false);
    }
  };

  const handleToggleAdminRole = async (
    memberId: string,
    makeAdmin: boolean,
  ) => {
    if (chat.type !== "group" || !isGroupCreator) {
      return;
    }

    try {
      setAdminActionTarget(memberId);
      const ok = await setGroupAdminRole(chat._id, memberId, makeAdmin);
      if (!ok) {
        toast.error("Could not update admin role");
        return;
      }

      toast.success(makeAdmin ? "Member promoted to admin" : "Admin role removed");
    } finally {
      setAdminActionTarget(null);
    }
  };

  const handleMembersDialogOpenChange = (open: boolean) => {
    setShowMembersDialog(open);
    if (!open) {
      setMembersAdminsOnly(false);
    }
  };

  const handleGenerateGroupJoinLink = async () => {
    if (chat.type !== "group" || !isGroupAdmin) {
      return;
    }

    try {
      setIsJoinLinkGenerating(true);
      const result = await createGroupJoinLink(chat._id, joinLinkHours);
      if (!result.ok || !result.joinLinkUrl) {
        toast.error(result.message || "Could not create join link");
        return;
      }

      setGeneratedJoinLink(result.joinLinkUrl);
      setGeneratedJoinLinkExpiresAt(result.expiresAt || null);
      toast.success("Join link created");
    } finally {
      setIsJoinLinkGenerating(false);
    }
  };

  const handleCopyJoinLink = async () => {
    if (!generatedJoinLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedJoinLink);
      toast.success("Join link copied");
    } catch {
      toast.error("Could not copy join link");
    }
  };

  const handleRevokeGroupJoinLink = async () => {
    if (chat.type !== "group" || !isGroupAdmin) {
      return;
    }

    const ok = await revokeGroupJoinLink(chat._id);
    if (!ok) {
      toast.error("Could not revoke join link");
      return;
    }

    setGeneratedJoinLink("");
    setGeneratedJoinLinkExpiresAt(null);
    toast.success("Join link revoked");
  };

  return (
    <>
      <header className="gradient-border-bottom chat-window-header bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 flex items-center px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 w-full justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {/* Sidebar toggle — only on mobile */}
            <SidebarTrigger className="-ml-0.5 text-foreground md:hidden" />

            {/* Avatar + name */}
            <div
              className={cn(
                "chat-header-identity chat-header-identity--enterprise",
                chat.type === "direct"
                  ? "chat-header-identity--direct"
                  : "chat-header-identity--group",
              )}
            >
              {/* avatar */}
              <div className="relative flex-shrink-0">
                {chat.type === "direct" ? (
                  <>
                    <FriendProfileMiniCard
                      userId={String(otherUser?._id || "")}
                      displayName={otherUser?.displayName || "Coming"}
                      avatarUrl={otherUser?.avatarUrl || undefined}
                      onViewProfile={() =>
                        navigate(`/profile/${String(otherUser?._id || "")}`)
                      }
                      onChat={handleQuickChat}
                      onRemove={handleRemoveFriend}
                      disabled={isFriendActionLoading}
                    >
                      <UserAvatar
                        type={"sidebar"}
                        name={otherUser?.displayName || "Coming"}
                        avatarUrl={otherUser?.avatarUrl || undefined}
                      />
                    </FriendProfileMiniCard>
                    <StatusBadge
                      status={getUserPresence(otherUser?._id)}
                      userId={otherUser?._id}
                    />
                  </>
                ) : (
                  <GroupChatAvatar
                    participants={chat.participants}
                    type="sidebar"
                  />
                )}
              </div>

              {/* name + presence */}
              <div key={chat._id} className="min-w-0 flex flex-col justify-center">
                <h2 className="truncate font-semibold tracking-tight text-[15px] text-foreground transition-colors">
                  {chat.type === "direct"
                    ? otherUser?.displayName
                    : chat.group?.name}
                </h2>
                <div className="flex items-center gap-1.5 mt-[2px]">
                  {chat.type === "direct" && (() => {
                    const pres = getUserPresence(otherUser?._id);
                    const lastActiveAt = getLastActiveAt(otherUser?._id);
                    if (pres === "online") {
                        return (
                          <span className="flex items-center gap-1.5">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                            </span>
                            <span className="presence-pill-online">
                              Active now
                            </span>
                          </span>
                        );
                    }
                    if (pres === "recently-active" && lastActiveAt) {
                      const timeStr = formatOnlineTime(new Date(lastActiveAt));
                      return (
                        <span className="text-[12px] text-muted-foreground font-medium leading-none">
                          Active {timeStr} ago
                        </span>
                      );
                    }
                    return (
                      <span className="text-[12px] text-muted-foreground/60 font-medium leading-none">
                        Offline
                      </span>
                    );
                  })()}
                  {chat.type === "group" && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] text-muted-foreground font-medium leading-none">
                        {groupPresenceText}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {groupAdminCount} admins
                      </span>
                      <span className="inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        You: {currentGroupRoleLabel}
                      </span>
                      {(currentUserGroupRole === "owner" ||
                        currentUserGroupRole === "admin") && (
                        <GroupRoleBadge role={currentUserGroupRole} />
                      )}
                      {announcementOnly && (
                        <span className="inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          Announcement mode
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <GlobalSearchDialog />
            <NotificationPreferencesDialog />

            {chat.type === "group" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMembersDialog(true)}
                  className="hidden lg:inline-flex rounded-full h-8 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  title="View members"
                >
                  <Users className="size-3.5 mr-1.5" />
                  Members
                </Button>

                {isGroupAdmin && (
                  <Button
                    variant={announcementOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      handleToggleAnnouncementMode().catch((error) => {
                        console.error("Failed to toggle announcement mode", error);
                      });
                    }}
                    disabled={isAnnouncementUpdating}
                    className="hidden lg:inline-flex rounded-full h-8 px-3 text-xs font-semibold"
                    title={announcementOnly ? "Disable announcement mode" : "Enable announcement mode"}
                  >
                    {isAnnouncementUpdating ? (
                      <LoaderCircle className="size-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Megaphone className="size-3.5 mr-1.5" />
                    )}
                    {announcementOnly ? "Announcement on" : "Announcement off"}
                  </Button>
                )}

                {isGroupCreator && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowManageAdminsDialog(true)}
                    className="hidden xl:inline-flex rounded-full h-8 px-3 text-xs font-semibold"
                    title="Manage admins"
                  >
                    <ShieldCheck className="size-3.5 mr-1.5" />
                    Admins
                  </Button>
                )}

                {isGroupAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowJoinLinkDialog(true)}
                    className="hidden xl:inline-flex rounded-full text-muted-foreground hover:text-foreground"
                    title="Manage join link"
                    aria-label="Manage join link"
                  >
                    <Link2 className="size-4" />
                  </Button>
                )}
              </>
            )}

              {/* Phone call quick action */}
            {chat.type === "direct" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Voice call"
                  aria-label="Start voice call"
                  onClick={() => {}}
                  className="hidden md:flex rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-150 hover:scale-110 active:scale-95"
                >
                  <Phone className="h-[18px] w-[18px]" />
                </Button>

                {/* Video call quick action */}
                <Button
                  variant="ghost"
                  size="icon"
                  title="Video call"
                  aria-label="Start video call"
                  onClick={() => {}}
                  className="hidden md:flex rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-150 hover:scale-110 active:scale-95"
                >
                  <Video className="h-[20px] w-[20px]" />
                </Button>
              </>
            )}

            {/* More menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isDeleting}
                  aria-label="Open conversation actions"
                  className="rounded-full text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors ml-1"
                >
                  <MoreVertical className="h-[18px] w-[18px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-lg border-border/60 overflow-hidden p-1">
                {chat.type === "direct" && otherUser?._id && (
                  <DropdownMenuItem
                    onSelect={() => navigate(`/profile/${String(otherUser._id)}`)}
                    className="gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
                  >
                    <UserCircle className="h-[18px] w-[18px] text-muted-foreground" />
                    View profile
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && (
                  <DropdownMenuItem
                    onSelect={() => setTimeout(() => setShowMembersDialog(true), 100)}
                    className="gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
                  >
                    <Users className="h-[18px] w-[18px] text-muted-foreground" />
                    View members
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && isGroupAdmin && (
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleToggleAnnouncementMode();
                    }}
                    disabled={isAnnouncementUpdating}
                    className="gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
                  >
                    <Megaphone className="h-[18px] w-[18px] text-muted-foreground" />
                    {announcementOnly ? "Disable announcement mode" : "Enable announcement mode"}
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && isGroupCreator && (
                  <DropdownMenuItem
                    onSelect={() => setTimeout(() => setShowManageAdminsDialog(true), 100)}
                    className="gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
                  >
                    <ShieldCheck className="h-[18px] w-[18px] text-muted-foreground" />
                    Manage admins
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && isGroupAdmin && (
                  <DropdownMenuItem
                    onSelect={() => setTimeout(() => setShowJoinLinkDialog(true), 100)}
                    className="gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
                  >
                    <Link2 className="h-[18px] w-[18px] text-muted-foreground" />
                    Manage join link
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && isGroupAdmin && hasActiveGroupJoinLink && (
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleRevokeGroupJoinLink();
                    }}
                    className="gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-500/10 dark:focus:text-red-300"
                  >
                    <Link2 className="h-[18px] w-[18px]" />
                    Revoke active join link
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onSelect={() => navigate("/settings/notifications")}
                  className="gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
                >
                  <Bell className="h-[18px] w-[18px] text-muted-foreground" />
                  Notification settings
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-border/60 mx-1" />
                <DropdownMenuItem
                  onSelect={() => setTimeout(() => setShowDeleteDialog(true), 100)}
                  className="gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-500/10 dark:focus:text-red-300"
                >
                  <Trash2 className="h-[18px] w-[18px]" />
                  Delete conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent
          className="max-w-md rounded-2xl p-6 gap-6 outline-none bg-background border border-border/50 shadow-2xl transition-all"
          aria-busy={isDeleting}
        >
          <AlertDialogHeader className="items-center text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20 ring-8 ring-red-50 dark:ring-red-500/10">
              <Trash2 className="size-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="space-y-1.5">
              <AlertDialogTitle className="text-xl font-bold tracking-tight">
                Delete this conversation?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[15px] font-medium leading-relaxed text-muted-foreground/80 px-2">
                This will permanently remove all messages for{" "}
                <strong className="font-semibold text-foreground">
                  {chat.type === "direct"
                    ? otherUser?.displayName ?? "this contact"
                    : chat.group?.name ?? "this group"}
                </strong>. 
                This action cannot be undone.
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-row gap-3 sm:space-x-0 pt-2 w-full">
            <AlertDialogCancel disabled={isDeleting} className="flex-1 rounded-full h-11 font-semibold border-border/60 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={isDeleting}
              className={cn(
                "flex-1 rounded-full h-11 font-semibold text-white transition-all shadow-sm",
                "bg-red-600 hover:bg-red-700 hover:shadow-md active:scale-[0.98]",
                isDeleting && "opacity-70 pointer-events-none"
              )}
            >
              {isDeleting ? "Deleting..." : "Yes, delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showMembersDialog} onOpenChange={handleMembersDialogOpenChange}>
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

      <Dialog open={showManageAdminsDialog} onOpenChange={setShowManageAdminsDialog}>
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
                      void handleToggleAdminRole(memberId, checked);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showJoinLinkDialog}
        onOpenChange={(open) => {
          setShowJoinLinkDialog(open);
          if (!open) {
            setGeneratedJoinLink("");
            setGeneratedJoinLinkExpiresAt(null);
          }
        }}
      >
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <DialogHeader>
              <DialogTitle>Group join link</DialogTitle>
              <DialogDescription>
                Create an expiring invite link for this group.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 p-4">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Link expiry
              </span>
              <select
                value={joinLinkHours}
                onChange={(event) => setJoinLinkHours(Number(event.target.value) || 24)}
                className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/35"
              >
                <option value={1}>1 hour</option>
                <option value={6}>6 hours</option>
                <option value={24}>24 hours</option>
                <option value={72}>72 hours</option>
              </select>
            </label>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => {
                  void handleGenerateGroupJoinLink();
                }}
                disabled={isJoinLinkGenerating}
              >
                {isJoinLinkGenerating ? "Creating..." : "Create new link"}
              </Button>
              {hasActiveGroupJoinLink && (
                <p className="text-xs text-muted-foreground">
                  Active link expires at{" "}
                  {activeGroupJoinLink?.expiresAt
                    ? new Date(activeGroupJoinLink.expiresAt).toLocaleString()
                    : "-"}
                </p>
              )}
            </div>

            {generatedJoinLink && (
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Generated link
                </p>
                <p className="break-all text-sm text-foreground">{generatedJoinLink}</p>
                {generatedJoinLinkExpiresAt && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Expires at {new Date(generatedJoinLinkExpiresAt).toLocaleString()}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 gap-2"
                  onClick={() => {
                    void handleCopyJoinLink();
                  }}
                >
                  <Copy className="size-4" />
                  Copy link
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ChatWindowHeader;
