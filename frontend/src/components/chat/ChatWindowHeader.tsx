import { useChatStore } from "@/stores/useChatStore";
import type {
  Conversation,
} from "@/types/chat";
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
  MoreVertical,
  Trash2,
  UserCircle,
  Megaphone,
  ShieldCheck,
  Users,
  Link2,
  Hash,
  Plus,
  Settings2,
  Rows3,
  Grid2x2,
  AlignJustify,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
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

import NotificationPreferencesDialog from "./NotificationPreferencesDialog";
import { DeleteConversationDialog } from "./dialogs/DeleteConversationDialog";
import { GroupMembersDialog } from "./dialogs/GroupMembersDialog";
import { ManageAdminsDialog } from "./dialogs/ManageAdminsDialog";
import { JoinLinkDialog } from "./dialogs/JoinLinkDialog";
import { ManageChannelsDialog } from "./dialogs/ManageChannelsDialog";

import { Input } from "../ui/input";
import { useThemeStore, type PanelStyle } from "@/stores/useThemeStore";


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

const GROUP_ROLE_LABEL: Record<GroupMemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const formatUnreadCountLabel = (unreadCount: number) => {
  return unreadCount > 99 ? "99+" : String(unreadCount);
};



const buildChannelSelectLabel = (channelName: string, unreadCount: number) => {
  if (unreadCount > 0) {
    return `#${channelName} (${formatUnreadCountLabel(unreadCount)})`;
  }

  return `#${channelName}`;
};

const PANEL_STYLE_TOGGLE_OPTIONS: Array<{
  id: PanelStyle;
  label: string;
  title: string;
  icon: typeof Rows3;
}> = [
  {
    id: "soft-glass",
    label: "Glass",
    title: "Switch to Soft Glass panel",
    icon: Rows3,
  },
  {
    id: "flat-enterprise",
    label: "Flat",
    title: "Switch to Flat Enterprise panel",
    icon: Grid2x2,
  },
  {
    id: "flat-enterprise-ultra",
    label: "Ultra",
    title: "Switch to Flat Enterprise Ultra panel",
    icon: AlignJustify,
  },
];



const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => { // NOSONAR
  const { conversations, activeConversationId, isCallActive, setIsCallActive } = useChatStore();
  const { user } = useAuthStore();
  const { panelStyle, setPanelStyle } = useThemeStore();
  const { getUserPresence, getLastActiveAt, onlineUsers } = useSocketStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showNotificationPreferencesDialog, setShowNotificationPreferencesDialog] =
    useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFriendActionLoading, setIsFriendActionLoading] = useState(false);
  const [showManageAdminsDialog, setShowManageAdminsDialog] = useState(false);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [isAnnouncementUpdating, setIsAnnouncementUpdating] = useState(false);
  const [adminActionTarget, setAdminActionTarget] = useState<string | null>(null);
  const [showJoinLinkDialog, setShowJoinLinkDialog] = useState(false);
  const [showCreateChannelDialog, setShowCreateChannelDialog] = useState(false);
  const [showManageChannelsDialog, setShowManageChannelsDialog] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDescription, setNewChannelDescription] = useState("");
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const navigate = useNavigate();
  const {
    createConversation,
    setActiveConversation,
    fetchMessages,
    deleteConversation,
    setGroupAnnouncementMode,
    setGroupAdminRole,
    createGroupChannel,
    setGroupActiveChannel,
    revokeGroupJoinLink,
  } = useChatStore();
  const { removeFriend } = useFriendStore();

  chat =
    chat ??
    conversations.find(
      (c) => String(c._id) === String(activeConversationId || ""),
    );

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
  const groupChannels = useMemo(() => {
    const rawChannels =
      chat?.type === "group" ? chat.group?.channels || [] : [];

    if (rawChannels.length === 0) {
      return [
        {
          channelId: "general",
          name: "general",
          description: "",
        },
      ];
    }

    return [...rawChannels].sort(
      (a, b) => Number(a.position || 0) - Number(b.position || 0),
    );
  }, [chat?.type, chat?.group?.channels]);
  const groupChannelCategories = useMemo(() => {
    if (chat?.type !== "group") {
      return [];
    }

    return [...(chat.group?.channelCategories || [])].sort(
      (a, b) => Number(a.position || 0) - Number(b.position || 0),
    );
  }, [chat?.type, chat?.group?.channelCategories]);
  const myChannelUnreadMap =
    chat?.type === "group"
      ? chat.group?.channelUnreadCounts?.[myUserId] || {}
      : {};
  const activeGroupChannelId =
    chat?.type === "group"
      ? String(chat.group?.activeChannelId || groupChannels[0]?.channelId || "general")
      : "";
  const activeGroupChannel =
    chat?.type === "group"
      ? groupChannels.find(
          (channel) => String(channel.channelId) === activeGroupChannelId,
        ) || groupChannels[0] || null
      : null;
  const activeGroupChannelUnread =
    chat?.type === "group" && activeGroupChannel
      ? Math.max(0, Number(myChannelUnreadMap?.[activeGroupChannel.channelId] || 0))
      : 0;
  const activeGroupChannelPosition =
    chat?.type === "group" && activeGroupChannel
      ? Math.max(
          0,
          groupChannels.findIndex(
            (channel) => String(channel.channelId) === String(activeGroupChannel.channelId),
          ),
        ) + 1
      : 0;
  const currentUserGroupRole =
    chat?.type === "group" && myUserId
      ? getGroupMemberRole(myUserId, ownerId, groupAdminIds)
      : null;
  const groupLeadershipCount =
    chat?.type === "group"
      ? new Set([ownerId, ...Array.from(groupAdminIds)].filter(Boolean)).size
      : 0;
  const totalGroupUnread =
    chat?.type === "group"
      ? Object.values(myChannelUnreadMap || {}).reduce((sum, rawCount) => {
          const parsedCount = Number(rawCount);
          return sum + (Number.isFinite(parsedCount) ? Math.max(0, parsedCount) : 0);
        }, 0)
      : 0;
  const groupHeaderStatusLabel = (() => {
    if (chat?.type !== "group") {
      return "";
    }

    if (announcementOnly) {
      return "Announce only";
    }

    if (totalGroupUnread > 0) {
      return `${formatUnreadCountLabel(totalGroupUnread)} unread`;
    }

    return "Realtime";
  })();
  const groupedChannelOptions = useMemo(() => {
    if (chat?.type !== "group") {
      return [] as Array<{
        categoryId: string | null;
        label: string;
        channels: typeof groupChannels;
      }>;
    }

    const grouped = new Map<string | null, typeof groupChannels>();
    groupChannels.forEach((channel) => {
      const key = channel.categoryId || null;
      const existing = grouped.get(key) || [];
      existing.push(channel);
      grouped.set(key, existing);
    });

    const sections: Array<{
      categoryId: string | null;
      label: string;
      channels: typeof groupChannels;
    }> = [];

    groupChannelCategories.forEach((category) => {
      const channelsInCategory = grouped.get(category.categoryId) || [];
      if (channelsInCategory.length === 0) {
        return;
      }

      sections.push({
        categoryId: category.categoryId,
        label: category.name,
        channels: channelsInCategory,
      });
    });

    const uncategorizedChannels = grouped.get(null) || [];
    if (uncategorizedChannels.length > 0) {
      sections.push({
        categoryId: null,
        label: "Uncategorized",
        channels: uncategorizedChannels,
      });
    }

    return sections;
  }, [chat?.type, groupChannelCategories, groupChannels]);






  if (!chat) {
    return (
      <header className="chat-header-shell chat-header-shell--command chat-header-shell--elevated sticky top-0 flex w-full items-center gap-2 px-4 py-2 md:hidden">
        <SidebarTrigger className="-ml-1 h-9 w-9 rounded-xl text-foreground" />
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
  };



  const handleSwitchGroupChannel = async (nextChannelId: string) => {
    if (chat.type !== "group") {
      return;
    }

    const normalizedChannelId = String(nextChannelId || "").trim();
    if (!normalizedChannelId || normalizedChannelId === activeGroupChannelId) {
      return;
    }

    const ok = await setGroupActiveChannel(chat._id, normalizedChannelId);
    if (!ok) {
      toast.error("Could not switch channel");
    }
  };

  const handleCycleGroupChannel = (direction: "next" | "prev") => {
    if (chat?.type !== "group" || groupChannels.length <= 1) {
      return;
    }

    const currentIndex = groupChannels.findIndex(
      (channel) => String(channel.channelId) === activeGroupChannelId,
    );
    const safeCurrentIndex = Math.max(0, currentIndex);
    const delta = direction === "next" ? 1 : -1;
    const nextIndex =
      (safeCurrentIndex + delta + groupChannels.length) % groupChannels.length;
    const nextChannel = groupChannels[nextIndex];

    if (!nextChannel?.channelId) {
      return;
    }

    void handleSwitchGroupChannel(nextChannel.channelId);
  };

  const handleCreateGroupChannel = async () => {
    if (chat.type !== "group" || !isGroupAdmin) {
      return;
    }

    const normalizedName = String(newChannelName || "")
      .replaceAll(/\s+/g, " ")
      .trim();

    if (normalizedName.length < 2 || normalizedName.length > 40) {
      toast.error("Channel name must be 2-40 characters");
      return;
    }

    try {
      setIsCreatingChannel(true);

      const result = await createGroupChannel(
        chat._id,
        normalizedName,
        newChannelDescription,
      );

      if (!result.ok) {
        toast.error(result.message || "Could not create channel");
        return;
      }

      toast.success(`Channel #${normalizedName} created`);
      setNewChannelName("");
      setNewChannelDescription("");
      setShowCreateChannelDialog(false);
    } finally {
      setIsCreatingChannel(false);
    }
  };






  return (
    <>
      <header className="gradient-border-bottom chat-header-shell chat-header-shell--command chat-header-shell--elevated chat-window-header-main sticky top-0 flex items-center px-4 py-3">
        <div className="chat-header-row chat-header-row--command">
          <div className="chat-header-left min-w-0">
            {/* Sidebar toggle — only on mobile */}
            <SidebarTrigger className="-ml-0.5 h-9 w-9 rounded-xl text-foreground md:hidden" />

            {/* Avatar + name */}
            <div
              className={cn(
                "chat-header-identity chat-header-identity--command chat-header-identity--enterprise chat-header-identity--compact",
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
              <div key={chat._id} className="chat-header-title-block min-w-0 flex flex-col justify-center">
                <h2 className="chat-header-title truncate font-semibold tracking-tight text-[15px] text-foreground transition-colors">
                  {chat.type === "direct"
                    ? otherUser?.displayName
                    : chat.group?.name}
                </h2>
                <div className="chat-header-subline flex items-center gap-1.5 mt-[2px]">
                  {chat.type === "direct" && (() => {
                    const pres = getUserPresence(otherUser?._id);
                    const lastActiveAt = getLastActiveAt(otherUser?._id);
                    if (pres === "online") {
                        return (
                          <span className="chat-header-direct-status chat-header-direct-status--online inline-flex items-center gap-1">
                            <span className="chat-header-direct-status-dot" aria-hidden="true" />
                            <span className="chat-header-direct-status-label">Active now</span>
                          </span>
                        );
                    }
                    if (pres === "recently-active" && lastActiveAt) {
                      const timeStr = formatOnlineTime(new Date(lastActiveAt));
                      return (
                        <span className="chat-header-direct-status chat-header-direct-status--recent inline-flex items-center gap-1 text-[12px] font-medium leading-none">
                          Active {timeStr} ago
                        </span>
                      );
                    }
                    return (
                      <span className="chat-header-direct-status chat-header-direct-status--offline inline-flex items-center gap-1 text-[12px] font-medium leading-none">
                        Offline
                      </span>
                    );
                  })()}
                  {chat.type === "group" && (
                    <div className="chat-header-group-meta flex flex-wrap items-center gap-1.5">
                      <span className="chat-header-presence text-[12px] text-muted-foreground font-medium leading-none">
                        {groupPresenceText}
                      </span>
                      <span
                        className={cn(
                          "chat-header-group-status inline-flex items-center gap-1 font-semibold",
                          announcementOnly || totalGroupUnread > 0
                            ? "chat-header-group-status--alert"
                            : "chat-header-group-status--neutral",
                        )}
                        aria-live="polite"
                      >
                        {announcementOnly ? (
                          <Megaphone className="chat-header-group-status-icon size-2.5" />
                        ) : (
                          <span className="chat-header-group-status-dot" aria-hidden="true" />
                        )}
                        {groupHeaderStatusLabel}
                      </span>

                      {activeGroupChannel && (
                        <span className="chat-header-context-pill chat-header-context-pill--channel inline-flex items-center rounded-full text-[10px] font-semibold">
                          <Hash className="chat-header-context-pill-icon size-2.5" />
                          <span className="chat-header-context-pill-channel-name">#{activeGroupChannel.name}</span>
                          {groupChannels.length > 1 && (
                            <span className="chat-header-context-pill-channel-index">
                              {activeGroupChannelPosition}/{groupChannels.length}
                            </span>
                          )}
                          {activeGroupChannelUnread > 0 && (
                            <span className="chat-header-context-pill-badge inline-flex items-center justify-center rounded-full text-[9px] font-bold">
                              {formatUnreadCountLabel(activeGroupChannelUnread)}
                            </span>
                          )}
                        </span>
                      )}

                      {currentUserGroupRole && (
                        <span className="chat-header-context-pill chat-header-context-pill--role hidden lg:inline-flex items-center text-[10px] font-semibold">
                          <span>You: {GROUP_ROLE_LABEL[currentUserGroupRole]}</span>
                          <span className="chat-header-context-pill-role-meta">
                            · {groupLeadershipCount} lead
                            {groupLeadershipCount === 1 ? "" : "s"}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right actions */}
          <div className="chat-header-actions chat-header-actions--command flex flex-shrink-0 items-center">
            <div
              className="chat-header-panel-toggle hidden lg:inline-flex items-center rounded-full p-0.5"
            >
              {PANEL_STYLE_TOGGLE_OPTIONS.map((option) => {
                const active = panelStyle === option.id;
                const Icon = option.icon;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPanelStyle(option.id)}
                    className={cn(
                      "chat-header-panel-toggle-btn inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold",
                      active && "chat-header-panel-toggle-btn--active",
                    )}
                    aria-pressed={active}
                    title={option.title}
                  >
                    <Icon className="size-3.5" />
                    <span className="hidden xl:inline">{option.label}</span>
                  </button>
                );
              })}
            </div>

            <GlobalSearchDialog />
            
            {/* WebRTC Video Call Button */}
            {chat.type === "group" || chat.type === "direct" ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsCallActive(true)}
                disabled={isCallActive}
                className="chat-header-action-btn chat-header-action-btn--command chat-header-action-btn--mobile-density rounded-full hidden lg:inline-flex h-8 w-8 text-primary hover:text-primary hover:bg-primary/10 transition-colors"
                title="Start Video Call"
              >
                <Video className="size-[18px]" />
              </Button>
            ) : null}

            <NotificationPreferencesDialog
              open={showNotificationPreferencesDialog}
              onOpenChange={setShowNotificationPreferencesDialog}
              triggerClassName="chat-header-action-btn chat-header-action-btn--command chat-header-action-btn--mobile-density rounded-full hidden lg:inline-flex h-8 w-8"
            />

            {chat.type === "group" && (
              <div className="hidden lg:flex items-center gap-1.5">
                <span id="group-channel-shortcut-hint" className="sr-only">
                  Use Alt plus Arrow Up or Arrow Down to switch channels quickly.
                </span>
                <select
                  id="group-channel-switcher"
                  data-testid="group-channel-switcher-header"
                  value={activeGroupChannelId}
                  onChange={(event) => {
                    void handleSwitchGroupChannel(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    const isPrevShortcut =
                      (event.altKey && event.key === "ArrowUp") ||
                      (event.ctrlKey && event.shiftKey && event.key === "[");
                    const isNextShortcut =
                      (event.altKey && event.key === "ArrowDown") ||
                      (event.ctrlKey && event.shiftKey && event.key === "]");

                    if (!isPrevShortcut && !isNextShortcut) {
                      return;
                    }

                    event.preventDefault();
                    handleCycleGroupChannel(isNextShortcut ? "next" : "prev");
                  }}
                  aria-label="Switch active group channel"
                  aria-describedby="group-channel-shortcut-hint"
                  title="Switch group channel"
                  className="chat-channel-select chat-header-action-btn--command h-8 min-w-[130px] rounded-full border border-border/70 bg-background px-3 text-[11px] font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/35"
                >
                  {groupedChannelOptions.map((section) => {
                    if (section.categoryId === null) {
                      return section.channels.map((channel) => {
                        const unread = Number(
                          myChannelUnreadMap?.[channel.channelId] || 0,
                        );
                        return (
                          <option key={channel.channelId} value={channel.channelId}>
                            {buildChannelSelectLabel(channel.name, unread)}
                          </option>
                        );
                      });
                    }

                    return (
                      <optgroup key={section.categoryId} label={section.label}>
                        {section.channels.map((channel) => {
                          const unread = Number(
                            myChannelUnreadMap?.[channel.channelId] || 0,
                          );
                          return (
                            <option key={channel.channelId} value={channel.channelId}>
                              {buildChannelSelectLabel(channel.name, unread)}
                            </option>
                          );
                        })}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
            )}

            {/* More menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isDeleting}
                  aria-label="Open conversation actions"
                  className="chat-header-action-btn chat-header-action-btn--command chat-header-action-btn--mobile-density rounded-full h-9 w-9 md:h-8 md:w-8"
                >
                  <MoreVertical className="h-[18px] w-[18px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="chat-header-dropdown-panel chat-header-dropdown-panel--command w-56 rounded-xl shadow-lg border-border/60 overflow-hidden p-1">
                {chat.type === "direct" && otherUser?._id && (
                  <DropdownMenuItem
                    onSelect={() => navigate(`/profile/${String(otherUser._id)}`)}
                    className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5"
                  >
                    <UserCircle className="h-[18px] w-[18px] text-muted-foreground" />
                    View profile
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && (
                  <DropdownMenuItem
                    onSelect={() => setTimeout(() => setShowMembersDialog(true), 100)}
                    className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5"
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
                    className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5"
                  >
                    <Megaphone className="h-[18px] w-[18px] text-muted-foreground" />
                    {announcementOnly ? "Disable announcement mode" : "Enable announcement mode"}
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && isGroupCreator && (
                  <DropdownMenuItem
                    onSelect={() => setTimeout(() => setShowManageAdminsDialog(true), 100)}
                    className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5"
                  >
                    <ShieldCheck className="h-[18px] w-[18px] text-muted-foreground" />
                    Manage admins
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && isGroupAdmin && (
                  <DropdownMenuItem
                    onSelect={() => setTimeout(() => setShowCreateChannelDialog(true), 100)}
                    className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5"
                  >
                    <Plus className="h-[18px] w-[18px] text-muted-foreground" />
                    Create channel
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && isGroupAdmin && (
                  <DropdownMenuItem
                    onSelect={() => setTimeout(() => setShowManageChannelsDialog(true), 100)}
                    className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5"
                  >
                    <Settings2 className="h-[18px] w-[18px] text-muted-foreground" />
                    Manage channels
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && isGroupAdmin && (
                  <DropdownMenuItem
                    onSelect={() => setTimeout(() => setShowJoinLinkDialog(true), 100)}
                    className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5"
                  >
                    <Link2 className="h-[18px] w-[18px] text-muted-foreground" />
                    Manage join link
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && isGroupAdmin && hasActiveGroupJoinLink && (
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void revokeGroupJoinLink(chat._id);
                    }}
                    className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <Link2 className="h-[18px] w-[18px]" />
                    Revoke active join link
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onSelect={() =>
                    setTimeout(() => setShowNotificationPreferencesDialog(true), 100)
                  }
                  className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5"
                >
                  <Bell className="h-[18px] w-[18px] text-muted-foreground" />
                  Notification preferences
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-border/60 mx-1" />
                <DropdownMenuItem
                  onSelect={() => setTimeout(() => setShowDeleteDialog(true), 100)}
                  className="chat-header-dropdown-item chat-header-dropdown-item--command gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
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
      <DeleteConversationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        isDeleting={isDeleting}
        onConfirm={handleDeleteConversation}
        chatType={chat.type}
        chatName={chat.type === "direct"
          ? otherUser?.displayName ?? "this contact"
          : chat.group?.name ?? "this group"
        }
      />



      <GroupMembersDialog
        open={showMembersDialog}
        onOpenChange={handleMembersDialogOpenChange}
        groupMembersWithRole={groupMembersWithRole as any}
      />

      <ManageAdminsDialog
        open={showManageAdminsDialog}
        onOpenChange={setShowManageAdminsDialog}
        manageableMembers={manageableMembers}
        groupAdminIds={groupAdminIds}
        adminActionTarget={adminActionTarget}
        onToggleAdminRole={(memberId, checked) => {
          void handleToggleAdminRole(memberId, checked);
        }}
      />

      <ManageChannelsDialog
        open={showManageChannelsDialog}
        onOpenChange={setShowManageChannelsDialog}
        chat={chat}
        isGroupAdmin={isGroupAdmin}
      />

      <Dialog
        open={showCreateChannelDialog}
        onOpenChange={(open) => {
          setShowCreateChannelDialog(open);
          if (!open) {
            setNewChannelName("");
            setNewChannelDescription("");
          }
        }}
      >
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <DialogHeader>
              <DialogTitle>Create text channel</DialogTitle>
              <DialogDescription>
                Add a focused space inside this group, inspired by Discord channel organization.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-3 p-4">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Channel name
              </span>
              <Input
                value={newChannelName}
                onChange={(event) => setNewChannelName(event.target.value)}
                placeholder="Announcements, design, backend..."
                maxLength={40}
                disabled={isCreatingChannel}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Description (optional)
              </span>
              <Input
                value={newChannelDescription}
                onChange={(event) => setNewChannelDescription(event.target.value)}
                placeholder="What should members discuss here?"
                maxLength={120}
                disabled={isCreatingChannel}
              />
            </label>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateChannelDialog(false)}
                disabled={isCreatingChannel}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void handleCreateGroupChannel();
                }}
                disabled={isCreatingChannel}
              >
                {isCreatingChannel ? "Creating..." : "Create channel"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <JoinLinkDialog
        open={showJoinLinkDialog}
        onOpenChange={setShowJoinLinkDialog}
        chat={chat}
        isGroupAdmin={isGroupAdmin}
        activeGroupJoinLink={activeGroupJoinLink}
      />
    </>
  );
};

export default ChatWindowHeader;
