import { useChatStore } from "@/stores/useChatStore";
import type {
  Conversation,
  GroupChannelAnalyticsPayload,
  GroupChannelRole,
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
  Hash,
  Plus,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Settings2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { Input } from "../ui/input";

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

const formatUnreadCountLabel = (unreadCount: number) => {
  return unreadCount > 99 ? "99+" : String(unreadCount);
};

const buildChannelSelectLabel = (channelName: string, unreadCount: number) => {
  if (unreadCount > 0) {
    return `#${channelName} (${formatUnreadCountLabel(unreadCount)})`;
  }

  return `#${channelName}`;
};

const GroupRoleBadge = ({ role }: { role: GroupMemberRole }) => {
  if (role === "owner") {
    return (
      <span className="chat-header-context-pill inline-flex items-center gap-1 rounded-full border border-warning/45 bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
        <Crown className="size-2.5" />
        Owner
      </span>
    );
  }

  if (role === "admin") {
    return (
      <span className="chat-header-context-pill inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
        <Shield className="size-2.5" />
        Admin
      </span>
    );
  }

  return (
    <span className="chat-header-context-pill inline-flex items-center rounded-full border border-border/70 bg-muted/35 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
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
  const [joinLinkMaxUsesInput, setJoinLinkMaxUsesInput] = useState("");
  const [joinLinkOneTime, setJoinLinkOneTime] = useState(false);
  const [generatedJoinLink, setGeneratedJoinLink] = useState("");
  const [generatedJoinLinkExpiresAt, setGeneratedJoinLinkExpiresAt] = useState<string | null>(null);
  const [joinLinkErrorMessage, setJoinLinkErrorMessage] = useState("");
  const [joinLinkCooldownSeconds, setJoinLinkCooldownSeconds] = useState(0);
  const [showCreateChannelDialog, setShowCreateChannelDialog] = useState(false);
  const [showManageChannelsDialog, setShowManageChannelsDialog] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDescription, setNewChannelDescription] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [selectedManageChannelId, setSelectedManageChannelId] = useState("");
  const [manageChannelName, setManageChannelName] = useState("");
  const [manageChannelDescription, setManageChannelDescription] = useState("");
  const [manageChannelCategoryId, setManageChannelCategoryId] = useState("");
  const [manageSendRoles, setManageSendRoles] = useState<GroupChannelRole[]>([
    "owner",
    "admin",
    "member",
  ]);
  const [isSavingChannelSettings, setIsSavingChannelSettings] = useState(false);
  const [isDeletingChannel, setIsDeletingChannel] = useState(false);
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [analyticsDays, setAnalyticsDays] = useState(7);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [channelAnalytics, setChannelAnalytics] =
    useState<GroupChannelAnalyticsPayload | null>(null);
  const navigate = useNavigate();
  const {
    createConversation,
    setActiveConversation,
    fetchMessages,
    deleteConversation,
    setGroupAnnouncementMode,
    setGroupAdminRole,
    createGroupChannel,
    updateGroupChannel,
    deleteGroupChannel,
    reorderGroupChannels,
    createGroupChannelCategory,
    updateGroupChannelCategory,
    deleteGroupChannelCategory,
    reorderGroupChannelCategories,
    fetchGroupChannelAnalytics,
    setGroupActiveChannel,
    createGroupJoinLink,
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
      ? groupChannels.find((channel) => String(channel.channelId) === activeGroupChannelId) ||
        groupChannels[0]
      : null;
  const activeGroupChannelUnread =
    chat?.type === "group"
      ? Number(myChannelUnreadMap?.[activeGroupChannelId] || 0)
      : 0;
  const totalGroupUnread =
    chat?.type === "group"
      ? Object.values(myChannelUnreadMap || {}).reduce((sum, rawCount) => {
          const parsedCount = Number(rawCount);
          return sum + (Number.isFinite(parsedCount) ? Math.max(0, parsedCount) : 0);
        }, 0)
      : 0;
  const activeChannelOrdinal =
    chat?.type === "group"
      ? Math.max(
          1,
          groupChannels.findIndex(
            (channel) => String(channel.channelId) === activeGroupChannelId,
          ) + 1,
        )
      : 1;
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
  const selectedManageChannel =
    chat?.type === "group"
      ? groupChannels.find((channel) => channel.channelId === selectedManageChannelId) ||
        groupChannels[0] ||
        null
      : null;

  useEffect(() => {
    if (!showManageChannelsDialog || chat?.type !== "group") {
      return;
    }

    const fallbackChannelId =
      selectedManageChannelId ||
      activeGroupChannelId ||
      groupChannels[0]?.channelId ||
      "";

    const nextSelectedChannel =
      groupChannels.find((channel) => channel.channelId === fallbackChannelId) ||
      groupChannels[0] ||
      null;

    if (!nextSelectedChannel) {
      return;
    }

    setSelectedManageChannelId(nextSelectedChannel.channelId);
    setManageChannelName(nextSelectedChannel.name || "");
    setManageChannelDescription(nextSelectedChannel.description || "");
    setManageChannelCategoryId(nextSelectedChannel.categoryId || "");
    setManageSendRoles(
      nextSelectedChannel.permissions?.sendRoles?.length
        ? nextSelectedChannel.permissions.sendRoles
        : ["owner", "admin", "member"],
    );

    setCategoryDrafts(
      (chat.group?.channelCategories || []).reduce<Record<string, string>>(
        (drafts, category) => {
          drafts[category.categoryId] = category.name || "";
          return drafts;
        },
        {},
      ),
    );
  }, [
    activeGroupChannelId,
    chat,
    groupChannels,
    selectedManageChannelId,
    showManageChannelsDialog,
  ]);

  useEffect(() => {
    if (joinLinkCooldownSeconds <= 0) {
      return;
    }

    const timer = globalThis.setInterval(() => {
      setJoinLinkCooldownSeconds((previous) => (previous > 1 ? previous - 1 : 0));
    }, 1000);

    return () => {
      globalThis.clearInterval(timer);
    };
  }, [joinLinkCooldownSeconds]);

  if (!chat) {
    return (
      <header className="md:hidden chat-header-shell chat-header-shell--elevated sticky top-0 flex items-center gap-2 px-4 py-2 w-full">
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

    if (joinLinkCooldownSeconds > 0) {
      return;
    }

    const normalizedMaxUsesInput = String(joinLinkMaxUsesInput || "").trim();
    const parsedMaxUses =
      normalizedMaxUsesInput.length > 0
        ? Number(normalizedMaxUsesInput)
        : null;

    if (
      !joinLinkOneTime &&
      parsedMaxUses !== null &&
      (!Number.isInteger(parsedMaxUses) || parsedMaxUses < 1 || parsedMaxUses > 500)
    ) {
      toast.error("Max uses must be an integer between 1 and 500");
      return;
    }

    const maxUses = joinLinkOneTime
      ? 1
      : parsedMaxUses;

    try {
      setIsJoinLinkGenerating(true);
      setJoinLinkErrorMessage("");
      const result = await createGroupJoinLink(chat._id, {
        expiresInHours: joinLinkHours,
        maxUses,
        oneTime: joinLinkOneTime,
      });
      if (!result.ok || !result.joinLinkUrl) {
        if (result.retryAfterSeconds && result.retryAfterSeconds > 0) {
          setJoinLinkCooldownSeconds(result.retryAfterSeconds);
        }

        setJoinLinkErrorMessage(
          result.message || "Could not create join link right now.",
        );
        toast.error(result.message || "Could not create join link");
        return;
      }

      setGeneratedJoinLink(result.joinLinkUrl);
      setGeneratedJoinLinkExpiresAt(result.expiresAt || null);
      setJoinLinkOneTime(Boolean(result.oneTime));
      if (result.maxUses && !result.oneTime) {
        setJoinLinkMaxUsesInput(String(result.maxUses));
      } else if (!result.maxUses) {
        setJoinLinkMaxUsesInput("");
      }
      setJoinLinkCooldownSeconds(0);
      setJoinLinkErrorMessage("");
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
    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
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

  const refreshChannelAnalytics = async (days = analyticsDays) => {
    if (chat.type !== "group" || !isGroupAdmin) {
      return;
    }

    try {
      setAnalyticsLoading(true);
      const result = await fetchGroupChannelAnalytics(chat._id, days);
      if (!result.ok) {
        setChannelAnalytics(null);
        return;
      }

      setChannelAnalytics(result.analytics || null);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleToggleSendRole = (role: GroupChannelRole, checked: boolean) => {
    setManageSendRoles((previousRoles) => {
      const nextSet = new Set(previousRoles);
      if (checked) {
        nextSet.add(role);
      } else {
        nextSet.delete(role);
      }

      const nextRoles = Array.from(nextSet) as GroupChannelRole[];
      if (nextRoles.length === 0) {
        return ["owner", "admin", "member"];
      }

      return nextRoles;
    });
  };

  const handleMoveChannel = async (
    channelId: string,
    direction: "up" | "down",
  ) => {
    if (chat.type !== "group") {
      return;
    }

    const orderedIds = groupChannels.map((channel) => channel.channelId);
    const index = orderedIds.indexOf(channelId);
    if (index < 0) {
      return;
    }

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedIds.length) {
      return;
    }

    const nextOrder = [...orderedIds];
    const [movedChannelId] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, movedChannelId);

    const ok = await reorderGroupChannels(chat._id, nextOrder);
    if (!ok) {
      toast.error("Could not reorder channels");
      return;
    }

    toast.success("Channel order updated");
  };

  const handleSaveSelectedChannel = async () => {
    if (chat.type !== "group" || !selectedManageChannel) {
      return;
    }

    const normalizedName = String(manageChannelName || "")
      .replaceAll(/\s+/g, " ")
      .trim();

    if (normalizedName.length < 2 || normalizedName.length > 40) {
      toast.error("Channel name must be 2-40 characters");
      return;
    }

    try {
      setIsSavingChannelSettings(true);

      const result = await updateGroupChannel(chat._id, selectedManageChannel.channelId, {
        name: normalizedName,
        description: manageChannelDescription,
        categoryId: manageChannelCategoryId || null,
        sendRoles: manageSendRoles,
      });

      if (!result.ok) {
        toast.error(result.message || "Could not update channel");
        return;
      }

      toast.success("Channel updated");
      await refreshChannelAnalytics();
    } finally {
      setIsSavingChannelSettings(false);
    }
  };

  const handleDeleteSelectedChannel = async () => {
    if (chat.type !== "group" || !selectedManageChannel) {
      return;
    }

    if (selectedManageChannel.channelId === "general") {
      toast.error("Default #general channel cannot be deleted");
      return;
    }

    const confirmed = globalThis.confirm(
      `Delete #${selectedManageChannel.name}? This removes channel messages permanently.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsDeletingChannel(true);
      const result = await deleteGroupChannel(chat._id, selectedManageChannel.channelId);

      if (!result.ok) {
        toast.error(result.message || "Could not delete channel");
        return;
      }

      toast.success("Channel deleted");
      await refreshChannelAnalytics();
    } finally {
      setIsDeletingChannel(false);
    }
  };

  const handleMoveCategory = async (
    categoryId: string,
    direction: "up" | "down",
  ) => {
    if (chat.type !== "group") {
      return;
    }

    const orderedIds = groupChannelCategories.map((category) => category.categoryId);
    const index = orderedIds.indexOf(categoryId);
    if (index < 0) {
      return;
    }

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedIds.length) {
      return;
    }

    const nextOrder = [...orderedIds];
    const [movedCategoryId] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, movedCategoryId);

    const ok = await reorderGroupChannelCategories(chat._id, nextOrder);
    if (!ok) {
      toast.error("Could not reorder categories");
      return;
    }

    toast.success("Category order updated");
  };

  const handleSaveCategoryName = async (categoryId: string) => {
    if (chat.type !== "group") {
      return;
    }

    const nextName = String(categoryDrafts[categoryId] || "")
      .replaceAll(/\s+/g, " ")
      .trim();

    if (nextName.length < 2 || nextName.length > 40) {
      toast.error("Category name must be 2-40 characters");
      return;
    }

    const result = await updateGroupChannelCategory(chat._id, categoryId, {
      name: nextName,
    });

    if (!result.ok) {
      toast.error(result.message || "Could not update category");
      return;
    }

    toast.success("Category updated");
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (chat.type !== "group") {
      return;
    }

    const categoryName =
      groupChannelCategories.find((category) => category.categoryId === categoryId)
        ?.name || "this category";
    const confirmed = globalThis.confirm(
      `Delete category "${categoryName}"? Channels will become uncategorized.`,
    );

    if (!confirmed) {
      return;
    }

    const result = await deleteGroupChannelCategory(chat._id, categoryId);
    if (!result.ok) {
      toast.error(result.message || "Could not delete category");
      return;
    }

    toast.success("Category deleted");
  };

  const handleCreateCategory = async () => {
    if (chat.type !== "group") {
      return;
    }

    const normalizedName = String(newCategoryName || "")
      .replaceAll(/\s+/g, " ")
      .trim();

    if (normalizedName.length < 2 || normalizedName.length > 40) {
      toast.error("Category name must be 2-40 characters");
      return;
    }

    try {
      setIsCreatingCategory(true);
      const result = await createGroupChannelCategory(
        chat._id,
        normalizedName,
      );

      if (!result.ok) {
        toast.error(result.message || "Could not create category");
        return;
      }

      setNewCategoryName("");
      toast.success("Category created");
    } finally {
      setIsCreatingCategory(false);
    }
  };

  let joinLinkButtonLabel = "Create new link";
  if (isJoinLinkGenerating) {
    joinLinkButtonLabel = "Creating...";
  } else if (joinLinkCooldownSeconds > 0) {
    joinLinkButtonLabel = `Retry in ${joinLinkCooldownSeconds}s`;
  }

  const activeJoinLinkPolicyLabel = (() => {
    if (!hasActiveGroupJoinLink || !activeGroupJoinLink) {
      return "";
    }

    if (activeGroupJoinLink.oneTime) {
      return "One-time link";
    }

    if (
      typeof activeGroupJoinLink.maxUses === "number" &&
      Number.isFinite(activeGroupJoinLink.maxUses)
    ) {
      const remainingUses =
        typeof activeGroupJoinLink.remainingUses === "number"
          ? Math.max(0, Math.floor(activeGroupJoinLink.remainingUses))
          : null;

      if (remainingUses !== null) {
        return `${remainingUses} uses left`;
      }

      return `Max ${Math.floor(activeGroupJoinLink.maxUses)} uses`;
    }

    return "Unlimited uses";
  })();

  return (
    <>
      <header className="gradient-border-bottom chat-header-shell chat-header-shell--elevated chat-window-header-main sticky top-0 flex items-center px-4 py-3">
        <div className="chat-header-row flex items-center gap-2 w-full justify-between">
          <div className="chat-header-left flex items-center gap-2 min-w-0">
            {/* Sidebar toggle — only on mobile */}
            <SidebarTrigger className="-ml-0.5 text-foreground md:hidden" />

            {/* Avatar + name */}
            <div
              className={cn(
                "chat-header-identity chat-header-identity--enterprise chat-header-identity--compact",
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
                          <span className="chat-header-presence chat-header-presence--online flex items-center gap-1.5">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-online/70 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-online"></span>
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
                        <span className="chat-header-presence text-[12px] text-muted-foreground font-medium leading-none">
                          Active {timeStr} ago
                        </span>
                      );
                    }
                    return (
                      <span className="chat-header-presence text-[12px] text-muted-foreground/60 font-medium leading-none">
                        Offline
                      </span>
                    );
                  })()}
                  {chat.type === "group" && (
                    <div className="chat-header-group-meta flex items-center gap-1.5">
                      <span className="chat-header-presence text-[12px] text-muted-foreground font-medium leading-none">
                        {groupPresenceText}
                      </span>
                      {activeGroupChannel && (
                        <span className="chat-header-context-pill inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          <Hash className="size-2.5" />
                          #{activeGroupChannel.name}
                          {activeGroupChannelUnread > 0 && (
                            <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[9px] leading-none">
                              {activeGroupChannelUnread > 99
                                ? "99+"
                                : activeGroupChannelUnread}
                            </span>
                          )}
                        </span>
                      )}
                      <span className="chat-header-context-pill hidden sm:inline-flex items-center rounded-full border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {activeChannelOrdinal}/{groupChannels.length} channels
                      </span>
                      <span className="chat-header-context-pill hidden sm:inline-flex items-center rounded-full border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {groupAdminCount} admins
                      </span>
                      {totalGroupUnread > 0 && (
                        <span
                          className="chat-header-context-pill hidden md:inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                          aria-live="polite"
                        >
                          {formatUnreadCountLabel(totalGroupUnread)} unread
                        </span>
                      )}
                      <span className="chat-header-context-pill hidden md:inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        You: {currentGroupRoleLabel}
                      </span>
                      {(currentUserGroupRole === "owner" || currentUserGroupRole === "admin") && (
                        <GroupRoleBadge role={currentUserGroupRole} />
                      )}
                      {announcementOnly && (
                        <span className="chat-header-context-pill hidden lg:inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          Announcement mode
                        </span>
                      )}
                      <span className="chat-header-context-pill hidden xl:inline-flex items-center rounded-full border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Alt + ↑/↓ to switch channel
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right actions */}
          <div className="chat-header-actions flex items-center gap-1 flex-shrink-0">
            <GlobalSearchDialog />
            <NotificationPreferencesDialog />

            {chat.type === "group" && (
              <>
                <div className="hidden md:flex items-center gap-1.5">
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
                    className="h-8 min-w-[130px] rounded-full border border-border/70 bg-background px-3 text-[11px] font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/35"
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

                  {isGroupAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowManageChannelsDialog(true)}
                      className="chat-header-pill-btn hidden lg:inline-flex rounded-full h-8 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      title="Manage channels"
                    >
                      <Settings2 className="size-3.5 mr-1.5" />
                      Manage
                    </Button>
                  )}

                  {isGroupAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCreateChannelDialog(true)}
                      className="chat-header-pill-btn hidden lg:inline-flex rounded-full h-8 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      title="Create channel"
                    >
                      <Plus className="size-3.5 mr-1.5" />
                      Channel
                    </Button>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMembersDialog(true)}
                  className="chat-header-pill-btn hidden lg:inline-flex rounded-full h-8 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
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
                    className="chat-header-pill-btn hidden lg:inline-flex rounded-full h-8 px-3 text-xs font-semibold"
                    title={announcementOnly ? "Disable announcement mode" : "Enable announcement mode"}
                  >
                    {isAnnouncementUpdating ? (
                      <span
                        className="skeleton-shimmer mr-1.5 inline-flex size-3.5 rounded-full"
                        aria-hidden="true"
                      />
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
                    className="chat-header-pill-btn hidden xl:inline-flex rounded-full h-8 px-3 text-xs font-semibold"
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
                    className="chat-header-action-btn hidden xl:inline-flex rounded-full text-muted-foreground hover:text-foreground"
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
                  className="chat-header-action-btn hidden md:flex rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-150 hover:scale-110 active:scale-95"
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
                  className="chat-header-action-btn hidden md:flex rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-150 hover:scale-110 active:scale-95"
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
                  className="chat-header-action-btn rounded-full text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors ml-1"
                >
                  <MoreVertical className="h-[18px] w-[18px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="chat-header-dropdown-panel w-56 rounded-xl shadow-lg border-border/60 overflow-hidden p-1">
                {chat.type === "direct" && otherUser?._id && (
                  <DropdownMenuItem
                    onSelect={() => navigate(`/profile/${String(otherUser._id)}`)}
                    className="chat-header-dropdown-item gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
                  >
                    <UserCircle className="h-[18px] w-[18px] text-muted-foreground" />
                    View profile
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && (
                  <DropdownMenuItem
                    onSelect={() => setTimeout(() => setShowMembersDialog(true), 100)}
                    className="chat-header-dropdown-item gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
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
                    className="chat-header-dropdown-item gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
                  >
                    <Megaphone className="h-[18px] w-[18px] text-muted-foreground" />
                    {announcementOnly ? "Disable announcement mode" : "Enable announcement mode"}
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && isGroupCreator && (
                  <DropdownMenuItem
                    onSelect={() => setTimeout(() => setShowManageAdminsDialog(true), 100)}
                    className="chat-header-dropdown-item gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
                  >
                    <ShieldCheck className="h-[18px] w-[18px] text-muted-foreground" />
                    Manage admins
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && isGroupAdmin && (
                  <DropdownMenuItem
                    onSelect={() => setTimeout(() => setShowManageChannelsDialog(true), 100)}
                    className="chat-header-dropdown-item gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
                  >
                    <Settings2 className="h-[18px] w-[18px] text-muted-foreground" />
                    Manage channels
                  </DropdownMenuItem>
                )}

                {chat.type === "group" && isGroupAdmin && (
                  <DropdownMenuItem
                    onSelect={() => setTimeout(() => setShowJoinLinkDialog(true), 100)}
                    className="chat-header-dropdown-item gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
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
                    className="chat-header-dropdown-item gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <Link2 className="h-[18px] w-[18px]" />
                    Revoke active join link
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onSelect={() => navigate("/settings/notifications")}
                  className="chat-header-dropdown-item gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
                >
                  <Bell className="h-[18px] w-[18px] text-muted-foreground" />
                  Notification settings
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-border/60 mx-1" />
                <DropdownMenuItem
                  onSelect={() => setTimeout(() => setShowDeleteDialog(true), 100)}
                  className="chat-header-dropdown-item gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
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
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/12 ring-8 ring-destructive/10">
              <Trash2 className="size-6 text-destructive" />
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
                "bg-destructive hover:bg-destructive/90 hover:shadow-md active:scale-[0.98]",
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
        open={showManageChannelsDialog}
        onOpenChange={(open) => {
          setShowManageChannelsDialog(open);
          if (open && chat.type === "group" && isGroupAdmin) {
            refreshChannelAnalytics(analyticsDays).catch((error) => {
              console.error("Failed to load channel analytics", error);
            });
          }
          if (!open) {
            setNewCategoryName("");
          }
        }}
      >
        <DialogContent className="max-w-5xl p-0 overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <DialogHeader>
              <DialogTitle>Channel management</DialogTitle>
              <DialogDescription>
                Rename, delete, reorder channels, control send permissions by role, and review activity trends.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_1.3fr]">
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Channels
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateChannelDialog(true)}
                  className="h-7 px-2.5 text-[11px]"
                >
                  <Plus className="mr-1.5 size-3" />
                  New channel
                </Button>
              </div>

              <div className="max-h-[260px] space-y-1 overflow-y-auto beautiful-scrollbar pr-1">
                {groupChannels.map((channel, index) => {
                  const unread = Number(myChannelUnreadMap?.[channel.channelId] || 0);
                  const isSelected = selectedManageChannel?.channelId === channel.channelId;

                  return (
                    <div
                      key={channel.channelId}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                        isSelected
                          ? "border-primary/40 bg-primary/10"
                          : "border-border/60 bg-background/70",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedManageChannelId(channel.channelId)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <Hash className="size-3 text-muted-foreground" />
                        <span className="truncate text-sm font-medium text-foreground">
                          {channel.name}
                        </span>
                        {unread > 0 && (
                          <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </button>

                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          disabled={index === 0}
                          onClick={() => {
                            void handleMoveChannel(channel.channelId, "up");
                          }}
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          disabled={index === groupChannels.length - 1}
                          onClick={() => {
                            void handleMoveChannel(channel.channelId, "down");
                          }}
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-lg border border-border/60 bg-background/60 p-2.5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Categories
                </p>
                <div className="mb-2 flex items-center gap-2">
                  <Input
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="New category"
                    maxLength={40}
                    className="h-8"
                    disabled={isCreatingCategory}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-2.5"
                    onClick={() => {
                      void handleCreateCategory();
                    }}
                    disabled={isCreatingCategory}
                  >
                    <Plus className="mr-1 size-3" />
                    Add
                  </Button>
                </div>

                <div className="max-h-[180px] space-y-1 overflow-y-auto beautiful-scrollbar pr-1">
                  {groupChannelCategories.length === 0 && (
                    <p className="py-2 text-xs text-muted-foreground">
                      No categories yet.
                    </p>
                  )}

                  {groupChannelCategories.map((category, index) => (
                    <div
                      key={category.categoryId}
                      className="flex items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 py-1"
                    >
                      <Input
                        value={categoryDrafts[category.categoryId] ?? category.name}
                        onChange={(event) =>
                          setCategoryDrafts((previous) => ({
                            ...previous,
                            [category.categoryId]: event.target.value,
                          }))
                        }
                        className="h-7 text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => {
                          void handleSaveCategoryName(category.categoryId);
                        }}
                        title="Save name"
                      >
                        <Settings2 className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index === 0}
                        onClick={() => {
                          void handleMoveCategory(category.categoryId, "up");
                        }}
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index === groupChannelCategories.length - 1}
                        onClick={() => {
                          void handleMoveCategory(category.categoryId, "down");
                        }}
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive"
                        onClick={() => {
                          void handleDeleteCategory(category.categoryId);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Channel settings
                </p>
                {selectedManageChannel ? (
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    #{selectedManageChannel.name}
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Select a channel to manage.
                  </p>
                )}
              </div>

              {selectedManageChannel && (
                <>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Name
                    </span>
                    <Input
                      value={manageChannelName}
                      onChange={(event) => setManageChannelName(event.target.value)}
                      maxLength={40}
                      disabled={isSavingChannelSettings}
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Description
                    </span>
                    <Input
                      value={manageChannelDescription}
                      onChange={(event) => setManageChannelDescription(event.target.value)}
                      maxLength={120}
                      disabled={isSavingChannelSettings}
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Category
                    </span>
                    <select
                      value={manageChannelCategoryId}
                      onChange={(event) => setManageChannelCategoryId(event.target.value)}
                      className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/35"
                    >
                      <option value="">Uncategorized</option>
                      {groupChannelCategories.map((category) => (
                        <option key={category.categoryId} value={category.categoryId}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="space-y-1.5 rounded-lg border border-border/60 bg-background/60 p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Send permissions
                    </p>
                    {(["owner", "admin", "member"] as GroupChannelRole[]).map((role) => (
                      <label
                        key={role}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="capitalize text-foreground">{role}</span>
                        <Switch
                          checked={manageSendRoles.includes(role)}
                          onCheckedChange={(checked) =>
                            handleToggleSendRole(role, checked)
                          }
                        />
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Button
                      type="button"
                      onClick={() => {
                        void handleSaveSelectedChannel();
                      }}
                      disabled={isSavingChannelSettings}
                    >
                      {isSavingChannelSettings ? "Saving..." : "Save channel"}
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        void handleDeleteSelectedChannel();
                      }}
                      disabled={
                        isDeletingChannel || selectedManageChannel.channelId === "general"
                      }
                    >
                      {isDeletingChannel ? "Deleting..." : "Delete channel"}
                    </Button>
                  </div>
                </>
              )}

              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="size-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Admin analytics
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={analyticsDays}
                      onChange={(event) => {
                        const nextDays = Number(event.target.value) || 7;
                        setAnalyticsDays(nextDays);
                        void refreshChannelAnalytics(nextDays);
                      }}
                      className="h-7 rounded-md border border-border/70 bg-background px-2 text-xs"
                    >
                      <option value={7}>7d</option>
                      <option value={14}>14d</option>
                      <option value={30}>30d</option>
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        void refreshChannelAnalytics();
                      }}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>

                {analyticsLoading && (
                  <p className="text-xs text-muted-foreground">Loading analytics...</p>
                )}

                {!analyticsLoading && channelAnalytics && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Messages</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">
                          {channelAnalytics.summary.currentMessages}
                        </p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Active members</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">
                          {channelAnalytics.summary.currentActiveMembers}
                        </p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Retention</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">
                          {channelAnalytics.summary.currentRetentionRate}%
                        </p>
                      </div>
                    </div>

                    <div className="max-h-[150px] space-y-1 overflow-y-auto beautiful-scrollbar pr-1">
                      {channelAnalytics.channels.map((item) => (
                        <div
                          key={item.channelId}
                          className="flex items-center justify-between rounded-md border border-border/60 bg-background px-2 py-1.5"
                        >
                          <p className="truncate text-xs font-medium text-foreground">
                            #{item.name}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{item.currentMessages} msgs</span>
                            <span
                              className={cn(
                                "font-semibold",
                                item.messageGrowthPercent >= 0
                                  ? "text-emerald-600"
                                  : "text-destructive",
                              )}
                            >
                              {item.messageGrowthPercent >= 0 ? "+" : ""}
                              {item.messageGrowthPercent}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      <Dialog
        open={showJoinLinkDialog}
        onOpenChange={(open) => {
          setShowJoinLinkDialog(open);
          if (open) {
            const presetMaxUses =
              typeof activeGroupJoinLink?.maxUses === "number" &&
              Number.isFinite(activeGroupJoinLink.maxUses) &&
              !activeGroupJoinLink.oneTime
                ? String(Math.max(1, Math.floor(activeGroupJoinLink.maxUses)))
                : "";

            setJoinLinkMaxUsesInput(presetMaxUses);
            setJoinLinkOneTime(Boolean(activeGroupJoinLink?.oneTime));
            return;
          }

          if (!open) {
            setGeneratedJoinLink("");
            setGeneratedJoinLinkExpiresAt(null);
            setJoinLinkErrorMessage("");
            setJoinLinkCooldownSeconds(0);
            setJoinLinkMaxUsesInput("");
            setJoinLinkOneTime(false);
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

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Max uses (optional)
              </span>
              <input
                type="number"
                min={1}
                max={500}
                value={joinLinkOneTime ? "1" : joinLinkMaxUsesInput}
                onChange={(event) => setJoinLinkMaxUsesInput(event.target.value)}
                disabled={joinLinkOneTime}
                placeholder="Leave empty for unlimited"
                className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-65"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                One-time invite link
              </span>
              <Switch
                checked={joinLinkOneTime}
                onCheckedChange={(checked) => setJoinLinkOneTime(checked)}
              />
            </label>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => {
                  void handleGenerateGroupJoinLink();
                }}
                disabled={isJoinLinkGenerating || joinLinkCooldownSeconds > 0}
              >
                {joinLinkButtonLabel}
              </Button>
              {hasActiveGroupJoinLink && (
                <div className="text-xs text-muted-foreground">
                  <p>
                    Active link expires at{" "}
                    {activeGroupJoinLink?.expiresAt
                      ? new Date(activeGroupJoinLink.expiresAt).toLocaleString()
                      : "-"}
                  </p>
                  {activeJoinLinkPolicyLabel && (
                    <p className="mt-0.5">Policy: {activeJoinLinkPolicyLabel}</p>
                  )}
                </div>
              )}
            </div>

            {joinLinkErrorMessage && (
              <p className="text-xs font-medium text-destructive">
                {joinLinkErrorMessage}
              </p>
            )}
            {joinLinkCooldownSeconds > 0 && (
              <p className="text-xs text-muted-foreground">
                Join link actions will be available in {joinLinkCooldownSeconds}s.
              </p>
            )}

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
