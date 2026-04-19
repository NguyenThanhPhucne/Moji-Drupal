import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Bookmark from "../models/Bookmark.js";
import Notification from "../models/Notification.js";
import ContentReport from "../models/ContentReport.js";
import User from "../models/User.js";
import { io } from "../socket/index.js";
import mongoose from "mongoose";
import { createHash, randomBytes } from "node:crypto";
import { destroyImageFromUrl } from "../utils/cloudinaryHelper.js";
import { getCachedData, setCachedData, invalidateCache } from "../libs/redis.js";
import {
  applyRateLimitHeaders,
  registerRateLimitHit,
} from "../utils/antiSpam.js";

const DEFAULT_MESSAGE_PAGE_LIMIT = 50;
const MAX_MESSAGE_PAGE_LIMIT = 100;
const MESSAGE_CURSOR_SEPARATOR = "|";
const JOIN_LINK_DEFAULT_EXPIRY_HOURS = 24;
const JOIN_LINK_MIN_EXPIRY_HOURS = 1;
const JOIN_LINK_MAX_EXPIRY_HOURS = 168;
const JOIN_LINK_MAX_USES_LIMIT = 500;
const DEFAULT_GROUP_CHANNEL_ID = "general";
const MAX_GROUP_CHANNELS_PER_CONVERSATION = 30;
const MIN_GROUP_CHANNEL_NAME_LENGTH = 2;
const MAX_GROUP_CHANNEL_NAME_LENGTH = 40;
const MIN_GROUP_CHANNEL_CATEGORY_NAME_LENGTH = 2;
const MAX_GROUP_CHANNEL_CATEGORY_NAME_LENGTH = 40;
const MAX_GROUP_CHANNEL_CATEGORIES_PER_CONVERSATION = 20;
const GROUP_CHANNEL_ROLE_OPTIONS = ["owner", "admin", "member"];
const MAX_GROUP_MEMBERS = 256;
const MIN_GROUP_NAME_LENGTH = 1;
const MAX_GROUP_NAME_LENGTH = 80;

const toStringId = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === "object") {
    if (typeof value.toHexString === "function") {
      return value.toHexString();
    }

    if (value._id && value._id !== value) {
      return toStringId(value._id);
    }

    if (value.userId && value.userId !== value) {
      return toStringId(value.userId);
    }
  }

  const converted = value?.toString?.();
  if (converted && converted !== "[object Object]") {
    return converted;
  }

  return "";
};

const encodeMessagePaginationCursor = (message) => {
  const cursorDate = message?.createdAt ? new Date(message.createdAt) : null;
  const cursorId = toStringId(message?._id);

  if (!cursorDate || Number.isNaN(cursorDate.getTime())) {
    return null;
  }

  const cursorDateIso = cursorDate.toISOString();
  if (!cursorId) {
    return cursorDateIso;
  }

  return `${cursorDateIso}${MESSAGE_CURSOR_SEPARATOR}${cursorId}`;
};

const decodeMessagePaginationCursor = (rawCursor) => {
  const normalizedCursor = String(rawCursor || "").trim();
  if (!normalizedCursor) {
    return {
      error: null,
      cursor: null,
    };
  }

  const separatorIndex = normalizedCursor.lastIndexOf(MESSAGE_CURSOR_SEPARATOR);
  const hasMessageId = separatorIndex > -1;
  const rawCreatedAt = hasMessageId
    ? normalizedCursor.slice(0, separatorIndex).trim()
    : normalizedCursor;
  const rawMessageId = hasMessageId
    ? normalizedCursor.slice(separatorIndex + 1).trim()
    : "";

  const cursorDate = new Date(rawCreatedAt);
  if (Number.isNaN(cursorDate.getTime())) {
    return {
      error: {
        status: 400,
        message: "Invalid cursor",
      },
      cursor: null,
    };
  }

  if (!rawMessageId) {
    return {
      error: null,
      cursor: {
        createdAt: cursorDate,
        messageId: null,
      },
    };
  }

  if (!mongoose.Types.ObjectId.isValid(rawMessageId)) {
    return {
      error: {
        status: 400,
        message: "Invalid cursor",
      },
      cursor: null,
    };
  }

  return {
    error: null,
    cursor: {
      createdAt: cursorDate,
      messageId: rawMessageId,
    },
  };
};

const buildMessageCursorQueryFilter = (rawCursor) => {
  const decodedCursor = decodeMessagePaginationCursor(rawCursor);
  if (decodedCursor.error) {
    return {
      error: decodedCursor.error,
      filter: null,
    };
  }

  if (!decodedCursor.cursor) {
    return {
      error: null,
      filter: null,
    };
  }

  const { createdAt, messageId } = decodedCursor.cursor;
  if (!messageId) {
    return {
      error: null,
      // Backward-compatible fallback for legacy date-only cursors.
      filter: { createdAt: { $lt: createdAt } },
    };
  }

  return {
    error: null,
    filter: {
      $or: [
        { createdAt: { $lt: createdAt } },
        {
          createdAt,
          _id: { $lt: mongoose.Types.ObjectId.createFromHexString(messageId) },
        },
      ],
    },
  };
};

const applyMessageQueryFilters = ({
  query,
  cursorFilter,
  groupChannelFilter,
}) => {
  const filters = [];

  if (cursorFilter) {
    filters.push(cursorFilter);
  }

  if (groupChannelFilter) {
    filters.push({ $or: groupChannelFilter });
  }

  if (filters.length === 1) {
    Object.assign(query, filters[0]);
  } else if (filters.length > 1) {
    query.$and = filters;
  }
};

const sanitizeGroupChannelName = (value) => {
  return String(value || "")
    .replaceAll(/\s+/g, " ")
    .trim();
};

const normalizeGroupChannelId = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return normalized || DEFAULT_GROUP_CHANNEL_ID;
};

const normalizeGroupChannelRole = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (GROUP_CHANNEL_ROLE_OPTIONS.includes(normalized)) {
    return normalized;
  }

  return null;
};

const normalizeGroupChannelSendRoles = (roles) => {
  const normalizedRoles = Array.isArray(roles)
    ? roles
        .map((role) => normalizeGroupChannelRole(role))
        .filter(Boolean)
    : [];

  const deduped = Array.from(new Set(normalizedRoles));
  if (deduped.length === 0) {
    return [...GROUP_CHANNEL_ROLE_OPTIONS];
  }

  return deduped;
};

const sanitizeGroupChannelDescription = sanitizeGroupChannelName;
const sanitizeGroupChannelCategoryName = sanitizeGroupChannelName;

const toGroupChannelCategorySlug = (name) => {
  const normalized = sanitizeGroupChannelCategoryName(name)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return normalized || "category";
};

const normalizeGroupChannelCategoryId = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return normalized || null;
};

const toNonNegativeInt = (value, fallback = 0) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return fallback;
  }

  return Math.floor(parsedValue);
};

const toGroupChannelSlug = (name) => {
  const normalized = sanitizeGroupChannelName(name)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return normalized || "channel";
};

const buildDefaultGroupChannel = (createdBy = null) => {
  return {
    channelId: DEFAULT_GROUP_CHANNEL_ID,
    name: "general",
    description: "",
    categoryId: null,
    position: 0,
    permissions: {
      sendRoles: [...GROUP_CHANNEL_ROLE_OPTIONS],
    },
    createdBy: createdBy || null,
    createdAt: new Date(),
  };
};

const buildUniqueGroupChannelCategoryId = (name, existingCategoryIds) => {
  const base = toGroupChannelCategorySlug(name);
  let nextId = base;
  let suffix = 2;

  while (existingCategoryIds.has(nextId)) {
    nextId = `${base}-${suffix}`;
    suffix += 1;
  }

  return nextId;
};

const resolveGroupChannelCategoriesState = (group, fallbackCreatedBy = null) => {
  const rawCategories = Array.isArray(group?.channelCategories)
    ? group.channelCategories
    : [];
  const normalizedCategories = [];
  const existingCategoryIds = new Set();

  rawCategories.forEach((rawCategory, index) => {
    const categoryName = sanitizeGroupChannelCategoryName(rawCategory?.name);
    if (!categoryName) {
      return;
    }

    const categoryId =
      normalizeGroupChannelCategoryId(
        rawCategory?.categoryId || toGroupChannelCategorySlug(categoryName),
      ) || buildUniqueGroupChannelCategoryId(categoryName, existingCategoryIds);

    if (existingCategoryIds.has(categoryId)) {
      return;
    }

    existingCategoryIds.add(categoryId);
    normalizedCategories.push({
      categoryId,
      name: categoryName,
      position: toNonNegativeInt(rawCategory?.position, index),
      createdBy: rawCategory?.createdBy || fallbackCreatedBy || null,
      createdAt: rawCategory?.createdAt || null,
    });
  });

  normalizedCategories.sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }

    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return {
    categories: normalizedCategories.map((category, index) => ({
      ...category,
      position: index,
    })),
  };
};

const resolveGroupChannelUnreadCountsState = (
  group,
  channels,
  participants = [],
) => {
  const normalized = {};
  const rawChannelUnreadCounts = group?.channelUnreadCounts;
  const validChannelIds = new Set((channels || []).map((channel) => channel.channelId));
  const participantIds = new Set(
    (participants || [])
      .map((participant) => toStringId(participant?.userId || participant))
      .filter(Boolean),
  );

  if (
    !rawChannelUnreadCounts ||
    typeof rawChannelUnreadCounts !== "object" ||
    Array.isArray(rawChannelUnreadCounts)
  ) {
    return normalized;
  }

  Object.entries(rawChannelUnreadCounts).forEach(([rawUserId, rawUserUnread]) => {
    const userId = toStringId(rawUserId);
    if (!userId) {
      return;
    }

    if (participantIds.size > 0 && !participantIds.has(userId)) {
      return;
    }

    if (!rawUserUnread || typeof rawUserUnread !== "object" || Array.isArray(rawUserUnread)) {
      return;
    }

    const perChannelUnread = {};

    Object.entries(rawUserUnread).forEach(([rawChannelId, rawCount]) => {
      const channelId = normalizeGroupChannelId(rawChannelId);
      if (!validChannelIds.has(channelId)) {
        return;
      }

      const count = toNonNegativeInt(rawCount, 0);
      if (count > 0) {
        perChannelUnread[channelId] = count;
      }
    });

    if (Object.keys(perChannelUnread).length > 0) {
      normalized[userId] = perChannelUnread;
    }
  });

  return normalized;
};

const sumGroupChannelUnreadCounts = (channelUnreadCounts) => {
  return Object.values(channelUnreadCounts || {}).reduce((sum, count) => {
    const value = toNonNegativeInt(count, 0);
    return sum + value;
  }, 0);
};

const buildConversationUnreadCountsMapForGroup = ({
  conversation,
  channelUnreadCounts,
}) => {
  const unreadCountsMap = new Map();

  (conversation?.participants || []).forEach((participant) => {
    const participantId = toStringId(participant?.userId);
    if (!participantId) {
      return;
    }

    const participantChannelUnread =
      channelUnreadCounts?.[participantId] || {};

    unreadCountsMap.set(
      participantId,
      sumGroupChannelUnreadCounts(participantChannelUnread),
    );
  });

  return unreadCountsMap;
};

const resolveGroupChannelsState = (group, fallbackCreatedBy = null) => {
  const { categories } = resolveGroupChannelCategoriesState(group, fallbackCreatedBy);
  const validCategoryIds = new Set(
    categories.map((category) => category.categoryId),
  );
  const rawChannels = Array.isArray(group?.channels) ? group.channels : [];
  const normalizedChannels = [];
  const existingIds = new Set();

  rawChannels.forEach((rawChannel, index) => {
    const channelName = sanitizeGroupChannelName(rawChannel?.name);
    if (!channelName) {
      return;
    }

    const channelId = normalizeGroupChannelId(
      rawChannel?.channelId || toGroupChannelSlug(channelName),
    );

    if (existingIds.has(channelId)) {
      return;
    }

    existingIds.add(channelId);

    const normalizedCategoryId = normalizeGroupChannelCategoryId(
      rawChannel?.categoryId,
    );
    const categoryId =
      normalizedCategoryId && validCategoryIds.has(normalizedCategoryId)
        ? normalizedCategoryId
        : null;

    normalizedChannels.push({
      channelId,
      name: channelName,
      description: sanitizeGroupChannelDescription(rawChannel?.description),
      categoryId,
      position: toNonNegativeInt(rawChannel?.position, index),
      permissions: {
        sendRoles: normalizeGroupChannelSendRoles(
          rawChannel?.permissions?.sendRoles,
        ),
      },
      createdBy: rawChannel?.createdBy || null,
      createdAt: rawChannel?.createdAt || null,
    });
  });

  if (normalizedChannels.length === 0) {
    normalizedChannels.push(buildDefaultGroupChannel(group?.createdBy || fallbackCreatedBy));
  }

  const categoryPositionMap = new Map(
    categories.map((category) => [category.categoryId, category.position]),
  );

  normalizedChannels.sort((a, b) => {
    const aCategoryPosition =
      a.categoryId && categoryPositionMap.has(a.categoryId)
        ? categoryPositionMap.get(a.categoryId)
        : Number.MAX_SAFE_INTEGER;
    const bCategoryPosition =
      b.categoryId && categoryPositionMap.has(b.categoryId)
        ? categoryPositionMap.get(b.categoryId)
        : Number.MAX_SAFE_INTEGER;

    if (aCategoryPosition !== bCategoryPosition) {
      return aCategoryPosition - bCategoryPosition;
    }

    if (a.position !== b.position) {
      return a.position - b.position;
    }

    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  const reindexedChannels = normalizedChannels.map((channel, index) => ({
    ...channel,
    position: index,
  }));

  const activeCandidate = normalizeGroupChannelId(group?.activeChannelId);
  const activeChannelId = reindexedChannels.some(
    (channel) => channel.channelId === activeCandidate,
  )
    ? activeCandidate
    : reindexedChannels[0].channelId;

  return {
    channels: reindexedChannels,
    activeChannelId,
  };
};

const buildUniqueGroupChannelId = (name, existingChannelIds) => {
  const base = toGroupChannelSlug(name);
  let nextId = base;
  let suffix = 2;

  while (existingChannelIds.has(nextId)) {
    nextId = `${base}-${suffix}`;
    suffix += 1;
  }

  return nextId;
};

const getClientIp = (req) => {
  const forwardedIp = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim())
    .find(Boolean);

  return (
    forwardedIp ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
};

const normalizeUnreadCounts = (unreadCounts) => {
  return unreadCounts instanceof Map
    ? Object.fromEntries(unreadCounts)
    : unreadCounts || {};
};

const resolveUserUnreadCount = (conversation, userId) => {
  const normalizedUserId = toStringId(userId);
  const unreadCounts = conversation?.unreadCounts;

  if (unreadCounts instanceof Map) {
    return toNonNegativeInt(unreadCounts.get(normalizedUserId), 0);
  }

  if (unreadCounts && typeof unreadCounts === "object") {
    return toNonNegativeInt(unreadCounts[normalizedUserId], 0);
  }

  return 0;
};

const normalizeSeenBy = (seenBy) => {
  return (seenBy || []).map((seenUser) => ({
    _id: seenUser?._id?.toString?.() || seenUser?.toString?.() || "",
    displayName: seenUser?.displayName,
    avatarUrl: seenUser?.avatarUrl ?? null,
  }));
};

const normalizeParticipants = (participants) => {
  return (participants || []).map((participant) => ({
    _id:
      participant?.userId?._id?.toString?.() ||
      participant?.userId?.toString?.() ||
      "",
    displayName: participant?.userId?.displayName,
    avatarUrl: participant?.userId?.avatarUrl ?? null,
    joinedAt: participant?.joinedAt,
  }));
};

const resolveJoinLinkMaxUses = (joinLink) => {
  const oneTime = Boolean(joinLink?.oneTime);
  if (oneTime) {
    return 1;
  }

  const maxUses = Number(joinLink?.maxUses);
  if (Number.isInteger(maxUses) && maxUses > 0) {
    return maxUses;
  }

  return null;
};

const getJoinLinkUseCount = (joinLink) => {
  const useCount = Number(joinLink?.useCount);
  if (!Number.isFinite(useCount) || useCount < 0) {
    return 0;
  }

  return Math.floor(useCount);
};

const getJoinLinkRemainingUses = (joinLink) => {
  const maxUses = resolveJoinLinkMaxUses(joinLink);
  if (maxUses === null) {
    return null;
  }

  return Math.max(0, maxUses - getJoinLinkUseCount(joinLink));
};

const isJoinLinkActive = (joinLink) => {
  if (!joinLink?.tokenHash || joinLink?.revokedAt) {
    return false;
  }

  const remainingUses = getJoinLinkRemainingUses(joinLink);
  if (remainingUses !== null && remainingUses <= 0) {
    return false;
  }

  const expiresAt = joinLink?.expiresAt ? new Date(joinLink.expiresAt) : null;
  return Boolean(expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > Date.now());
};

const toJoinLinkMeta = (joinLink) => {
  if (!joinLink?.expiresAt && !joinLink?.revokedAt) {
    return null;
  }

  const maxUses = resolveJoinLinkMaxUses(joinLink);
  const useCount = getJoinLinkUseCount(joinLink);
  const remainingUses =
    maxUses === null ? null : Math.max(0, maxUses - useCount);

  return {
    expiresAt: joinLink.expiresAt,
    createdAt: joinLink.createdAt || null,
    createdBy: toStringId(joinLink.createdBy) || null,
    maxUses,
    useCount,
    remainingUses,
    oneTime: Boolean(joinLink.oneTime),
    revokedAt: joinLink.revokedAt || null,
    revokedBy: toStringId(joinLink.revokedBy) || null,
    revokeReason: String(joinLink.revokeReason || "") || null,
    isActive: isJoinLinkActive(joinLink),
  };
};

const normalizeGroup = (group, participants = []) => {
  if (!group) {
    return group;
  }

  const { categories } = resolveGroupChannelCategoriesState(group);
  const { channels, activeChannelId } = resolveGroupChannelsState(group);
  const channelUnreadCounts = resolveGroupChannelUnreadCountsState(
    group,
    channels,
    participants,
  );

  return {
    ...group,
    createdBy: toStringId(group.createdBy),
    adminIds: (group.adminIds || []).map((adminId) => toStringId(adminId)),
    announcementOnly: Boolean(group.announcementOnly),
    channels,
    channelCategories: categories,
    channelUnreadCounts,
    activeChannelId,
    joinLink: toJoinLinkMeta(group.joinLink),
  };
};

const normalizePinnedMessage = (pinnedMessage) => {
  if (!pinnedMessage) {
    return null;
  }

  return {
    ...pinnedMessage,
    senderId: toStringId(pinnedMessage.senderId),
    pinnedBy: toStringId(pinnedMessage.pinnedBy),
  };
};

const formatConversationForClient = (conversation) => {
  const conversationObject = conversation?.toObject
    ? conversation.toObject()
    : conversation;

  return {
    ...conversationObject,
    group: normalizeGroup(
      conversationObject?.group,
      conversationObject?.participants,
    ),
    pinnedMessage: normalizePinnedMessage(conversationObject?.pinnedMessage),
    unreadCounts: normalizeUnreadCounts(conversationObject?.unreadCounts),
    seenBy: normalizeSeenBy(conversationObject?.seenBy),
    participants: normalizeParticipants(conversationObject?.participants),
  };
};

const hashJoinLinkToken = (token) => {
  return createHash("sha256").update(String(token || "")).digest("hex");
};

const generateJoinLinkToken = () => {
  return randomBytes(24).toString("base64url");
};

const resolveClientBaseUrl = () => {
  const fromSingle = String(process.env.CLIENT_URL || "").trim();
  if (fromSingle) {
    return fromSingle.replace(/\/$/, "");
  }

  const fromList = [];
  String(process.env.CLIENT_URLS || "")
    .split(",")
    .forEach((item) => {
      const normalizedItem = item.trim();
      if (normalizedItem) {
        fromList.push(normalizedItem);
      }
    });

  return String(fromList[0] || "").replace(/\/$/, "");
};

const buildGroupJoinLinkUrl = ({ conversationId, token }) => {
  const relativePath = `/join/group/${conversationId}?token=${encodeURIComponent(token)}`;
  const baseUrl = resolveClientBaseUrl();

  if (!baseUrl) {
    return relativePath;
  }

  return `${baseUrl}${relativePath}`;
};

const resolveAtomicJoinLinkFailure = ({
  joinedConversation,
  conversation,
  userId,
  token,
}) => {
  if (joinedConversation) {
    return null;
  }

  if (isGroupParticipant(conversation, userId)) {
    return null;
  }

  const latestJoinLink = conversation.group?.joinLink;
  if (latestJoinLink?.revokedAt) {
    const revokeReason = String(latestJoinLink.revokeReason || "");

    if (revokeReason === "one-time-consumed") {
      return { status: 410, message: "Join link was consumed and is no longer valid" };
    }

    if (revokeReason === "max-uses-reached") {
      return { status: 410, message: "Join link reached its maximum usage limit" };
    }

    return { status: 410, message: "Join link is no longer active" };
  }

  if (!latestJoinLink?.tokenHash || !latestJoinLink?.expiresAt) {
    return { status: 404, message: "Join link is not available" };
  }

  const remainingUses = getJoinLinkRemainingUses(latestJoinLink);
  if (remainingUses !== null && remainingUses <= 0) {
    return { status: 410, message: "Join link reached its maximum usage limit" };
  }

  if (!isJoinLinkActive(latestJoinLink)) {
    return { status: 410, message: "Join link has expired" };
  }

  if (hashJoinLinkToken(token) !== String(latestJoinLink.tokenHash)) {
    return { status: 400, message: "Invalid join link token" };
  }

  return { status: 409, message: "Unable to join group right now" };
};

const maybeRevokeJoinLinkByPolicy = async ({ conversationId, joinLink }) => {
  const effectiveMaxUses = resolveJoinLinkMaxUses(joinLink);
  if (effectiveMaxUses === null) {
    return null;
  }

  const useCount = getJoinLinkUseCount(joinLink);
  if (useCount < effectiveMaxUses) {
    return null;
  }

  const revokeReason = joinLink?.oneTime
    ? "one-time-consumed"
    : "max-uses-reached";

  return Conversation.findOneAndUpdate(
    {
      _id: conversationId,
      "group.joinLink.tokenHash": String(joinLink?.tokenHash || ""),
      "group.joinLink.revokedAt": null,
    },
    {
      $set: {
        "group.joinLink.revokedAt": new Date(),
        "group.joinLink.revokedBy": null,
        "group.joinLink.revokeReason": revokeReason,
      },
    },
    { new: true },
  );
};

const getJoinGroupByLinkRequestError = ({ conversationId, token }) => {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return { status: 400, message: "Invalid conversation id" };
  }

  if (!token) {
    return { status: 400, message: "Join token is required" };
  }

  return null;
};

const isGroupParticipant = (conversation, userId) => {
  const normalizedUserId = toStringId(userId);
  return (conversation?.participants || []).some(
    (participant) => toStringId(participant?.userId) === normalizedUserId,
  );
};

const isGroupCreator = (conversation, userId) => {
  return toStringId(conversation?.group?.createdBy) === toStringId(userId);
};

const isGroupAdmin = (conversation, userId) => {
  if (isGroupCreator(conversation, userId)) {
    return true;
  }

  const normalizedUserId = toStringId(userId);
  return (conversation?.group?.adminIds || []).some(
    (adminId) => toStringId(adminId) === normalizedUserId,
  );
};

const ensureNormalizedGroupState = (conversation, fallbackCreatedBy = null) => {
  if (!conversation.group) {
    conversation.group = {
      name: "",
      createdBy: fallbackCreatedBy || null,
      adminIds: fallbackCreatedBy ? [fallbackCreatedBy] : [],
      announcementOnly: false,
      channels: [buildDefaultGroupChannel(fallbackCreatedBy)],
      channelCategories: [],
      channelUnreadCounts: {},
      activeChannelId: DEFAULT_GROUP_CHANNEL_ID,
    };
  }

  const groupStateSource = conversation.group?.toObject
    ? conversation.group.toObject()
    : conversation.group;

  const { categories } = resolveGroupChannelCategoriesState(
    groupStateSource,
    fallbackCreatedBy,
  );
  const { channels, activeChannelId } = resolveGroupChannelsState(
    {
      ...groupStateSource,
      channelCategories: categories,
    },
    fallbackCreatedBy,
  );
  const channelUnreadCounts = resolveGroupChannelUnreadCountsState(
    groupStateSource,
    channels,
    conversation.participants,
  );

  if (Object.keys(channelUnreadCounts).length === 0) {
    const fallbackUnreadCounts = normalizeUnreadCounts(conversation.unreadCounts);

    Object.entries(fallbackUnreadCounts).forEach(([participantId, rawUnreadCount]) => {
      const unreadCount = toNonNegativeInt(rawUnreadCount, 0);
      if (unreadCount <= 0) {
        return;
      }

      channelUnreadCounts[participantId] = {
        [activeChannelId]: unreadCount,
      };
    });
  }

  conversation.group.channels = channels;
  conversation.group.activeChannelId = activeChannelId;
  conversation.group.channelCategories = categories;
  conversation.group.channelUnreadCounts = channelUnreadCounts;
  conversation.unreadCounts = buildConversationUnreadCountsMapForGroup({
    conversation,
    channelUnreadCounts,
  });

  return {
    channels,
    activeChannelId,
    categories,
    channelUnreadCounts,
  };
};

const validateGroupAdminRoleRequest = ({
  conversationId,
  memberId,
  makeAdmin,
}) => {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return { status: 400, message: "Invalid conversation id" };
  }

  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    return { status: 400, message: "Invalid member id" };
  }

  if (typeof makeAdmin !== "boolean") {
    return { status: 400, message: "makeAdmin must be boolean" };
  }

  return null;
};

const getGroupAdminRoleContextError = ({ conversation, userId, memberId }) => {
  if (conversation.type !== "group") {
    return {
      status: 400,
      message: "Only group conversations support admin roles",
    };
  }

  if (!isGroupParticipant(conversation, userId)) {
    return { status: 403, message: "Access denied" };
  }

  if (!isGroupCreator(conversation, userId)) {
    return {
      status: 403,
      message: "Only group owner can update admin roles",
    };
  }

  if (!isGroupParticipant(conversation, memberId)) {
    return {
      status: 400,
      message: "Target member is not in this group",
    };
  }

  if (isGroupCreator(conversation, memberId)) {
    return { status: 400, message: "Cannot change owner role" };
  }

  if (!conversation.group) {
    return { status: 400, message: "Group metadata is missing" };
  }

  return null;
};

const applyGroupAdminRoleUpdate = ({ conversation, memberId, makeAdmin }) => {
  const creatorId = toStringId(conversation.group.createdBy);
  const targetMemberId = toStringId(memberId);
  const adminIds = new Set(
    (conversation.group.adminIds || []).map((adminId) => toStringId(adminId)),
  );

  if (creatorId) {
    adminIds.add(creatorId);
  }

  if (makeAdmin) {
    adminIds.add(targetMemberId);
  } else {
    adminIds.delete(targetMemberId);
  }

  conversation.group.adminIds = Array.from(adminIds);
};

const toGroupConversationPayload = (conversation) => {
  const group = conversation?.group?.toObject
    ? conversation.group.toObject()
    : conversation?.group || {};
  const pinnedMessage = conversation?.pinnedMessage?.toObject
    ? conversation.pinnedMessage.toObject()
    : conversation?.pinnedMessage || null;

  return {
    _id: toStringId(conversation?._id),
    group: normalizeGroup(group, conversation?.participants || []),
    pinnedMessage: normalizePinnedMessage(pinnedMessage),
    updatedAt: conversation?.updatedAt || null,
  };
};

const broadcastGroupConversationUpdated = async (conversation) => {
  const payload = toGroupConversationPayload(conversation);

  io.to(toStringId(conversation?._id)).emit("group-conversation-updated", {
    conversation: payload,
  });

  await Promise.all(
    (conversation?.participants || []).map(async (participant) => {
      const participantId = toStringId(participant?.userId);
      if (participantId) {
        await invalidateCache(`conversations:${participantId}`);
      }
    }),
  );

  return payload;
};

import {
  buildDirectConversationKey,
  getMongoUserIdFromDrupalId,
} from "../services/conversationService.js";

// eslint-disable-next-line sonarjs/cognitive-complexity
export const createConversation = async (req, res) => {
  try {
    const { type, name, memberIds } = req.body;
    const userId = req.user._id;

    // Validation
    if (
      !type ||
      !memberIds ||
      !Array.isArray(memberIds) ||
      memberIds.length === 0
    ) {
      return res.status(400).json({
        message: "Loại cuộc trò chuyện và danh sách thành viên là bắt buộc",
      });
    }

    if (type === "group" && !name) {
      return res.status(400).json({ message: "Tên nhóm là bắt buộc" });
    }

    const normalizedGroupName = String(name || "").trim();
    if (type === "group" && (normalizedGroupName.length < MIN_GROUP_NAME_LENGTH || normalizedGroupName.length > MAX_GROUP_NAME_LENGTH)) {
      return res.status(400).json({
        message: `Tên nhóm phải từ ${MIN_GROUP_NAME_LENGTH} đến ${MAX_GROUP_NAME_LENGTH} ký tự`,
      });
    }

    let conversation;

    if (type === "direct") {
      const participantId = memberIds[0];

      // Convert Drupal ID to MongoDB ObjectId
      const mongoParticipantId =
        await getMongoUserIdFromDrupalId(participantId);

      if (String(mongoParticipantId) === String(userId)) {
        return res
          .status(400)
          .json({ message: "Không thể tạo cuộc trò chuyện với chính mình" });
      }

      const directKey = buildDirectConversationKey(userId, mongoParticipantId);

      conversation = await Conversation.findOne({
        type: "direct",
        directKey,
      });

      if (!conversation) {
        try {
          conversation = await Conversation.create({
            type: "direct",
            directKey,
            participants: [{ userId }, { userId: mongoParticipantId }],
            lastMessageAt: new Date(),
            unreadCounts: new Map(),
          });
        } catch (createError) {
          if (createError?.code === 11000) {
            conversation = await Conversation.findOne({
              type: "direct",
              directKey,
            });
          } else {
            throw createError;
          }
        }
      }
    }

    if (type === "group") {
      // Convert all Drupal IDs to MongoDB ObjectIds
      const mongoMemberIdsRaw = await Promise.all(
        memberIds.map((id) => getMongoUserIdFromDrupalId(id)),
      );

      const uniqueMemberIds = [...new Set(mongoMemberIdsRaw.map(String))].filter(
        (id) => id !== String(userId),
      );

      if (uniqueMemberIds.length === 0) {
        return res.status(400).json({ message: "Nhóm phải có ít nhất 1 thành viên khác" });
      }

      // +1 for the creator
      if (uniqueMemberIds.length + 1 > MAX_GROUP_MEMBERS) {
        return res.status(400).json({
          message: `Nhóm không thể có quá ${MAX_GROUP_MEMBERS} thành viên`,
        });
      }

      conversation = new Conversation({
        type: "group",
        participants: [
          { userId },
          ...uniqueMemberIds.map((id) => ({ userId: id })),
        ],
        group: {
          name,
          createdBy: userId,
          adminIds: [userId],
          announcementOnly: false,
          channels: [buildDefaultGroupChannel(userId)],
          channelCategories: [],
          channelUnreadCounts: {},
          activeChannelId: DEFAULT_GROUP_CHANNEL_ID,
        },
        lastMessageAt: new Date(),
      });

      await conversation.save();
    }

    if (!conversation) {
      return res
        .status(400)
        .json({ message: "Conversation type không hợp lệ" });
    }

    await conversation.populate([
      { path: "participants.userId", select: "displayName avatarUrl" },
      {
        path: "seenBy",
        select: "displayName avatarUrl",
      },
      { path: "lastMessage.senderId", select: "displayName avatarUrl" },
    ]);

    const formatted = formatConversationForClient(conversation);

    // Emit to participants using MongoDB user IDs (NOT Drupal IDs)
    if (type === "group") {
      await Promise.all(conversation.participants.map(async (p) => {
        const participantId = p.userId._id || p.userId;
        const participantIdStr = participantId.toString();
        await invalidateCache(`conversations:${participantIdStr}`);
        
        if (participantIdStr !== userId.toString()) {
          io.to(participantIdStr).emit("new-group", formatted);
        }
      }));
    } else if (type === "direct") {
      await Promise.all(conversation.participants.map(async (p) => {
        const participantId = p.userId._id || p.userId;
        const participantIdStr = participantId.toString();
        await invalidateCache(`conversations:${participantIdStr}`);

        if (participantIdStr !== userId.toString()) {
          io.to(participantIdStr).emit("new-conversation", formatted);
        }
      }));
    }

    return res.status(201).json({ conversation: formatted });
  } catch (error) {
    console.error("Lỗi khi tạo conversation", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const cacheKey = `conversations:${userId}`;
    const cached = await getCachedData(cacheKey);

    if (cached) {
      return res.status(200).json({ conversations: cached });
    }

    const conversations = await Conversation.find({
      "participants.userId": userId,
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate({
        path: "participants.userId",
        select: "displayName avatarUrl",
      })
      .populate({
        path: "lastMessage.senderId",
        select: "displayName avatarUrl",
      })
      .populate({
        path: "seenBy",
        select: "displayName avatarUrl",
      })
      .lean();

    const formatted = conversations.map((convo) => formatConversationForClient(convo));

    await setCachedData(cacheKey, formatted, 120); // 2-minute cache: short enough for near-realtime freshness

    return res.status(200).json({ conversations: formatted });
  } catch (error) {
    console.error("Lỗi xảy ra khi lấy conversations", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

const ensureConversationReadAccess = ({
  conversation,
  userId,
  canAccessAll,
}) => {
  if (canAccessAll) {
    return null;
  }

  const isParticipant = (conversation?.participants || []).some(
    (participant) => toStringId(participant?.userId) === toStringId(userId),
  );

  if (isParticipant) {
    return null;
  }

  return {
    status: 403,
    message: "Access denied",
  };
};

const resolveGroupChannelMessageQuery = ({ conversation, rawChannelId }) => {
  if (conversation?.type !== "group") {
    return {
      effectiveGroupChannelId: null,
      filter: null,
      error: null,
    };
  }

  const { channels, activeChannelId } = resolveGroupChannelsState(
    conversation.group,
  );

  const effectiveGroupChannelId = normalizeGroupChannelId(
    String(rawChannelId || "").trim() || activeChannelId,
  );

  const channelExists = channels.some(
    (channel) => channel.channelId === effectiveGroupChannelId,
  );

  if (!channelExists) {
    return {
      effectiveGroupChannelId: null,
      filter: null,
      error: {
        status: 400,
        message: "Invalid group channel",
      },
    };
  }

  const filter = [{ groupChannelId: effectiveGroupChannelId }];

  if (effectiveGroupChannelId === DEFAULT_GROUP_CHANNEL_ID) {
    filter.push(
      { groupChannelId: { $exists: false } },
      { groupChannelId: null },
    );
  }

  return {
    effectiveGroupChannelId,
    filter,
    error: null,
  };
};

const buildGroupMessageChannelQueryFilter = (channelIds) => {
  const normalizedChannelIds = Array.from(
    new Set(
      (Array.isArray(channelIds) ? channelIds : [])
        .map((channelId) => normalizeGroupChannelId(channelId))
        .filter(Boolean),
    ),
  );

  if (normalizedChannelIds.length === 0) {
    return null;
  }

  const includesGeneral = normalizedChannelIds.includes(DEFAULT_GROUP_CHANNEL_ID);
  const explicitChannelIds = normalizedChannelIds.filter(
    (channelId) => channelId !== DEFAULT_GROUP_CHANNEL_ID,
  );

  const filters = [];

  if (explicitChannelIds.length > 0) {
    filters.push({ groupChannelId: { $in: explicitChannelIds } });
  }

  if (includesGeneral) {
    filters.push(
      { groupChannelId: DEFAULT_GROUP_CHANNEL_ID },
      { groupChannelId: { $exists: false } },
      { groupChannelId: null },
    );
  }

  if (filters.length === 0) {
    return null;
  }

  if (filters.length === 1) {
    return filters[0];
  }

  return { $or: filters };
};

const syncGroupConversationLastMessage = async ({
  conversation,
  channelIds,
  session = null,
}) => {
  const filter = buildGroupMessageChannelQueryFilter(channelIds);

  if (!filter) {
    conversation.lastMessage = null;
    conversation.lastMessageAt = null;
    conversation.seenBy = [];
    return;
  }

  const latestMessageQuery = Message.findOne({
    conversationId: conversation._id,
    isDeleted: { $ne: true },
    ...filter,
  })
    .select("_id content imgUrl senderId createdAt groupChannelId")
    .sort({ createdAt: -1, _id: -1 });

  if (session) {
    latestMessageQuery.session(session);
  }

  const latestMessage = await latestMessageQuery.lean();

  if (!latestMessage) {
    conversation.lastMessage = null;
    conversation.lastMessageAt = null;
    conversation.seenBy = [];
    return;
  }

  const previewContent =
    String(latestMessage.content || "").trim() ||
    (latestMessage.imgUrl ? "📷 Photo" : "");

  conversation.lastMessageAt = latestMessage.createdAt;
  conversation.lastMessage = {
    _id: toStringId(latestMessage._id),
    content: previewContent,
    senderId: latestMessage.senderId,
    createdAt: latestMessage.createdAt,
    groupChannelId: normalizeGroupChannelId(latestMessage.groupChannelId),
  };
  conversation.seenBy = [];
};

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const {
      limit = DEFAULT_MESSAGE_PAGE_LIMIT,
      cursor,
      channelId: rawChannelId,
    } = req.query;
    const userId = req.user._id;
    const parsedLimit = Number(limit);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), MAX_MESSAGE_PAGE_LIMIT)
      : DEFAULT_MESSAGE_PAGE_LIMIT;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const roles = Array.isArray(req.authRoles) ? req.authRoles : [];
    const canAccessAll =
      roles.includes("administrator") || roles.includes("sales_manager");

    const conversation = await Conversation.findById(conversationId)
      .select("type participants group")
      .lean();

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const readAccessError = ensureConversationReadAccess({
      conversation,
      userId,
      canAccessAll,
    });
    if (readAccessError) {
      return res
        .status(readAccessError.status)
        .json({ message: readAccessError.message });
    }

    const query = {
      conversationId,
      hiddenFor: { $ne: userId },
    };
    const cursorFilterResult = buildMessageCursorQueryFilter(cursor);
    if (cursorFilterResult.error) {
      return res
        .status(cursorFilterResult.error.status)
        .json({ message: cursorFilterResult.error.message });
    }

    const groupChannelQuery = resolveGroupChannelMessageQuery({
      conversation,
      rawChannelId,
    });
    if (groupChannelQuery.error) {
      return res
        .status(groupChannelQuery.error.status)
        .json({ message: groupChannelQuery.error.message });
    }

    const effectiveGroupChannelId = groupChannelQuery.effectiveGroupChannelId;
    applyMessageQueryFilters({
      query,
      cursorFilter: cursorFilterResult.filter,
      groupChannelFilter: groupChannelQuery.filter,
    });

    let messages = await Message.find(query)
      .select(
        "_id conversationId groupChannelId senderId content imgUrl replyTo reactions isDeleted editedAt readBy createdAt updatedAt",
      )
      .populate("replyTo", "content senderId")
      .sort({ createdAt: -1, _id: -1 })
      .limit(safeLimit + 1)
      .lean();

    let nextCursor = null;

    if (messages.length > safeLimit) {
      const nextMessage = messages.at(-1);
      nextCursor = encodeMessagePaginationCursor(nextMessage);
      messages.pop();
    }

    messages = messages.reverse();

    return res.status(200).json({
      messages,
      nextCursor,
      ...(effectiveGroupChannelId
        ? { channelId: effectiveGroupChannelId }
        : {}),
    });
  } catch (error) {
    console.error("Lỗi xảy ra khi lấy messages", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getUserConversationsForSocketIO = async (userId) => {
  try {
    const conversations = await Conversation.find(
      { "participants.userId": userId },
      { _id: 1 },
    );

    return conversations.map((c) => c._id.toString());
  } catch (error) {
    console.error("Lỗi khi fetch conversations: ", error);
    return [];
  }
};

const addUserToSeenBy = (conversation, userId) => {
  const seenByIds = new Set(
    (conversation?.seenBy || [])
      .map((seenUserId) => toStringId(seenUserId))
      .filter(Boolean),
  );

  seenByIds.add(toStringId(userId));
  conversation.seenBy = Array.from(seenByIds);
};

const buildReadMessageLastMessagePayload = (conversation) => {
  if (!conversation?.lastMessage) {
    return null;
  }

  return {
    _id: conversation.lastMessage._id,
    content: conversation.lastMessage.content,
    createdAt: conversation.lastMessage.createdAt,
    groupChannelId: conversation.lastMessage.groupChannelId || null,
    sender: {
      _id: toStringId(conversation.lastMessage.senderId),
    },
  };
};

const emitReadMessageEvent = ({ conversation, conversationId, includeGroup = false }) => {
  io.to(conversationId).emit("read-message", {
    conversation: {
      _id: toStringId(conversation?._id),
      lastMessageAt: conversation?.lastMessageAt,
      unreadCounts: normalizeUnreadCounts(conversation?.unreadCounts),
      seenBy: (conversation?.seenBy || []).map((id) => toStringId(id)),
      ...(includeGroup
        ? {
            group: normalizeGroup(
              conversation?.group,
              conversation?.participants,
            ),
          }
        : {}),
    },
    lastMessage: buildReadMessageLastMessagePayload(conversation),
  });
};

const invalidateConversationCacheForParticipants = async (conversation) => {
  await Promise.all(
    (conversation?.participants || []).map(async (participant) => {
      const participantId = toStringId(participant?.userId);
      if (participantId) {
        await invalidateCache(`conversations:${participantId}`);
      }
    }),
  );
};

const applyGroupConversationSeenState = ({
  conversation,
  userId,
  requestedChannelId,
  requestUserId,
}) => {
  const { channels, activeChannelId, channelUnreadCounts } =
    ensureNormalizedGroupState(conversation, requestUserId);
  const effectiveChannelId = normalizeGroupChannelId(
    requestedChannelId || activeChannelId,
  );

  const channelExists = channels.some(
    (channel) => channel.channelId === effectiveChannelId,
  );

  if (!channelExists) {
    return {
      error: {
        status: 400,
        message: "Invalid group channel",
      },
      effectiveChannelId: null,
    };
  }

  const nextChannelUnreadCounts = {
    ...channelUnreadCounts,
  };
  const nextUserChannelUnread = {
    ...nextChannelUnreadCounts[userId],
  };

  delete nextUserChannelUnread[effectiveChannelId];

  if (Object.keys(nextUserChannelUnread).length > 0) {
    nextChannelUnreadCounts[userId] = nextUserChannelUnread;
  } else {
    delete nextChannelUnreadCounts[userId];
  }

  conversation.group.channelUnreadCounts = nextChannelUnreadCounts;
  conversation.unreadCounts = buildConversationUnreadCountsMapForGroup({
    conversation,
    channelUnreadCounts: nextChannelUnreadCounts,
  });

  const last = conversation.lastMessage;
  const lastSenderId = toStringId(last?.senderId);
  const normalizedLastMessageChannelId = normalizeGroupChannelId(
    last?.groupChannelId,
  );

  if (
    last &&
    lastSenderId &&
    lastSenderId !== userId &&
    normalizedLastMessageChannelId === effectiveChannelId
  ) {
    addUserToSeenBy(conversation, userId);
  }

  return {
    error: null,
    effectiveChannelId,
  };
};

const loadConversationWithReadAccess = async ({
  conversationId,
  userId,
  canAccessAll,
}) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    return {
      conversation: null,
      error: {
        status: 404,
        message: "Conversation không tồn tại",
      },
    };
  }

  const readAccessError = ensureConversationReadAccess({
    conversation,
    userId,
    canAccessAll,
  });
  if (readAccessError) {
    return {
      conversation: null,
      error: readAccessError,
    };
  }

  return {
    conversation,
    error: null,
  };
};

const getDirectMarkAsSeenNoopResponse = ({ conversation, userId }) => {
  const last = conversation?.lastMessage;

  if (!last) {
    return {
      status: 200,
      payload: { message: "Không có tin nhắn để mark as seen" },
    };
  }

  if (last.senderId?.toString?.() === userId) {
    return {
      status: 200,
      payload: { message: "Sender không cần mark as seen" },
    };
  }

  return null;
};

const executeAtomicGroupMarkAsSeen = async ({
  conversation,
  conversationId,
  userId,
  requestedChannelId,
  requestUserId,
  canAccessAll,
  readAccessFilter,
}) => {
  let currentConversation = conversation;
  let effectiveChannelId = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const conversationSnapshot = currentConversation?.toObject
      ? currentConversation.toObject()
      : { ...currentConversation };

    const groupSeenState = applyGroupConversationSeenState({
      conversation: conversationSnapshot,
      userId,
      requestedChannelId,
      requestUserId,
    });

    if (groupSeenState.error) {
      return {
        kind: "response",
        status: groupSeenState.error.status,
        payload: { message: groupSeenState.error.message },
      };
    }

    effectiveChannelId = groupSeenState.effectiveChannelId;

    const nextSeenBy = Array.from(
      new Set(
        (conversationSnapshot?.seenBy || [])
          .map((seenUserId) => toStringId(seenUserId))
          .filter(Boolean),
      ),
    );

    const updatedConversation = await Conversation.findOneAndUpdate(
      {
        _id: conversationId,
        type: "group",
        updatedAt: currentConversation.updatedAt,
        ...readAccessFilter,
      },
      {
        $set: {
          unreadCounts: normalizeUnreadCounts(conversationSnapshot.unreadCounts),
          "group.channelUnreadCounts":
            conversationSnapshot?.group?.channelUnreadCounts || {},
          "group.channels": conversationSnapshot?.group?.channels || [],
          "group.channelCategories":
            conversationSnapshot?.group?.channelCategories || [],
          "group.activeChannelId":
            conversationSnapshot?.group?.activeChannelId ||
            DEFAULT_GROUP_CHANNEL_ID,
          seenBy: nextSeenBy,
        },
      },
      { new: true },
    );

    if (updatedConversation) {
      return {
        kind: "ok",
        conversation: updatedConversation,
        effectiveChannelId,
      };
    }

    const reloadResult = await loadConversationWithReadAccess({
      conversationId,
      userId,
      canAccessAll,
    });
    if (reloadResult.error) {
      return {
        kind: "response",
        status: reloadResult.error.status,
        payload: { message: reloadResult.error.message },
      };
    }

    currentConversation = reloadResult.conversation;
  }

  return {
    kind: "response",
    status: 409,
    payload: { message: "Conversation state changed. Please retry." },
  };
};

const executeAtomicDirectMarkAsSeen = async ({
  conversation,
  conversationId,
  userId,
  requestUserId,
  canAccessAll,
  readAccessFilter,
}) => {
  const noopResponse = getDirectMarkAsSeenNoopResponse({
    conversation,
    userId,
  });
  if (noopResponse) {
    return {
      kind: "response",
      status: noopResponse.status,
      payload: noopResponse.payload,
    };
  }

  const updatedConversation = await Conversation.findOneAndUpdate(
    {
      _id: conversationId,
      type: "direct",
      "lastMessage.senderId": { $ne: requestUserId },
      ...readAccessFilter,
    },
    {
      $set: {
        [`unreadCounts.${userId}`]: 0,
      },
      $addToSet: {
        seenBy: requestUserId,
      },
    },
    { new: true },
  );

  if (updatedConversation) {
    return {
      kind: "ok",
      conversation: updatedConversation,
    };
  }

  const reloadResult = await loadConversationWithReadAccess({
    conversationId,
    userId,
    canAccessAll,
  });
  if (reloadResult.error) {
    return {
      kind: "response",
      status: reloadResult.error.status,
      payload: { message: reloadResult.error.message },
    };
  }

  const retryNoopResponse = getDirectMarkAsSeenNoopResponse({
    conversation: reloadResult.conversation,
    userId,
  });
  if (retryNoopResponse) {
    return {
      kind: "response",
      status: retryNoopResponse.status,
      payload: retryNoopResponse.payload,
    };
  }

  return {
    kind: "response",
    status: 409,
    payload: { message: "Conversation state changed. Please retry." },
  };
};

export const markAsSeen = async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const userId = req.user._id.toString();
    const requestedChannelId = String(
      req.query?.channelId || req.body?.channelId || "",
    ).trim();

    const roles = Array.isArray(req.authRoles) ? req.authRoles : [];
    const canAccessAll =
      roles.includes("administrator") || roles.includes("sales_manager");
    const readAccessFilter = canAccessAll
      ? {}
      : { "participants.userId": req.user._id };

    const initialLoad = await loadConversationWithReadAccess({
      conversationId,
      userId,
      canAccessAll,
    });

    if (initialLoad.error) {
      return res
        .status(initialLoad.error.status)
        .json({ message: initialLoad.error.message });
    }

    const conversation = initialLoad.conversation;

    if (conversation.type === "group") {
      const groupResult = await executeAtomicGroupMarkAsSeen({
        conversation,
        conversationId,
        userId,
        requestedChannelId,
        requestUserId: req.user._id,
        canAccessAll,
        readAccessFilter,
      });

      if (groupResult.kind === "response") {
        return res.status(groupResult.status).json(groupResult.payload);
      }

      emitReadMessageEvent({
        conversation: groupResult.conversation,
        conversationId,
        includeGroup: true,
      });
      await invalidateConversationCacheForParticipants(groupResult.conversation);

      return res.status(200).json({
        message: "Marked as seen",
        seenBy: groupResult.conversation?.seenBy || [],
        myUnreadCount: resolveUserUnreadCount(groupResult.conversation, userId),
        channelId: groupResult.effectiveChannelId,
      });
    }

    const directResult = await executeAtomicDirectMarkAsSeen({
      conversation,
      conversationId,
      userId,
      requestUserId: req.user._id,
      canAccessAll,
      readAccessFilter,
    });

    if (directResult.kind === "response") {
      return res.status(directResult.status).json(directResult.payload);
    }

    emitReadMessageEvent({
      conversation: directResult.conversation,
      conversationId,
      includeGroup: false,
    });
    await invalidateConversationCacheForParticipants(directResult.conversation);

    return res.status(200).json({
      message: "Marked as seen",
      seenBy: directResult.conversation?.seenBy || [],
      myUnreadCount: resolveUserUnreadCount(directResult.conversation, userId),
    });
  } catch (error) {
    console.error("Lỗi khi mark as seen", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateGroupAnnouncementMode = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { enabled } = req.body || {};
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled must be boolean" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Only group conversations support this setting" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only admins can update announcement mode" });
    }

    ensureNormalizedGroupState(conversation, userId);
    conversation.group.announcementOnly = enabled;
    const creatorId = toStringId(conversation.group.createdBy);
    const adminIds = new Set(
      (conversation.group.adminIds || []).map((adminId) => toStringId(adminId)),
    );
    if (creatorId) {
      adminIds.add(creatorId);
    }
    conversation.group.adminIds = Array.from(adminIds);

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({ conversation: payload });
  } catch (error) {
    console.error("Lỗi khi cập nhật announcement mode", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateGroupAdminRole = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { memberId, makeAdmin } = req.body || {};
    const userId = req.user._id;

    const payloadError = validateGroupAdminRoleRequest({
      conversationId,
      memberId,
      makeAdmin,
    });
    if (payloadError) {
      return res.status(payloadError.status).json({ message: payloadError.message });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const contextError = getGroupAdminRoleContextError({
      conversation,
      userId,
      memberId,
    });
    if (contextError) {
      return res.status(contextError.status).json({ message: contextError.message });
    }

    applyGroupAdminRoleUpdate({ conversation, memberId, makeAdmin });

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({ conversation: payload });
  } catch (error) {
    console.error("Lỗi khi cập nhật vai trò admin", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const createGroupChannel = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const {
      name,
      description,
      categoryId,
      sendRoles,
      position,
    } = req.body || {};
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const channelName = sanitizeGroupChannelName(name);
    if (
      channelName.length < MIN_GROUP_CHANNEL_NAME_LENGTH ||
      channelName.length > MAX_GROUP_CHANNEL_NAME_LENGTH
    ) {
      return res.status(400).json({
        message: `Channel name must be ${MIN_GROUP_CHANNEL_NAME_LENGTH}-${MAX_GROUP_CHANNEL_NAME_LENGTH} characters`,
      });
    }

    const channelDescription = sanitizeGroupChannelDescription(description);
    const normalizedCategoryId = normalizeGroupChannelCategoryId(categoryId);
    const normalizedSendRoles = normalizeGroupChannelSendRoles(sendRoles);
    const requestedPosition = toNonNegativeInt(position, Number.MAX_SAFE_INTEGER);

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Only group conversations support channels" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only group admins can create channels" });
    }

    const { channels, activeChannelId, categories } = ensureNormalizedGroupState(
      conversation,
      userId,
    );

    if (channels.length >= MAX_GROUP_CHANNELS_PER_CONVERSATION) {
      return res.status(400).json({
        message: `Group can have at most ${MAX_GROUP_CHANNELS_PER_CONVERSATION} channels`,
      });
    }

    const normalizedNameLower = channelName.toLowerCase();
    const hasDuplicateName = channels.some(
      (channel) => String(channel.name || "").toLowerCase() === normalizedNameLower,
    );

    if (hasDuplicateName) {
      return res.status(400).json({ message: "Channel name already exists in this group" });
    }

    if (
      normalizedCategoryId &&
      !categories.some((category) => category.categoryId === normalizedCategoryId)
    ) {
      return res.status(400).json({ message: "Invalid channel category" });
    }

    const existingIds = new Set(channels.map((channel) => channel.channelId));
    const channelId = buildUniqueGroupChannelId(channelName, existingIds);
    const nextChannel = {
      channelId,
      name: channelName,
      description: channelDescription,
      categoryId: normalizedCategoryId,
      position: channels.length,
      permissions: {
        sendRoles: normalizedSendRoles,
      },
      createdBy: userId,
      createdAt: new Date(),
    };

    const nextChannels = [...channels];
    const insertIndex = Math.min(
      nextChannels.length,
      requestedPosition,
    );
    nextChannels.splice(insertIndex, 0, nextChannel);

    const reindexedChannels = nextChannels.map((channel, index) => ({
      ...channel,
      position: index,
    }));

    conversation.group.channels = reindexedChannels;
    conversation.group.activeChannelId = channelId || activeChannelId;

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(201).json({
      conversation: payload,
      channel: {
        channelId: nextChannel.channelId,
        name: nextChannel.name,
        description: nextChannel.description,
        categoryId: nextChannel.categoryId,
        permissions: nextChannel.permissions,
      },
    });
  } catch (error) {
    console.error("Lỗi khi tạo group channel", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const setGroupActiveChannel = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { channelId } = req.body || {};
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const normalizedChannelId = normalizeGroupChannelId(channelId);
    if (!normalizedChannelId) {
      return res.status(400).json({ message: "channelId is required" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Only group conversations support channels" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { channels, activeChannelId } = ensureNormalizedGroupState(
      conversation,
      userId,
    );

    const channelExists = channels.some(
      (channel) => channel.channelId === normalizedChannelId,
    );

    if (!channelExists) {
      return res.status(404).json({ message: "Group channel not found" });
    }

    if (activeChannelId === normalizedChannelId) {
      return res.status(200).json({
        conversation: toGroupConversationPayload(conversation),
      });
    }

    conversation.group.channels = channels;
    conversation.group.activeChannelId = normalizedChannelId;

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({ conversation: payload });
  } catch (error) {
    console.error("Lỗi khi đổi group channel", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

const resolveGroupChannelAdminContext = async ({ conversationId, userId }) => {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return {
      error: { status: 400, message: "Invalid conversation id" },
      conversation: null,
      channels: [],
      categories: [],
    };
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    return {
      error: { status: 404, message: "Conversation not found" },
      conversation: null,
      channels: [],
      categories: [],
    };
  }

  if (conversation.type !== "group") {
    return {
      error: {
        status: 400,
        message: "Only group conversations support channels",
      },
      conversation,
      channels: [],
      categories: [],
    };
  }

  if (!isGroupParticipant(conversation, userId)) {
    return {
      error: { status: 403, message: "Access denied" },
      conversation,
      channels: [],
      categories: [],
    };
  }

  if (!isGroupAdmin(conversation, userId)) {
    return {
      error: {
        status: 403,
        message: "Only group admins can update channels",
      },
      conversation,
      channels: [],
      categories: [],
    };
  }

  const { channels, categories } = ensureNormalizedGroupState(conversation, userId);

  return {
    error: null,
    conversation,
    channels,
    categories,
  };
};

const resolveUpdatedGroupChannelPayload = ({
  channel,
  channels,
  categories,
  channelIndex,
  updates,
}) => {
  const nextChannel = {
    ...channel,
  };

  if (updates.name !== undefined) {
    const normalizedName = sanitizeGroupChannelName(updates.name);
    if (
      normalizedName.length < MIN_GROUP_CHANNEL_NAME_LENGTH ||
      normalizedName.length > MAX_GROUP_CHANNEL_NAME_LENGTH
    ) {
      return {
        error: {
          status: 400,
          message: `Channel name must be ${MIN_GROUP_CHANNEL_NAME_LENGTH}-${MAX_GROUP_CHANNEL_NAME_LENGTH} characters`,
        },
        nextChannel,
      };
    }

    const normalizedNameLower = normalizedName.toLowerCase();
    const hasDuplicateName = channels.some((existingChannel, index) => {
      if (index === channelIndex) {
        return false;
      }

      return String(existingChannel.name || "").toLowerCase() === normalizedNameLower;
    });

    if (hasDuplicateName) {
      return {
        error: {
          status: 400,
          message: "Channel name already exists in this group",
        },
        nextChannel,
      };
    }

    nextChannel.name = normalizedName;
  }

  if (updates.description !== undefined) {
    nextChannel.description = sanitizeGroupChannelDescription(updates.description);
  }

  if (updates.categoryId !== undefined) {
    const normalizedCategoryId = normalizeGroupChannelCategoryId(updates.categoryId);
    const hasCategory = categories.some(
      (category) => category.categoryId === normalizedCategoryId,
    );

    if (normalizedCategoryId && !hasCategory) {
      return {
        error: {
          status: 400,
          message: "Invalid channel category",
        },
        nextChannel,
      };
    }

    nextChannel.categoryId = normalizedCategoryId;
  }

  if (updates.sendRoles !== undefined) {
    nextChannel.permissions = {
      sendRoles: normalizeGroupChannelSendRoles(updates.sendRoles),
    };
  }

  return {
    error: null,
    nextChannel,
  };
};

export const updateGroupChannel = async (req, res) => {
  try {
    const { conversationId, channelId } = req.params;
    const {
      name,
      description,
      categoryId,
      sendRoles,
    } = req.body || {};
    const userId = req.user._id;

    const normalizedChannelId = normalizeGroupChannelId(channelId);
    if (!normalizedChannelId) {
      return res.status(400).json({ message: "channelId is required" });
    }

    const mutationContext = await resolveGroupChannelAdminContext({
      conversationId,
      userId,
    });

    if (mutationContext.error) {
      return res
        .status(mutationContext.error.status)
        .json({ message: mutationContext.error.message });
    }

    const { conversation, channels, categories } = mutationContext;
    const channelIndex = channels.findIndex(
      (channel) => channel.channelId === normalizedChannelId,
    );

    if (channelIndex < 0) {
      return res.status(404).json({ message: "Group channel not found" });
    }

    const updatePayloadResult = resolveUpdatedGroupChannelPayload({
      channel: channels[channelIndex],
      channels,
      categories,
      channelIndex,
      updates: {
        name,
        description,
        categoryId,
        sendRoles,
      },
    });

    if (updatePayloadResult.error) {
      return res
        .status(updatePayloadResult.error.status)
        .json({ message: updatePayloadResult.error.message });
    }

    const nextChannels = [...channels];
    const nextChannel = updatePayloadResult.nextChannel;
    nextChannels[channelIndex] = nextChannel;
    conversation.group.channels = nextChannels.map((channel, index) => ({
      ...channel,
      position: index,
    }));

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({
      conversation: payload,
      channel: nextChannel,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật group channel", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const deleteGroupChannel = async (req, res) => {
  try {
    const { conversationId, channelId } = req.params;
    const userId = req.user._id;

    const createHttpError = (status, message) => {
      const error = new Error(message);
      error.status = status;
      return error;
    };

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const normalizedChannelId = normalizeGroupChannelId(channelId);
    if (!normalizedChannelId) {
      return res.status(400).json({ message: "channelId is required" });
    }

    if (normalizedChannelId === DEFAULT_GROUP_CHANNEL_ID) {
      return res.status(400).json({ message: "Default #general channel cannot be deleted" });
    }

    const assertDeleteContext = (conversation) => {
      if (!conversation) {
        throw createHttpError(404, "Conversation not found");
      }

      if (conversation.type !== "group") {
        throw createHttpError(400, "Only group conversations support channels");
      }

      if (!isGroupParticipant(conversation, userId)) {
        throw createHttpError(403, "Access denied");
      }

      if (!isGroupAdmin(conversation, userId)) {
        throw createHttpError(403, "Only group admins can delete channels");
      }
    };

    const applyDeleteGroupChannelMutation = async ({
      conversation,
      session = null,
      dependentCleanupMode = "strict",
    }) => {
      const { channels, activeChannelId, channelUnreadCounts } =
        ensureNormalizedGroupState(conversation, userId);

      if (channels.length <= 1) {
        throw createHttpError(400, "At least one channel must remain");
      }

      const channelExists = channels.some(
        (channel) => channel.channelId === normalizedChannelId,
      );
      if (!channelExists) {
        throw createHttpError(404, "Group channel not found");
      }

      const nextChannels = channels
        .filter((channel) => channel.channelId !== normalizedChannelId)
        .map((channel, index) => ({
          ...channel,
          position: index,
        }));

      const nextChannelUnreadCounts = {};
      Object.entries(channelUnreadCounts || {}).forEach(([participantId, perChannel]) => {
        const nextPerChannel = {
          ...perChannel,
        };
        delete nextPerChannel[normalizedChannelId];

        if (Object.keys(nextPerChannel).length > 0) {
          nextChannelUnreadCounts[participantId] = nextPerChannel;
        }
      });

      conversation.group.channels = nextChannels;
      conversation.group.activeChannelId =
        activeChannelId === normalizedChannelId
          ? nextChannels[0].channelId
          : activeChannelId;
      conversation.group.channelUnreadCounts = nextChannelUnreadCounts;
      conversation.unreadCounts = buildConversationUnreadCountsMapForGroup({
        conversation,
        channelUnreadCounts: nextChannelUnreadCounts,
      });

      const deleteMessagesQuery = Message.deleteMany({
        conversationId,
        groupChannelId: normalizedChannelId,
      }).setOptions({
        ...(session ? { session } : {}),
        dependentCleanupMode,
        dependentCleanupContext: {
          operation: "deleteGroupChannel",
          conversationId,
          channelId: normalizedChannelId,
          actorId: toStringId(userId),
        },
      });

      await deleteMessagesQuery;

      const pinnedMessageId = toStringId(conversation?.pinnedMessage?._id);
      if (pinnedMessageId) {
        const pinnedMessageExistsQuery = Message.exists({
          _id: pinnedMessageId,
          conversationId,
        });

        if (session) {
          pinnedMessageExistsQuery.session(session);
        }

        const pinnedMessageStillExists = await pinnedMessageExistsQuery;
        if (!pinnedMessageStillExists) {
          conversation.pinnedMessage = null;
        }
      }

      if (
        normalizeGroupChannelId(conversation.lastMessage?.groupChannelId) ===
        normalizedChannelId
      ) {
        await syncGroupConversationLastMessage({
          conversation,
          channelIds: nextChannels.map((channel) => channel.channelId),
          session,
        });
      }

      await conversation.save(session ? { session } : undefined);
    };

    let conversation = null;
    let deletedWithTransaction = false;
    let transactionCapabilityError = null;

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        conversation = await Conversation.findById(conversationId).session(session);
        assertDeleteContext(conversation);

        await applyDeleteGroupChannelMutation({
          conversation,
          session,
          dependentCleanupMode: "strict",
        });
      });

      deletedWithTransaction = true;
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      const shouldFallbackToNonTx =
        message.includes("transaction numbers are only allowed") ||
        message.includes("replica set") ||
        message.includes("not supported");

      if (!shouldFallbackToNonTx) {
        throw error;
      }

      transactionCapabilityError = error;
    } finally {
      await session.endSession();
    }

    if (!deletedWithTransaction) {
      if (transactionCapabilityError) {
        console.warn(
          "[deleteGroupChannel] Transactions unavailable, fallback to compensating mode.",
          transactionCapabilityError,
        );
      }

      conversation = await Conversation.findById(conversationId);
      assertDeleteContext(conversation);

      await applyDeleteGroupChannelMutation({
        conversation,
        dependentCleanupMode: "compensate",
      });
    }

    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({
      conversation: payload,
      deletedChannelId: normalizedChannelId,
    });
  } catch (error) {
    const status = Number(error?.status || 0);
    if (status >= 400 && status < 500) {
      return res.status(status).json({ message: error.message });
    }

    console.error("Lỗi khi xoá group channel", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const reorderGroupChannels = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { channelIds } = req.body || {};
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    if (!Array.isArray(channelIds) || channelIds.length === 0) {
      return res.status(400).json({ message: "channelIds must be a non-empty array" });
    }

    const normalizedOrder = channelIds
      .map((channelId) => normalizeGroupChannelId(channelId))
      .filter(Boolean);

    if (new Set(normalizedOrder).size !== normalizedOrder.length) {
      return res.status(400).json({ message: "channelIds contains duplicates" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Only group conversations support channels" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only group admins can reorder channels" });
    }

    const { channels, activeChannelId } = ensureNormalizedGroupState(conversation, userId);
    const existingChannelIds = channels.map((channel) => channel.channelId);

    if (normalizedOrder.length !== existingChannelIds.length) {
      return res.status(400).json({ message: "channelIds must include all channels" });
    }

    const existingIdSet = new Set(existingChannelIds);
    const isValidOrdering = normalizedOrder.every((channelId) => existingIdSet.has(channelId));
    if (!isValidOrdering) {
      return res.status(400).json({ message: "channelIds includes invalid channel" });
    }

    const orderMap = new Map(
      normalizedOrder.map((channelId, index) => [channelId, index]),
    );

    const reorderedChannels = [...channels]
      .sort(
        (a, b) =>
          (orderMap.get(a.channelId) ?? 0) - (orderMap.get(b.channelId) ?? 0),
      )
      .map((channel, index) => ({
        ...channel,
        position: index,
      }));

    conversation.group.channels = reorderedChannels;
    conversation.group.activeChannelId = reorderedChannels.some(
      (channel) => channel.channelId === activeChannelId,
    )
      ? activeChannelId
      : reorderedChannels[0]?.channelId || DEFAULT_GROUP_CHANNEL_ID;

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({ conversation: payload });
  } catch (error) {
    console.error("Lỗi khi reorder group channels", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const createGroupChannelCategory = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { name, position } = req.body || {};
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const categoryName = sanitizeGroupChannelCategoryName(name);
    if (
      categoryName.length < MIN_GROUP_CHANNEL_CATEGORY_NAME_LENGTH ||
      categoryName.length > MAX_GROUP_CHANNEL_CATEGORY_NAME_LENGTH
    ) {
      return res.status(400).json({
        message: `Category name must be ${MIN_GROUP_CHANNEL_CATEGORY_NAME_LENGTH}-${MAX_GROUP_CHANNEL_CATEGORY_NAME_LENGTH} characters`,
      });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Only group conversations support channel categories" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only group admins can create channel categories" });
    }

    const { categories } = ensureNormalizedGroupState(conversation, userId);

    if (categories.length >= MAX_GROUP_CHANNEL_CATEGORIES_PER_CONVERSATION) {
      return res.status(400).json({
        message: `Group can have at most ${MAX_GROUP_CHANNEL_CATEGORIES_PER_CONVERSATION} categories`,
      });
    }

    const normalizedNameLower = categoryName.toLowerCase();
    const hasDuplicateName = categories.some(
      (category) => String(category.name || "").toLowerCase() === normalizedNameLower,
    );
    if (hasDuplicateName) {
      return res.status(400).json({ message: "Category name already exists" });
    }

    const existingCategoryIds = new Set(
      categories.map((category) => category.categoryId),
    );
    const categoryId = buildUniqueGroupChannelCategoryId(
      categoryName,
      existingCategoryIds,
    );

    const nextCategory = {
      categoryId,
      name: categoryName,
      position: categories.length,
      createdBy: userId,
      createdAt: new Date(),
    };

    const nextCategories = [...categories];
    const insertIndex = Math.min(
      nextCategories.length,
      toNonNegativeInt(position, nextCategories.length),
    );
    nextCategories.splice(insertIndex, 0, nextCategory);

    conversation.group.channelCategories = nextCategories.map((category, index) => ({
      ...category,
      position: index,
    }));

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(201).json({
      conversation: payload,
      category: nextCategory,
    });
  } catch (error) {
    console.error("Lỗi khi tạo channel category", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateGroupChannelCategory = async (req, res) => {
  try {
    const { conversationId, categoryId } = req.params;
    const { name } = req.body || {};
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const normalizedCategoryId = normalizeGroupChannelCategoryId(categoryId);
    if (!normalizedCategoryId) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Only group conversations support channel categories" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only group admins can update channel categories" });
    }

    const { categories } = ensureNormalizedGroupState(conversation, userId);
    const categoryIndex = categories.findIndex(
      (category) => category.categoryId === normalizedCategoryId,
    );

    if (categoryIndex < 0) {
      return res.status(404).json({ message: "Channel category not found" });
    }

    const nextCategories = [...categories];
    const nextCategory = {
      ...nextCategories[categoryIndex],
    };

    if (name !== undefined) {
      const nextName = sanitizeGroupChannelCategoryName(name);
      if (
        nextName.length < MIN_GROUP_CHANNEL_CATEGORY_NAME_LENGTH ||
        nextName.length > MAX_GROUP_CHANNEL_CATEGORY_NAME_LENGTH
      ) {
        return res.status(400).json({
          message: `Category name must be ${MIN_GROUP_CHANNEL_CATEGORY_NAME_LENGTH}-${MAX_GROUP_CHANNEL_CATEGORY_NAME_LENGTH} characters`,
        });
      }

      const nextNameLower = nextName.toLowerCase();
      const hasDuplicateName = categories.some((category, index) => {
        if (index === categoryIndex) {
          return false;
        }

        return String(category.name || "").toLowerCase() === nextNameLower;
      });

      if (hasDuplicateName) {
        return res.status(400).json({ message: "Category name already exists" });
      }

      nextCategory.name = nextName;
    }

    nextCategories[categoryIndex] = nextCategory;
    conversation.group.channelCategories = nextCategories;

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({
      conversation: payload,
      category: nextCategory,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật channel category", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const deleteGroupChannelCategory = async (req, res) => {
  try {
    const { conversationId, categoryId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const normalizedCategoryId = normalizeGroupChannelCategoryId(categoryId);
    if (!normalizedCategoryId) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Only group conversations support channel categories" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only group admins can delete channel categories" });
    }

    const { categories, channels } = ensureNormalizedGroupState(conversation, userId);
    const categoryExists = categories.some(
      (category) => category.categoryId === normalizedCategoryId,
    );

    if (!categoryExists) {
      return res.status(404).json({ message: "Channel category not found" });
    }

    const nextCategories = categories
      .filter((category) => category.categoryId !== normalizedCategoryId)
      .map((category, index) => ({
        ...category,
        position: index,
      }));

    const nextChannels = channels.map((channel, index) => ({
      ...channel,
      categoryId:
        channel.categoryId === normalizedCategoryId ? null : channel.categoryId,
      position: index,
    }));

    conversation.group.channelCategories = nextCategories;
    conversation.group.channels = nextChannels;

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({
      conversation: payload,
      deletedCategoryId: normalizedCategoryId,
    });
  } catch (error) {
    console.error("Lỗi khi xoá channel category", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const reorderGroupChannelCategories = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { categoryIds } = req.body || {};
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    if (!Array.isArray(categoryIds)) {
      return res.status(400).json({ message: "categoryIds must be an array" });
    }

    const normalizedCategoryIds = categoryIds
      .map((rawCategoryId) => normalizeGroupChannelCategoryId(rawCategoryId))
      .filter(Boolean);

    if (new Set(normalizedCategoryIds).size !== normalizedCategoryIds.length) {
      return res.status(400).json({ message: "categoryIds contains duplicates" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Only group conversations support channel categories" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only group admins can reorder channel categories" });
    }

    const { categories, channels } = ensureNormalizedGroupState(conversation, userId);

    if (normalizedCategoryIds.length !== categories.length) {
      return res.status(400).json({ message: "categoryIds must include all categories" });
    }

    const existingCategoryIds = new Set(
      categories.map((category) => category.categoryId),
    );

    const hasInvalidCategoryId = normalizedCategoryIds.some(
      (categoryIdValue) => !existingCategoryIds.has(categoryIdValue),
    );
    if (hasInvalidCategoryId) {
      return res.status(400).json({ message: "categoryIds includes invalid category" });
    }

    const orderMap = new Map(
      normalizedCategoryIds.map((categoryIdValue, index) => [categoryIdValue, index]),
    );

    const reorderedCategories = [...categories]
      .sort((a, b) => (orderMap.get(a.categoryId) ?? 0) - (orderMap.get(b.categoryId) ?? 0))
      .map((category, index) => ({
        ...category,
        position: index,
      }));

    const categoryPositionMap = new Map(
      reorderedCategories.map((category) => [category.categoryId, category.position]),
    );

    const reorderedChannels = [...channels]
      .sort((a, b) => {
        const aCategoryPosition =
          a.categoryId && categoryPositionMap.has(a.categoryId)
            ? categoryPositionMap.get(a.categoryId)
            : Number.MAX_SAFE_INTEGER;
        const bCategoryPosition =
          b.categoryId && categoryPositionMap.has(b.categoryId)
            ? categoryPositionMap.get(b.categoryId)
            : Number.MAX_SAFE_INTEGER;

        if (aCategoryPosition !== bCategoryPosition) {
          return aCategoryPosition - bCategoryPosition;
        }

        return a.position - b.position;
      })
      .map((channel, index) => ({
        ...channel,
        position: index,
      }));

    conversation.group.channelCategories = reorderedCategories;
    conversation.group.channels = reorderedChannels;

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({ conversation: payload });
  } catch (error) {
    console.error("Lỗi khi reorder channel categories", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getGroupChannelAnalytics = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const requestedDays = Number(req.query?.days || 7);
    const rangeDays = Math.min(Math.max(toNonNegativeInt(requestedDays, 7), 1), 90);

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const conversation = await Conversation.findById(conversationId)
      .select("type participants group")
      .lean();

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Only group conversations support channel analytics" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only group admins can view analytics" });
    }

    const { channels } = resolveGroupChannelsState(conversation.group);
    const channelIds = channels.map((channel) => channel.channelId);
    const channelIdSet = new Set(channelIds);
    const channelFilter = buildGroupMessageChannelQueryFilter(channelIds);

    const now = new Date();
    const currentPeriodStart = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    const previousPeriodStart = new Date(
      currentPeriodStart.getTime() - rangeDays * 24 * 60 * 60 * 1000,
    );

    const queryBase = {
      conversationId,
      isDeleted: { $ne: true },
    };
    const scopedQueryBase = channelFilter
      ? {
          ...queryBase,
          ...channelFilter,
        }
      : queryBase;

    const currentMessages = await Message.find({
      ...scopedQueryBase,
      createdAt: {
        $gte: currentPeriodStart,
        $lte: now,
      },
    })
      .select("groupChannelId senderId")
      .lean();

    const previousMessages = await Message.find({
      ...scopedQueryBase,
      createdAt: {
        $gte: previousPeriodStart,
        $lt: currentPeriodStart,
      },
    })
      .select("groupChannelId senderId")
      .lean();

    const currentStatsByChannel = new Map(
      channelIds.map((channelIdValue) => [
        channelIdValue,
        { messages: 0, senders: new Set() },
      ]),
    );
    const previousStatsByChannel = new Map(
      channelIds.map((channelIdValue) => [
        channelIdValue,
        { messages: 0, senders: new Set() },
      ]),
    );

    const currentActiveMembers = new Set();
    const previousActiveMembers = new Set();

    currentMessages.forEach((message) => {
      const normalizedChannelId = normalizeGroupChannelId(message.groupChannelId);
      if (!channelIdSet.has(normalizedChannelId)) {
        return;
      }

      const stats = currentStatsByChannel.get(normalizedChannelId);
      if (!stats) {
        return;
      }

      stats.messages += 1;
      const senderId = toStringId(message.senderId);
      if (senderId) {
        stats.senders.add(senderId);
        currentActiveMembers.add(senderId);
      }
    });

    previousMessages.forEach((message) => {
      const normalizedChannelId = normalizeGroupChannelId(message.groupChannelId);
      if (!channelIdSet.has(normalizedChannelId)) {
        return;
      }

      const stats = previousStatsByChannel.get(normalizedChannelId);
      if (!stats) {
        return;
      }

      stats.messages += 1;
      const senderId = toStringId(message.senderId);
      if (senderId) {
        stats.senders.add(senderId);
        previousActiveMembers.add(senderId);
      }
    });

    const membersCount = Array.isArray(conversation.participants)
      ? conversation.participants.length
      : 0;

    const channelsAnalytics = channels.map((channel) => {
      const currentStats = currentStatsByChannel.get(channel.channelId) || {
        messages: 0,
        senders: new Set(),
      };
      const previousStats = previousStatsByChannel.get(channel.channelId) || {
        messages: 0,
        senders: new Set(),
      };

      const previousMessagesCount = previousStats.messages;
      const currentMessagesCount = currentStats.messages;
      let messageGrowthPercent = 0;
      if (previousMessagesCount <= 0) {
        if (currentMessagesCount > 0) {
          messageGrowthPercent = 100;
        }
      } else {
        messageGrowthPercent =
          Math.round(
            ((currentMessagesCount - previousMessagesCount) /
              previousMessagesCount) *
              10000,
          ) / 100;
      }

      const retainedSenders = Array.from(previousStats.senders).filter((senderId) =>
        currentStats.senders.has(senderId),
      ).length;
      const senderRetentionPercent =
        previousStats.senders.size > 0
          ? Math.round((retainedSenders / previousStats.senders.size) * 10000) / 100
          : 0;

      return {
        channelId: channel.channelId,
        name: channel.name,
        categoryId: channel.categoryId || null,
        position: channel.position,
        currentMessages: currentMessagesCount,
        previousMessages: previousMessagesCount,
        messageGrowthPercent,
        currentActiveSenders: currentStats.senders.size,
        senderRetentionPercent,
      };
    });

    const currentRetentionRate =
      membersCount > 0
        ? Math.round((currentActiveMembers.size / membersCount) * 10000) / 100
        : 0;
    const previousRetentionRate =
      membersCount > 0
        ? Math.round((previousActiveMembers.size / membersCount) * 10000) / 100
        : 0;

    return res.status(200).json({
      analytics: {
        conversationId,
        rangeDays,
        period: {
          currentStart: currentPeriodStart,
          currentEnd: now,
          previousStart: previousPeriodStart,
          previousEnd: currentPeriodStart,
        },
        summary: {
          membersCount,
          currentMessages: currentMessages.length,
          previousMessages: previousMessages.length,
          currentActiveMembers: currentActiveMembers.size,
          previousActiveMembers: previousActiveMembers.size,
          currentRetentionRate,
          previousRetentionRate,
          retentionDelta: Math.round((currentRetentionRate - previousRetentionRate) * 100) / 100,
        },
        channels: channelsAnalytics,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy channel analytics", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateGroupPinnedMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messageId } = req.body || {};
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Only group conversations support pinned messages" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only admins can pin or unpin messages" });
    }

    const normalizedMessageId = String(messageId || "").trim();

    if (!normalizedMessageId) {
      conversation.pinnedMessage = null;
      await conversation.save();
      const payload = await broadcastGroupConversationUpdated(conversation);
      return res.status(200).json({ conversation: payload });
    }

    if (!mongoose.Types.ObjectId.isValid(normalizedMessageId)) {
      return res.status(400).json({ message: "Invalid message id" });
    }

    const targetMessage = await Message.findOne({
      _id: normalizedMessageId,
      conversationId,
      isDeleted: { $ne: true },
    })
      .select("_id content imgUrl senderId createdAt")
      .lean();

    if (!targetMessage) {
      return res.status(404).json({ message: "Message not found in this conversation" });
    }

    conversation.pinnedMessage = {
      _id: toStringId(targetMessage._id),
      content: targetMessage.content || "",
      imgUrl: targetMessage.imgUrl || null,
      senderId: targetMessage.senderId,
      createdAt: targetMessage.createdAt,
      pinnedAt: new Date(),
      pinnedBy: userId,
    };

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({ conversation: payload });
  } catch (error) {
    console.error("Lỗi khi pin tin nhắn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const createGroupJoinLink = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const rawExpiryHours = req.body?.expiresInHours;
    const rawMaxUses = req.body?.maxUses;
    const oneTime = Boolean(req.body?.oneTime);
    const expiresInHours =
      rawExpiryHours === undefined
        ? JOIN_LINK_DEFAULT_EXPIRY_HOURS
        : Number(rawExpiryHours);
    const parsedMaxUses =
      rawMaxUses === undefined || rawMaxUses === null || rawMaxUses === ""
        ? null
        : Number(rawMaxUses);

    if (!Number.isInteger(expiresInHours)) {
      return res.status(400).json({ message: "expiresInHours must be an integer" });
    }

    if (
      expiresInHours < JOIN_LINK_MIN_EXPIRY_HOURS ||
      expiresInHours > JOIN_LINK_MAX_EXPIRY_HOURS
    ) {
      return res.status(400).json({
        message: `expiresInHours must be between ${JOIN_LINK_MIN_EXPIRY_HOURS} and ${JOIN_LINK_MAX_EXPIRY_HOURS}`,
      });
    }

    if (
      parsedMaxUses !== null &&
      (!Number.isInteger(parsedMaxUses) ||
        parsedMaxUses < 1 ||
        parsedMaxUses > JOIN_LINK_MAX_USES_LIMIT)
    ) {
      return res.status(400).json({
        message: `maxUses must be an integer between 1 and ${JOIN_LINK_MAX_USES_LIMIT}`,
      });
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Join link is available for group conversations only" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only group admins can create join links" });
    }

    const token = generateJoinLinkToken();
    const tokenHash = hashJoinLinkToken(token);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    const effectiveMaxUses = oneTime ? 1 : parsedMaxUses;

    ensureNormalizedGroupState(conversation, userId);

    conversation.group.joinLink = {
      tokenHash,
      expiresAt,
      createdAt: new Date(),
      createdBy: userId,
      maxUses: effectiveMaxUses,
      useCount: 0,
      oneTime,
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
    };

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);
    const remainingUses =
      effectiveMaxUses === null ? null : Math.max(0, effectiveMaxUses);

    return res.status(200).json({
      conversation: payload,
      joinLink: {
        token,
        url: buildGroupJoinLinkUrl({ conversationId, token }),
        expiresAt,
        expiresInHours,
        maxUses: effectiveMaxUses,
        oneTime,
        remainingUses,
      },
    });
  } catch (error) {
    console.error("Lỗi khi tạo join link", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const revokeGroupJoinLink = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Join link is available for group conversations only" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only group admins can revoke join links" });
    }

    ensureNormalizedGroupState(conversation, userId);

    conversation.group.joinLink = {
      tokenHash: null,
      expiresAt: null,
      createdAt: null,
      createdBy: null,
      maxUses: null,
      useCount: 0,
      oneTime: false,
      revokedAt: new Date(),
      revokedBy: userId,
      revokeReason: "manual",
    };

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);
    return res.status(200).json({ conversation: payload });
  } catch (error) {
    console.error("Lỗi khi thu hồi join link", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const joinGroupByLink = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const token = String(req.body?.token || "").trim();

    const requestError = getJoinGroupByLinkRequestError({
      conversationId,
      token,
    });
    if (requestError) {
      return res.status(requestError.status).json({ message: requestError.message });
    }

    const antiSpamResult = registerRateLimitHit({
      userId: `${toStringId(userId)}:${getClientIp(req)}`,
      scope: "chat:join-link",
      conversationId,
    });
    applyRateLimitHeaders(res, antiSpamResult);

    if (!antiSpamResult.allowed) {
      return res.status(429).json({
        message: `You're joining groups too fast. Try again in ${antiSpamResult.retryAfterSeconds}s.`,
        retryAfterSeconds: antiSpamResult.retryAfterSeconds,
        rateLimitScope: antiSpamResult.scope,
        rateLimitProfile: antiSpamResult.profile,
      });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Join link is available for group conversations only" });
    }

    const joinLink = conversation.group?.joinLink;
    if (!joinLink?.tokenHash || !joinLink?.expiresAt) {
      return res.status(404).json({ message: "Join link is not available" });
    }

    if (!isJoinLinkActive(joinLink)) {
      conversation.group.joinLink = {
        tokenHash: null,
        expiresAt: null,
        createdAt: null,
        createdBy: null,
        maxUses: null,
        useCount: 0,
        oneTime: false,
        revokedAt: new Date(),
        revokedBy: null,
        revokeReason: "expired",
      };
      await conversation.save();
      await broadcastGroupConversationUpdated(conversation);
      return res.status(410).json({ message: "Join link has expired" });
    }

    if (hashJoinLinkToken(token) !== String(joinLink.tokenHash)) {
      return res.status(400).json({ message: "Invalid join link token" });
    }

    const effectiveMaxUses = resolveJoinLinkMaxUses(joinLink);

    // Atomic join guard: only add participant when the user is not in this group yet.
    const joinQuery = {
      _id: conversationId,
      "participants.userId": { $ne: userId },
      "group.joinLink.tokenHash": String(joinLink.tokenHash),
      "group.joinLink.expiresAt": { $gt: new Date() },
      "group.joinLink.revokedAt": null,
    };

    if (effectiveMaxUses !== null) {
      joinQuery["group.joinLink.useCount"] = { $lt: effectiveMaxUses };
    }

    const joinedConversation = await Conversation.findOneAndUpdate(
      joinQuery,
      {
        $push: { participants: { userId, joinedAt: new Date() } },
        $set: { [`unreadCounts.${toStringId(userId)}`]: 0 },
        $inc: { "group.joinLink.useCount": 1 },
      },
      { new: true },
    );

    let conversationForResponse =
      joinedConversation || (await Conversation.findById(conversationId));

    if (!conversationForResponse) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const joinFailure = resolveAtomicJoinLinkFailure({
      joinedConversation,
      conversation: conversationForResponse,
      userId,
      token,
    });

    if (joinFailure) {
      return res.status(joinFailure.status).json({ message: joinFailure.message });
    }

    const joinedInThisRequest = Boolean(joinedConversation);
    const alreadyJoined = !joinedInThisRequest;

    if (joinedInThisRequest) {
      const policyRevokedConversation = await maybeRevokeJoinLinkByPolicy({
        conversationId,
        joinLink: conversationForResponse.group?.joinLink,
      });

      if (policyRevokedConversation) {
        conversationForResponse = policyRevokedConversation;
      }
    }

    await conversationForResponse.populate([
      { path: "participants.userId", select: "displayName avatarUrl" },
      { path: "lastMessage.senderId", select: "displayName avatarUrl" },
      { path: "seenBy", select: "displayName avatarUrl" },
    ]);

    const formattedConversation = formatConversationForClient(conversationForResponse);

    await Promise.all(
      (formattedConversation.participants || []).map(async (participant) => {
        const participantId = String(participant?._id || "").trim();
        if (participantId) {
          await invalidateCache(`conversations:${participantId}`);
        }
      }),
    );

    if (joinedInThisRequest) {
      io.to(String(userId)).emit("new-group", formattedConversation);
      io.to(String(conversationForResponse._id)).emit("group-conversation-updated", {
        conversation: {
          _id: formattedConversation._id,
          group: formattedConversation.group,
          participants: formattedConversation.participants,
          updatedAt: formattedConversation.updatedAt,
        },
      });
    }

    return res.status(200).json({
      conversation: formattedConversation,
      alreadyJoined,
    });
  } catch (error) {
    console.error("Lỗi khi tham gia group bằng join link", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// eslint-disable-next-line sonarjs/cognitive-complexity
export const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const roles = Array.isArray(req.authRoles) ? req.authRoles : [];
    const canDeleteAnyConversation =
      roles.includes("administrator") || roles.includes("sales_manager");

    const canUseTransactions =
      typeof mongoose?.connection?.startSession === "function";

    const verifyPermission = (conversationDoc) => {
      if (!canDeleteAnyConversation) {
        const isMember = conversationDoc.participants.some(
          (participant) => participant.userId.toString() === userId.toString(),
        );

        if (!isMember) {
          return false;
        }
      }

      return true;
    };

    let conversation;
    let deletedWithTransaction = false;
    let imageUrlsToDestroy = [];

    if (canUseTransactions) {
      const session = await mongoose.connection.startSession();

      try {
        await session.withTransaction(async () => {
          const scopedConversation = await Conversation.findById(
            conversationId,
          ).session(session);

          if (!scopedConversation) {
            throw new Error("NOT_FOUND");
          }

          if (!verifyPermission(scopedConversation)) {
            throw new Error("FORBIDDEN");
          }

          const [messagesWithImages, messageIdDocs] = await Promise.all([
            Message.find({
              conversationId,
              imgUrl: { $ne: null },
            }).select("imgUrl").session(session),
            Message.find({ conversationId }).select("_id").session(session),
          ]);

          imageUrlsToDestroy = messagesWithImages.map(msg => msg.imgUrl).filter(Boolean);
          const messageIds = messageIdDocs.map((msg) => msg._id).filter(Boolean);

          await Promise.all([
            Message.deleteMany({ conversationId })
              .setOptions({
                skipDependentCleanup: true,
                skipCounterSync: true,
              })
              .session(session),
            Bookmark.deleteMany({ conversationId }).session(session),
            Notification.deleteMany({ conversationId }).session(session),
            ContentReport.deleteMany({
              $or: [
                {
                  targetType: "message",
                  targetId: { $in: messageIds },
                },
                {
                  "context.conversationId": conversationId,
                },
              ],
            }).session(session),
          ]);
          await Conversation.findOneAndDelete(
            { _id: scopedConversation._id },
          )
            .setOptions({ skipCascadeCleanup: true })
            .session(session);

          conversation = scopedConversation;
        });

        deletedWithTransaction = true;
      } catch (transactionError) {
        if (transactionError?.message === "NOT_FOUND") {
          return res.status(404).json({ message: "Conversation không tồn tại" });
        }

        if (transactionError?.message === "FORBIDDEN") {
          return res
            .status(403)
            .json({ message: "Bạn không có quyền xoá conversation này" });
        }

        const message = String(transactionError?.message || "").toLowerCase();
        const shouldFallbackToNonTx =
          message.includes("transaction numbers are only allowed") ||
          message.includes("replica set") ||
          message.includes("not supported");

        if (!shouldFallbackToNonTx) {
          throw transactionError;
        }
      } finally {
        await session.endSession();
      }
    }

    if (!deletedWithTransaction) {
      conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        return res.status(404).json({ message: "Conversation không tồn tại" });
      }

      if (!verifyPermission(conversation)) {
        return res
          .status(403)
          .json({ message: "Bạn không có quyền xoá conversation này" });
      }

      try {
        const [messagesWithImages, messageIdDocs] = await Promise.all([
          Message.find({
            conversationId,
            imgUrl: { $ne: null },
          }).select("imgUrl"),
          Message.find({ conversationId }).select("_id"),
        ]);
        imageUrlsToDestroy = messagesWithImages.map(msg => msg.imgUrl).filter(Boolean);
        const messageIds = messageIdDocs.map((msg) => msg._id).filter(Boolean);

        // Cleanup dependent collections before deleting the conversation document.
        await Promise.all([
          Message.deleteMany({ conversationId }).setOptions({
            skipDependentCleanup: true,
            skipCounterSync: true,
          }),
          Bookmark.deleteMany({ conversationId }),
          Notification.deleteMany({ conversationId }),
          ContentReport.deleteMany({
            $or: [
              {
                targetType: "message",
                targetId: { $in: messageIds },
              },
              {
                "context.conversationId": conversationId,
              },
            ],
          }),
        ]);
      } catch (messageDeleteError) {
        console.error("[deleteConversation] Related cleanup failed — aborting to prevent orphan data", messageDeleteError);
        throw messageDeleteError;
      }

      const deletedConversation = await Conversation.findOneAndDelete({
        _id: conversation._id,
      }).setOptions({ skipCascadeCleanup: true });

      if (!deletedConversation) {
        return res.status(404).json({ message: "Conversation không tồn tại" });
      }
    } // end if (!deletedWithTransaction)

    // 4. Emit to all participants that conversation was deleted
    await Promise.all(conversation.participants.map(async (p) => {
      const participantIdStr = p.userId.toString();
      await invalidateCache(`conversations:${participantIdStr}`);
      io.in(participantIdStr).socketsLeave(conversationId);
      io.to(participantIdStr).emit("conversation-deleted", {
        conversationId,
      });
    }));

    // 5. Enterprise Fire-and-Forget: Dọn rác Cloudinary chạy nền
    if (imageUrlsToDestroy.length > 0) {
      Promise.allSettled(imageUrlsToDestroy.map(url => destroyImageFromUrl(url)))
        .catch(err => console.error("[conversation] Bulk Cloudinary destroy error during deleteConversation", err));
    }

    return res.status(200).json({
      message: "Xoá conversation thành công",
      conversationId,
    });
  } catch (error) {
    console.error("Lỗi khi xoá conversation", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
// ADMIN API: Get all conversations with real data from MongoDB (for Drupal admin)
export const getAdminConversations = async (req, res) => {
  try {
    const roles = Array.isArray(req.authRoles) ? req.authRoles : [];
    const canAccessAdminConversations =
      roles.includes("administrator") || roles.includes("sales_manager");

    if (!canAccessAdminConversations) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { normalizePaging } = await import("../utils/pagingHelper.js").catch(
      () => ({ normalizePaging: (p, l) => ({ page: Number(p)||1, limit: Number(l)||50, skip: ((Number(p)||1)-1)*(Number(l)||50) }) })
    );

    const { page, limit, skip } = normalizePaging(req.query.page, req.query.limit);

    // Bounding Enterprise: Không còn query mù quáng kéo toàn bộ CSDL
    const [conversations, totalCount] = await Promise.all([
      Conversation.find()
        .populate({
          path: "participants.userId",
          select: "_id displayName avatarUrl drupalId",
        })
        .populate({
          path: "lastMessage.senderId",
          select: "_id displayName",
        })
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Conversation.countDocuments(),
    ]);

    // Enrich data
    const enriched = conversations.map((conv) => {
      const lastActivity = conv.lastMessageAt
        ? new Date(conv.lastMessageAt)
        : null;
      const now = new Date();
      const diffMs = lastActivity ? now - lastActivity : null;

      let timeAgo = "Never";
      if (diffMs) {
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) timeAgo = "Just now";
        else if (diffMins < 60) timeAgo = `${diffMins}m ago`;
        else if (diffHours < 24) timeAgo = `${diffHours}h ago`;
        else if (diffDays < 7) timeAgo = `${diffDays}d ago`;
        else timeAgo = lastActivity.toLocaleDateString();
      }

      // Filter out null/undefined participants
      const validParticipants = (conv.participants || [])
        .filter((p) => Boolean(p?.userId))
        .map((p) => ({
          userId: p.userId?._id || p.userId,
          displayName: p.userId?.displayName || "Unknown User",
          drupalId: p.userId?.drupalId || "N/A",
        }));

      return {
        id: conv._id?.toString?.() || conv._id,
        _id: conv._id,
        type: conv.type,
        name: conv.group?.name || "Direct Chat",
        messageCount: conv.messageCount || 0,
        participantCount: validParticipants.length,
        participants: validParticipants,
        lastMessage: conv.lastMessage?.content || "No messages",
        lastMessageAt: lastActivity,
        timeAgo,
        createdAt: conv.createdAt,
      };
    });

    // Enterprise Statistics via Aggregation / countDocuments to prevent Memory Leaks
    const [
      directCount,
      groupCount,
      activeTodayCount,
      aggStats
    ] = await Promise.all([
      Conversation.countDocuments({ type: "direct" }),
      Conversation.countDocuments({ type: "group" }),
      Conversation.countDocuments({
        lastMessageAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      Conversation.aggregate([
        {
          $group: {
            _id: null,
            totalMessages: { $sum: "$messageCount" },
            avgParticipants: { $avg: { $size: { $ifNull: ["$participants", []] } } }
          }
        }
      ]),
    ]);

    const stats = {
      totalConversations: totalCount,
      privateConversations: directCount,
      groupConversations: groupCount,
      activeTodayCount: activeTodayCount,
      totalMessages: aggStats[0]?.totalMessages || 0,
      avgParticipants: Math.round((aggStats[0]?.avgParticipants || 0) * 100) / 100,
    };

    return res.status(200).json({
      success: true,
      data: enriched,
      stats,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      lastUpdated: new Date(),
    });
  } catch (error) {
    console.error("[getAdminConversations] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu conversations",
      error: error.message,
    });
  }
};

// ADMIN API: Get a single conversation + latest messages (for Drupal admin)
export const getAdminConversation = async (req, res) => {
  try {
    const roles = Array.isArray(req.authRoles) ? req.authRoles : [];
    const canAccessAdminConversations =
      roles.includes("administrator") || roles.includes("sales_manager");

    if (!canAccessAdminConversations) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { conversationId } = req.params;

    const conversationDoc = await Conversation.findById(conversationId)
      .populate({
        path: "participants.userId",
        select: "_id displayName email avatarUrl drupalId",
      })
      .populate({
        path: "lastMessage.senderId",
        select: "_id displayName email avatarUrl drupalId",
      })
      .lean();

    if (!conversationDoc) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const participants = (conversationDoc.participants || [])
      .filter((p) => Boolean(p?.userId))
      .map((p) => ({
        userId: p.userId?._id || p.userId,
        displayName: p.userId?.displayName || "Unknown User",
        email: p.userId?.email || null,
        avatarUrl: p.userId?.avatarUrl ?? null,
        drupalId: p.userId?.drupalId || "N/A",
        joinedAt: p.joinedAt,
      }));

    const conversation = {
      id: conversationDoc._id?.toString?.() || conversationDoc._id,
      _id: conversationDoc._id,
      type: conversationDoc.type,
      name: conversationDoc.group?.name || "Direct Chat",
      messageCount: conversationDoc.messageCount || 0,
      participantCount: participants.length,
      participants,
      createdAt: conversationDoc.createdAt,
      lastMessageAt: conversationDoc.lastMessageAt || null,
      lastMessage: conversationDoc.lastMessage?.content || "No messages",
    };

    const messages = await Message.find({
      conversationId,
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate({
        path: "senderId",
        select: "_id displayName email avatarUrl drupalId",
      });

    const formattedMessages = messages
      .slice()
      .reverse()
      .map((m) => ({
        _id: m._id,
        senderId: m.senderId
          ? {
              _id: m.senderId._id,
              displayName: m.senderId.displayName,
              email: m.senderId.email,
              avatarUrl: m.senderId.avatarUrl ?? null,
              drupalId: m.senderId.drupalId ?? null,
            }
          : null,
        content: m.content || "",
        createdAt: m.createdAt,
        attachments: m.imgUrl
          ? [{ filename: "Attachment", url: m.imgUrl }]
          : [],
      }));

    return res.status(200).json({
      success: true,
      data: {
        conversation,
        messages: formattedMessages,
      },
    });
  } catch (error) {
    console.error("[getAdminConversation] Error:", error);
    return res.status(500).json({
      message: "Unable to fetch admin conversation",
      error: error.message,
    });
  }
};
