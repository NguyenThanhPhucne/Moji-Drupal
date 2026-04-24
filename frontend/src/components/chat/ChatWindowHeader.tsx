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
  Rows3,
  Grid2x2,
  AlignJustify,
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
import { DeleteConversationDialog } from "./dialogs/DeleteConversationDialog";
import { GroupMembersDialog } from "./dialogs/GroupMembersDialog";
import { ManageAdminsDialog } from "./dialogs/ManageAdminsDialog";
import { JoinLinkDialog } from "./dialogs/JoinLinkDialog";
import { GroupRoleBadge } from "./GroupRoleBadge";
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

type PendingDestructiveAction =
  | {
      type: "channel";
      channelId: string;
      channelName: string;
    }
  | {
      type: "category";
      categoryId: string;
      categoryName: string;
    };

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

const formatVoiceMinutes = (value: number) => {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "0";
  }
  return numericValue.toFixed(numericValue >= 10 ? 0 : 1);
};

const formatVoiceDurationLabel = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.round(Number(seconds || 0)));
  if (totalSeconds <= 0) {
    return "0s";
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${remainingSeconds}s`;
  }
  if (remainingSeconds <= 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
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
  const { conversations, activeConversationId } = useChatStore();
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
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [pendingDestructiveAction, setPendingDestructiveAction] =
    useState<PendingDestructiveAction | null>(null);
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

  const handleDeleteSelectedChannel = () => {
    if (chat.type !== "group" || !selectedManageChannel) {
      return;
    }

    if (selectedManageChannel.channelId === "general") {
      toast.error("Default #general channel cannot be deleted");
      return;
    }

    setPendingDestructiveAction({
      type: "channel",
      channelId: selectedManageChannel.channelId,
      channelName: selectedManageChannel.name,
    });
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

  const handleDeleteCategory = (categoryId: string) => {
    if (chat.type !== "group") {
      return;
    }

    const categoryName =
      groupChannelCategories.find((category) => category.categoryId === categoryId)
        ?.name || "this category";

    setPendingDestructiveAction({
      type: "category",
      categoryId,
      categoryName,
    });
  };

  const closeDestructiveActionDialog = () => {
    if (isDeletingChannel || isDeletingCategory) {
      return;
    }

    setPendingDestructiveAction(null);
  };

  const handleConfirmDestructiveAction = async () => {
    if (chat.type !== "group" || !pendingDestructiveAction) {
      return;
    }

    if (pendingDestructiveAction.type === "channel") {
      try {
        setIsDeletingChannel(true);
        const result = await deleteGroupChannel(
          chat._id,
          pendingDestructiveAction.channelId,
        );

        if (!result.ok) {
          toast.error(result.message || "Could not delete channel");
          return;
        }

        toast.success("Channel deleted");
        setPendingDestructiveAction(null);
        await refreshChannelAnalytics();
      } finally {
        setIsDeletingChannel(false);
      }

      return;
    }

    try {
      setIsDeletingCategory(true);
      const result = await deleteGroupChannelCategory(
        chat._id,
        pendingDestructiveAction.categoryId,
      );

      if (!result.ok) {
        toast.error(result.message || "Could not delete category");
        return;
      }

      toast.success("Category deleted");
      setPendingDestructiveAction(null);
    } finally {
      setIsDeletingCategory(false);
    }
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


  let destructiveActionTitle = "Delete this item?";
  let destructiveActionDescription =
    "This action cannot be undone.";
  let destructiveActionButtonLabel = "Yes, delete";

  if (pendingDestructiveAction?.type === "channel") {
    destructiveActionTitle = `Delete #${pendingDestructiveAction.channelName}?`;
    destructiveActionDescription =
      "This permanently removes all messages in this channel. This action cannot be undone.";
  } else if (pendingDestructiveAction?.type === "category") {
    destructiveActionTitle =
      `Delete category "${pendingDestructiveAction.categoryName}"?`;
    destructiveActionDescription =
      "Channels in this category will become uncategorized. This action cannot be undone.";
  }

  if (isDeletingChannel) {
    destructiveActionButtonLabel = "Deleting channel...";
  } else if (isDeletingCategory) {
    destructiveActionButtonLabel = "Deleting category...";
  }

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
                      void handleRevokeGroupJoinLink();
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

      <AlertDialog
        open={Boolean(pendingDestructiveAction)}
        onOpenChange={(open) => {
          if (!open) {
            closeDestructiveActionDialog();
          }
        }}
      >
        <AlertDialogContent
          className="max-w-md rounded-2xl p-6 gap-6 outline-none bg-background border border-border/50 shadow-2xl transition-[border-color,background-color,box-shadow] duration-200"
          aria-busy={isDeletingChannel || isDeletingCategory}
        >
          <AlertDialogHeader className="items-center text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/12 ring-8 ring-destructive/10">
              <Trash2 className="size-6 text-destructive" />
            </div>
            <div className="space-y-1.5">
              <AlertDialogTitle className="text-xl font-bold tracking-tight">
                {destructiveActionTitle}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[15px] font-medium leading-relaxed text-muted-foreground/80 px-2">
                {destructiveActionDescription}
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-row gap-3 sm:space-x-0 pt-2 w-full">
            <AlertDialogCancel
              disabled={isDeletingChannel || isDeletingCategory}
              className="flex-1 h-11 rounded-full border-border/60 font-semibold transition-colors hover:bg-muted/55"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDestructiveAction();
              }}
              disabled={isDeletingChannel || isDeletingCategory}
              className={cn(
                "flex-1 h-11 rounded-full bg-destructive font-semibold text-white transition-colors",
                "hover:bg-destructive/90",
                (isDeletingChannel || isDeletingCategory) && "opacity-70 pointer-events-none",
              )}
            >
              {destructiveActionButtonLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                        disabled={isDeletingCategory || isDeletingChannel}
                        onClick={() => {
                          handleDeleteCategory(category.categoryId);
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
                        handleDeleteSelectedChannel();
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
                    <div className="grid grid-cols-5 gap-2">
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
                      <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Voice mins</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">
                          {formatVoiceMinutes(channelAnalytics.summary.currentVoiceMinutes)}
                        </p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg memo</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">
                          {formatVoiceDurationLabel(
                            channelAnalytics.summary.avgVoiceMemoLengthSeconds,
                          )}
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
                            <span>
                              {formatVoiceMinutes(item.currentVoiceMinutes)}m voice
                            </span>
                            <span>
                              avg {formatVoiceDurationLabel(item.avgVoiceMemoLengthSeconds)}
                            </span>
                            <span
                              className={cn(
                                "font-semibold",
                                item.messageGrowthPercent >= 0
                                  ? "text-online"
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
