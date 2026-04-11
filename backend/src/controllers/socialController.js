import mongoose from "mongoose";
import User from "../models/User.js";
import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import Follow from "../models/Follow.js";
import Friend from "../models/Friend.js";
import Notification from "../models/Notification.js";
import { v2 as cloudinary } from "cloudinary";
import { destroyImageFromUrl } from "../utils/cloudinaryHelper.js";
import { getCachedData, setCachedData, invalidateCache } from "../libs/redis.js";

const SUPPORTED_REACTION_TYPES = ["like", "love", "haha", "wow", "sad", "angry"];

const normalizeReactionType = (input) => {
  const normalized = String(input || "like").trim().toLowerCase();
  return SUPPORTED_REACTION_TYPES.includes(normalized) ? normalized : "like";
};

const buildReactionSummary = (reactions) => {
  const summary = SUPPORTED_REACTION_TYPES.reduce((acc, reactionType) => {
    acc[reactionType] = 0;
    return acc;
  }, {});

  (Array.isArray(reactions) ? reactions : []).forEach((reaction) => {
    summary[normalizeReactionType(reaction?.type)] += 1;
  });

  return summary;
};

const MAX_REACTION_CAS_RETRIES = 25;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildUpdatedReactionsForUser = (
  reactions,
  targetUserId,
  nextReactionType,
) => {
  const normalizedTargetUserId = String(targetUserId);
  const safeReactions = Array.isArray(reactions) ? reactions : [];
  const reactionIndex = safeReactions.findIndex(
    (item) => String(item?.userId) === normalizedTargetUserId,
  );

  const next = safeReactions.map((item) => ({
    userId: item?.userId,
    type: normalizeReactionType(item?.type),
  }));

  let finalReactionType = null;
  let isNewReactionAdded = false;

  if (reactionIndex === -1) {
    next.push({ userId: targetUserId, type: nextReactionType });
    finalReactionType = nextReactionType;
    isNewReactionAdded = true;
  } else {
    const existingType = normalizeReactionType(next[reactionIndex]?.type);
    if (existingType === nextReactionType) {
      next.splice(reactionIndex, 1);
    } else {
      next[reactionIndex].type = nextReactionType;
      finalReactionType = nextReactionType;
    }
  }

  return {
    nextReactions: next,
    finalReactionType,
    isNewReactionAdded,
  };
};

const updatePostReactionWithCAS = async ({ postId, userId, nextReactionType }) => {
  for (let attempt = 0; attempt < MAX_REACTION_CAS_RETRIES; attempt += 1) {
    const post = await Post.findById(postId).select(
      "_id authorId isDeleted likes reactions __v",
    );

    if (!post || post.isDeleted) {
      return null;
    }

    const normalizedReactions = Array.isArray(post.reactions)
      ? post.reactions
      : Array.isArray(post.likes)
        ? post.likes.map((item) => ({ userId: item, type: "like" }))
        : [];

    const { nextReactions, finalReactionType, isNewReactionAdded } =
      buildUpdatedReactionsForUser(normalizedReactions, userId, nextReactionType);

    const nextLikesCount = nextReactions.length;

    const updateResult = await Post.updateOne(
      {
        _id: postId,
        __v: post.__v,
        isDeleted: false,
      },
      {
        $set: {
          reactions: nextReactions,
          likesCount: nextLikesCount,
        },
        $inc: { __v: 1 },
      },
    );

    if (updateResult.modifiedCount === 1) {
      return {
        authorId: post.authorId,
        reactions: nextReactions,
        likesCount: nextLikesCount,
        finalReactionType,
        isNewReactionAdded,
      };
    }

    await invalidateCache(`feed:*`);

    // Add bounded backoff to reduce hot-loop contention on the same document.
    const backoffMs = Math.min(50, 5 + attempt * 3);
    await wait(backoffMs);
  }

  throw new Error("RETRY_CONFLICT: reaction update contention too high");
};

const collectCommentDescendantIds = async (rootCommentId) => {
  const ids = [String(rootCommentId)];
  let frontier = [String(rootCommentId)];

  while (frontier.length > 0) {
    const children = await Comment.find({
      parentCommentId: { $in: frontier },
      isDeleted: false,
    })
      .select("_id")
      .lean();

    const childIds = children.map((item) => String(item._id));
    if (childIds.length === 0) {
      break;
    }

    ids.push(...childIds);
    frontier = childIds;
  }

  return [...new Set(ids)];
};

const normalizePaging = (pageRaw, limitRaw) => {
  const page = Math.max(1, Number(pageRaw) || 1);
  const limit = Math.min(50, Math.max(1, Number(limitRaw) || 15));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const normalizeFriendPair = (firstUserId, secondUserId) => {
  let userA = String(firstUserId);
  let userB = String(secondUserId);

  if (userA > userB) {
    [userA, userB] = [userB, userA];
  }

  return { userA, userB };
};

const resolveProfileAccess = async (currentUserId, profileUserId) => {
  const isSelf = String(currentUserId) === String(profileUserId);

  if (isSelf) {
    return {
      isSelf: true,
      isFollowing: false,
      isFriend: true,
      canViewProfile: true,
    };
  }

  const { userA, userB } = normalizeFriendPair(currentUserId, profileUserId);

  const [followRelation, friendRelation] = await Promise.all([
    Follow.findOne({
      followerId: currentUserId,
      followingId: profileUserId,
    }).select("_id"),
    Friend.findOne({ userA, userB }).select("_id"),
  ]);

  const isFollowing = Boolean(followRelation);
  const isFriend = Boolean(friendRelation);

  return {
    isSelf,
    isFollowing,
    isFriend,
    // Explicit access policy for profile pages: owner or friends.
    canViewProfile: isSelf || isFriend,
  };
};

const getViewerFriendIdSet = async (viewerUserId) => {
  const viewerId = String(viewerUserId || "");
  if (!viewerId) {
    return new Set();
  }

  const friendships = await Friend.find({
    $or: [{ userA: viewerId }, { userB: viewerId }],
  })
    .select("userA userB")
    .lean();

  const friendIds = new Set();
  friendships.forEach((friendship) => {
    const userA = String(friendship.userA || "");
    const userB = String(friendship.userB || "");
    if (userA && userA !== viewerId) {
      friendIds.add(userA);
    }
    if (userB && userB !== viewerId) {
      friendIds.add(userB);
    }
  });

  return friendIds;
};

const extractNormalizedReactions = (postObject) => {
  if (Array.isArray(postObject.reactions)) {
    return postObject.reactions
      .map((reaction) => ({
        userId: String(reaction?.userId || ""),
        type: normalizeReactionType(reaction?.type),
      }))
      .filter((reaction) => reaction.userId);
  }

  if (Array.isArray(postObject.likes)) {
    return postObject.likes.map((userId) => ({
      userId: String(userId),
      type: "like",
    }));
  }

  return [];
};

const buildVisibleReactorsMap = async (
  posts,
  viewerUserId,
  viewerFriendIdSet,
) => {
  const viewerId = String(viewerUserId || "");
  const allowedIds = new Set([viewerId, ...viewerFriendIdSet]);
  const reactorIds = new Set();

  posts.forEach((post) => {
    const postObject = post?.toObject ? post.toObject() : post;
    const normalizedReactions = extractNormalizedReactions(postObject);
    normalizedReactions.forEach((reaction) => {
      if (allowedIds.has(reaction.userId)) {
        reactorIds.add(reaction.userId);
      }
    });
  });

  if (reactorIds.size === 0) {
    return new Map();
  }

  const users = await User.find({
    _id: { $in: Array.from(reactorIds) },
  })
    .select("_id displayName username avatarUrl")
    .lean();

  return new Map(
    users.map((item) => [
      String(item._id),
      {
        _id: item._id,
        displayName: item.displayName,
        username: item.username,
        avatarUrl: item.avatarUrl || null,
      },
    ]),
  );
};

const toPostPayload = (
  post,
  currentUserId,
  options = { viewerFriendIdSet: null, visibleReactorsById: null },
) => {
  const postObject = post.toObject ? post.toObject() : post;

  const normalizedReactions = extractNormalizedReactions(postObject);

  const reactionSummary = buildReactionSummary(normalizedReactions);

  const ownReaction =
    normalizedReactions.find(
      (reaction) => String(reaction.userId) === String(currentUserId),
    )?.type || null;

  const viewerId = String(currentUserId || "");
  const allowedIds = options.viewerFriendIdSet
    ? new Set([viewerId, ...options.viewerFriendIdSet])
    : null;

  const visibleReactors =
    allowedIds && options.visibleReactorsById
      ? normalizedReactions
          .filter((reaction) => allowedIds.has(reaction.userId))
          .map((reaction) => options.visibleReactorsById.get(reaction.userId))
          .filter(Boolean)
          .filter(
            (item, index, list) =>
              list.findIndex(
                (candidate) => String(candidate._id) === String(item._id),
              ) === index,
          )
          .slice(0, 3)
      : [];

  return {
    ...postObject,
    isLiked: ownReaction === "like",
    ownReaction,
    reactionSummary,
    visibleReactors,
    likes: undefined,
    reactions: undefined,
  };
};

const uploadPostMedia = async (rawMediaUrls) => {
  const incomingMedia = Array.isArray(rawMediaUrls)
    ? rawMediaUrls
    : rawMediaUrls
      ? [rawMediaUrls]
      : [];

  const normalizedMedia = incomingMedia
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 10);

  if (normalizedMedia.length === 0) {
    return [];
  }

  const uploadSingle = async (mediaValue) => {
    if (mediaValue.startsWith("http://") || mediaValue.startsWith("https://")) {
      return mediaValue;
    }

    if (!mediaValue.startsWith("data:image/")) {
      throw new Error("Unsupported media format");
    }

    const uploaded = await cloudinary.uploader.upload(mediaValue, {
      folder: "coming_chat/posts",
      resource_type: "image",
    });

    return uploaded.secure_url;
  };

  return Promise.all(normalizedMedia.map((mediaValue) => uploadSingle(mediaValue)));
};

const createAndEmitNotification = async ({
  recipientId,
  actorId,
  type,
  postId = null,
  commentId = null,
  message = "",
}) => {
  if (!recipientId || !actorId || String(recipientId) === String(actorId)) {
    return null;
  }

  const notification = await Notification.create({
    recipientId,
    actorId,
    type,
    postId,
    commentId,
    message,
  });

  const populated = await Notification.findById(notification._id).populate(
    "actorId",
    "displayName username avatarUrl",
  );

  if (populated) {
    io.to(String(recipientId)).emit("social-notification", {
      notification: populated,
    });
  }

  return populated;
};

const emitSocialLikeUpdated = ({
  postId,
  likesCount,
  liked,
  actor,
  reactionSummary,
}) => {
  io.emit("social-post-like-updated", {
    postId: String(postId),
    likesCount,
    liked,
    reactionType: liked || null,
    reactionSummary,
    actor,
  });
};

const emitSocialCommentAdded = ({ postId, comment, commentsCount }) => {
  io.emit("social-post-comment-added", {
    postId: String(postId),
    comment,
    commentsCount,
  });
};

const emitSocialPostCreated = ({ post, authorId }) => {
  if (!post) {
    return;
  }

  if (post.privacy === "public") {
    io.emit("social-post-created", { post });
    return;
  }

  if (authorId) {
    io.to(String(authorId)).emit("social-post-created", { post });
  }
};

const emitSocialPostUpdated = ({ post, authorId }) => {
  if (!post) {
    return;
  }

  if (post.privacy === "public") {
    io.emit("social-post-updated", { post });
    return;
  }

  if (authorId) {
    io.to(String(authorId)).emit("social-post-updated", { post });
  }
};

const emitSocialPostDeleted = ({ postId }) => {
  io.emit("social-post-deleted", {
    postId: String(postId),
  });
};

const emitSocialCommentDeleted = ({
  postId,
  commentId,
  deletedCommentIds,
  commentsCount,
}) => {
  io.emit("social-post-comment-deleted", {
    postId: String(postId),
    commentId: String(commentId),
    deletedCommentIds: (Array.isArray(deletedCommentIds)
      ? deletedCommentIds
      : [commentId]
    )
      .map((id) => String(id))
      .filter(Boolean),
    commentsCount,
  });
};

export const createPost = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      caption = "",
      mediaUrls = [],
      tags = [],
      privacy = "public",
    } = req.body;

    const uploadedMediaUrls = await uploadPostMedia(mediaUrls);

    if (!caption.trim() && uploadedMediaUrls.length === 0) {
      return res
        .status(400)
        .json({ message: "Post must have text or media content" });
    }

    const sanitizedTags = Array.isArray(tags)
      ? tags
          .map((tag) =>
            String(tag || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
      : [];

    const post = await Post.create({
      authorId: userId,
      caption: caption.trim(),
      mediaUrls: uploadedMediaUrls,
      tags: [...new Set(sanitizedTags)],
      privacy,
    });

    const payload = toPostPayload(post, userId);
    emitSocialPostCreated({ post: payload, authorId: userId });

    await invalidateCache(`feed:*`);

    return res.status(201).json({ post: payload });
  } catch (error) {
    console.error("[social] createPost error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const editPost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;
    const {
      caption,
      tags,
      privacy,
    } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id" });
    }

    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (String(post.authorId) !== String(userId)) {
      return res.status(403).json({ message: "You cannot edit this post" });
    }

    if (typeof caption === "string") {
      post.caption = caption.trim();
    }

    if (Array.isArray(tags)) {
      const sanitizedTags = tags
        .map((tag) =>
          String(tag || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);
      post.tags = [...new Set(sanitizedTags)];
    }

    if (privacy === "public" || privacy === "followers") {
      post.privacy = privacy;
    }

    const hasMedia = Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0;
    if (!String(post.caption || "").trim() && !hasMedia) {
      return res
        .status(400)
        .json({ message: "Post must have text or media content" });
    }

    await post.save();
    const payload = toPostPayload(post, userId);
    emitSocialPostUpdated({ post: payload, authorId: userId });

    await invalidateCache(`feed:*`);

    return res.status(200).json({ post: payload });
  } catch (error) {
    console.error("[social] editPost error", error);
    return res.status(500).json({ message: "System error" });
  }
};
export const getHomeFeed = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, skip } = normalizePaging(
      req.query.page,
      req.query.limit,
    );
    
    const cacheKey = `feed:home:${userId}:p${page}`;
    const cached = await getCachedData(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const follows = await Follow.find({ followerId: userId }).select(
      "followingId",
    );
    const followingIds = follows.map((item) => item.followingId);

    const authorIds = [...followingIds, userId];

    const [posts, total] = await Promise.all([
      Post.find({
        isDeleted: false,
        authorId: { $in: authorIds },
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("authorId", "displayName username avatarUrl"),
      Post.countDocuments({
        isDeleted: false,
        authorId: { $in: authorIds },
      }),
    ]);

    const viewerFriendIdSet = await getViewerFriendIdSet(userId);
    const visibleReactorsById = await buildVisibleReactorsMap(
      posts,
      userId,
      viewerFriendIdSet,
    );

    const responseData = {
      posts: posts.map((post) =>
        toPostPayload(post, userId, { viewerFriendIdSet, visibleReactorsById }),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: skip + posts.length < total,
      },
    };

    await setCachedData(cacheKey, responseData, 60);

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("[social] getHomeFeed error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const getExploreFeed = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, skip } = normalizePaging(
      req.query.page,
      req.query.limit,
    );

    const cacheKey = `feed:explore:${userId}:p${page}`;
    const cached = await getCachedData(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }
    
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const query = {
      isDeleted: false,
      privacy: "public",
      authorId: { $ne: userId },
      createdAt: { $gte: sevenDaysAgo },
    };

    const [posts, total] = await Promise.all([
      Post.find(query)
        .sort({ likesCount: -1, commentsCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("authorId", "displayName username avatarUrl"),
      Post.countDocuments(query),
    ]);

    const viewerFriendIdSet = await getViewerFriendIdSet(userId);
    const visibleReactorsById = await buildVisibleReactorsMap(
      posts,
      userId,
      viewerFriendIdSet,
    );

    const responseData = {
      posts: posts.map((post) =>
        toPostPayload(post, userId, { viewerFriendIdSet, visibleReactorsById }),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: skip + posts.length < total,
      },
    };

    await setCachedData(cacheKey, responseData, 60);

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("[social] getExploreFeed error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const getPostById = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id" });
    }

    const post = await Post.findById(postId).populate(
      "authorId",
      "displayName username avatarUrl",
    );

    if (!post || post.isDeleted) {
      return res.status(404).json({ message: "Post not found" });
    }

    const authorUserId = post.authorId?._id || post.authorId;
    const access = await resolveProfileAccess(currentUserId, authorUserId);
    const isOwner = String(authorUserId) === String(currentUserId);
    const canViewPost =
      isOwner ||
      post.privacy === "public" ||
      access.canViewProfile ||
      access.isFollowing;

    if (!canViewPost) {
      return res.status(403).json({ message: "You cannot view this post" });
    }

    const viewerFriendIdSet = await getViewerFriendIdSet(currentUserId);
    const visibleReactorsById = await buildVisibleReactorsMap(
      [post],
      currentUserId,
      viewerFriendIdSet,
    );

    return res.status(200).json({
      post: toPostPayload(post, currentUserId, {
        viewerFriendIdSet,
        visibleReactorsById,
      }),
    });
  } catch (error) {
    console.error("[social] getPostById error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const getProfile = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const profileUserId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(profileUserId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const [profile, followerCount, followingCount, postCount, access, friendCount, friendships] =
      await Promise.all([
        User.findById(profileUserId).select(
          "displayName username avatarUrl bio createdAt",
        ),
        Follow.countDocuments({ followingId: profileUserId }),
        Follow.countDocuments({ followerId: profileUserId }),
        Post.countDocuments({ authorId: profileUserId, isDeleted: false }),
        resolveProfileAccess(currentUserId, profileUserId),
        Friend.countDocuments({
          $or: [{ userA: profileUserId }, { userB: profileUserId }],
        }),
        Friend.find({
          $or: [{ userA: profileUserId }, { userB: profileUserId }],
        })
          .sort({ createdAt: -1 })
          .limit(9)
          .populate("userA", "_id displayName username avatarUrl")
          .populate("userB", "_id displayName username avatarUrl")
          .lean(),
      ]);

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    const friendsPreview = access.canViewProfile
      ? friendships
          .map((friendship) => {
            const isUserA =
              String(friendship.userA?._id || friendship.userA) ===
              String(profileUserId);
            const friendUser = isUserA ? friendship.userB : friendship.userA;

            if (!friendUser?._id) {
              return null;
            }

            return {
              _id: friendUser._id,
              displayName: friendUser.displayName,
              username: friendUser.username,
              avatarUrl: friendUser.avatarUrl || null,
            };
          })
          .filter(Boolean)
      : [];

    return res.status(200).json({
      profile: {
        ...profile.toObject(),
        followerCount,
        followingCount,
        postCount,
        friendCount,
        friendsPreview,
        isFollowing: access.isFollowing,
        isFriend: access.isFriend,
        canViewProfile: access.canViewProfile,
      },
    });
  } catch (error) {
    console.error("[social] getProfile error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const getUserPosts = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const profileUserId = req.params.userId;
    const { page, limit, skip } = normalizePaging(
      req.query.page,
      req.query.limit,
    );

    if (!mongoose.Types.ObjectId.isValid(profileUserId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const access = await resolveProfileAccess(currentUserId, profileUserId);

    if (!access.canViewProfile) {
      return res.status(403).json({
        message: "Only friends can view this profile",
        canViewProfile: false,
      });
    }

    const query = {
      authorId: profileUserId,
      isDeleted: false,
    };

    const [posts, total] = await Promise.all([
      Post.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("authorId", "displayName username avatarUrl"),
      Post.countDocuments(query),
    ]);

    const viewerFriendIdSet = await getViewerFriendIdSet(currentUserId);
    const visibleReactorsById = await buildVisibleReactorsMap(
      posts,
      currentUserId,
      viewerFriendIdSet,
    );

    return res.status(200).json({
      posts: posts.map((post) =>
        toPostPayload(post, currentUserId, {
          viewerFriendIdSet,
          visibleReactorsById,
        }),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: skip + posts.length < total,
      },
    });
  } catch (error) {
    console.error("[social] getUserPosts error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const getPostEngagement = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const currentUsername = String(req.user.username || "").toLowerCase();
    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id" });
    }

    const post = await Post.findById(postId).populate(
      "authorId",
      "displayName username avatarUrl",
    );
    if (!post || post.isDeleted) {
      return res.status(404).json({ message: "Post not found" });
    }

    const authorUserId = post.authorId?._id || post.authorId;
    const authorUsername = String(post.authorId?.username || "").toLowerCase();
    const isOwnerById = String(authorUserId) === String(currentUserId);
    const isOwnerByUsername =
      Boolean(currentUsername) &&
      Boolean(authorUsername) &&
      currentUsername === authorUsername;
    const isOwner = isOwnerById || isOwnerByUsername;

    const access = await resolveProfileAccess(currentUserId, authorUserId);
    const canViewPost =
      isOwner ||
      post.privacy === "public" ||
      access.canViewProfile ||
      access.isFollowing;

    if (!canViewPost) {
      return res.status(403).json({ message: "You cannot view this post" });
    }

    const normalizedReactions = Array.isArray(post.reactions)
      ? post.reactions
      : Array.isArray(post.likes)
        ? post.likes.map((userId) => ({ userId, type: "like" }))
        : [];

    const reactorIds = [...new Set(normalizedReactions.map((reaction) => String(reaction.userId)))];
    const [reactors, comments] = await Promise.all([
      User.find({ _id: { $in: reactorIds } })
        .select("displayName username avatarUrl")
        .limit(50)
        .lean(),
      Comment.find({ postId, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("authorId", "displayName username avatarUrl"),
    ]);

    const uniqueCommenters = [];
    const seenCommenters = new Set();

    for (const comment of comments) {
      const author = comment.authorId;
      const authorId = String(author?._id || "");

      if (!author || !authorId || seenCommenters.has(authorId)) {
        continue;
      }

      seenCommenters.add(authorId);
      uniqueCommenters.push(author);

      if (uniqueCommenters.length >= 50) {
        break;
      }
    }

    const reactionBreakdown = SUPPORTED_REACTION_TYPES.reduce((acc, reactionType) => {
      acc[reactionType] = 0;
      return acc;
    }, {});

    normalizedReactions.forEach((reaction) => {
      const reactionType = normalizeReactionType(reaction?.type);
      reactionBreakdown[reactionType] += 1;
    });

    return res.status(200).json({
      likers: reactors,
      commenters: uniqueCommenters,
      reactionBreakdown,
      recentComments: comments.slice(0, 30).map((comment) => ({
        _id: comment._id,
        content: comment.content,
        createdAt: comment.createdAt,
        authorId: comment.authorId,
      })),
    });
  } catch (error) {
    console.error("[social] getPostEngagement error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const toggleLikePost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id" });
    }

    const nextReactionType = normalizeReactionType(req.body?.reaction || "like");
    let updateOutcome = null;
    try {
      updateOutcome = await updatePostReactionWithCAS({
        postId,
        userId,
        nextReactionType,
      });
    } catch (conflictError) {
      if (String(conflictError?.message || "").includes("RETRY_CONFLICT")) {
        return res.status(409).json({
          message: "Reaction update conflict, please retry",
        });
      }

      throw conflictError;
    }

    if (!updateOutcome) {
      return res.status(404).json({ message: "Post not found" });
    }

    const {
      authorId,
      reactions,
      likesCount,
      finalReactionType,
      isNewReactionAdded,
    } = updateOutcome;

    if (isNewReactionAdded) {
      const reactionMessage =
        finalReactionType && finalReactionType !== "like"
          ? "reacted to your post"
          : "liked your post";

      await createAndEmitNotification({
        recipientId: authorId,
        actorId: userId,
        type: "like",
        postId,
        message: reactionMessage,
      });
    }

    const actor = await User.findById(userId)
      .select("_id displayName username avatarUrl")
      .lean();

    const reactionSummary = buildReactionSummary(reactions || []);

    emitSocialLikeUpdated({
      postId,
      likesCount,
      liked: finalReactionType,
      reactionSummary,
    });

    await invalidateCache(`feed:*`);

    return res.status(200).json({
      liked: Boolean(finalReactionType),
      ownReaction: finalReactionType,
      likesCount,
      reactionSummary,
      postId,
    });
  } catch (error) {
    console.error("[social] toggleLikePost error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const addComment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;
    const { content, parentCommentId = null } = req.body;

    if (!content || !String(content).trim()) {
      return res.status(400).json({ message: "Comment content is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id" });
    }

    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      return res.status(404).json({ message: "Post not found" });
    }

    let validatedParentCommentId = null;
    if (parentCommentId) {
      if (!mongoose.Types.ObjectId.isValid(parentCommentId)) {
        return res.status(400).json({ message: "Invalid parent comment id" });
      }

      const parentComment = await Comment.findOne({
        _id: parentCommentId,
        postId,
        isDeleted: false,
      })
        .select("_id")
        .lean();

      if (!parentComment) {
        return res.status(400).json({ message: "Parent comment is invalid" });
      }

      validatedParentCommentId = parentComment._id;
    }

    const comment = await Comment.create({
      postId,
      authorId: userId,
      parentCommentId: validatedParentCommentId,
      content: String(content).trim(),
    });

    post.commentsCount += 1;
    await post.save();

    await comment.populate("authorId", "displayName username avatarUrl");

    emitSocialCommentAdded({
      postId: post._id,
      comment,
      commentsCount: post.commentsCount,
    });

    const commentPreview = String(comment.content || "").trim();
    const compactPreview =
      commentPreview.length > 80
        ? `${commentPreview.slice(0, 80)}...`
        : commentPreview;

    await createAndEmitNotification({
      recipientId: post.authorId,
      actorId: userId,
      type: "comment",
      postId: post._id,
      commentId: comment._id,
      message: compactPreview
        ? `commented: "${compactPreview}"`
        : "commented on your post",
    });

    await invalidateCache(`feed:*`);

    return res.status(201).json({ comment });
  } catch (error) {
    console.error("[social] addComment error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId, commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id" });
    }

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ message: "Invalid comment id" });
    }

    const [post, comment] = await Promise.all([
      Post.findById(postId).select("_id authorId commentsCount isDeleted"),
      Comment.findById(commentId).select(
        "_id postId authorId parentCommentId isDeleted imgUrl",
      ),
    ]);

    if (!post || post.isDeleted) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (!comment || String(comment.postId) !== String(postId)) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const canDelete =
      String(comment.authorId) === String(userId) ||
      String(post.authorId) === String(userId);

    if (!canDelete) {
      return res.status(403).json({ message: "You cannot delete this comment" });
    }

    const descendantIds = await collectCommentDescendantIds(comment._id);
    const allAffectedCommentIds = [...new Set([commentId, ...descendantIds])];

    // Enterprise Fire-and-Forget: Lấy danh sách URL ảnh để dọn rác nền, không chạy bằng await tuần tự 
    // chặn HTTP response
    const commentsToDelete = await Comment.find({ _id: { $in: allAffectedCommentIds }, isDeleted: false }).select("imgUrl");
    const imageUrlsToDestroy = commentsToDelete.map(c => c.imgUrl).filter(Boolean);

    const [deletionOutcome] = await Promise.all([
      Comment.updateMany(
        {
          _id: { $in: descendantIds },
          postId,
          isDeleted: false,
        },
        { $set: { isDeleted: true } },
      ),
      // Cascade-delete notifications for all affected comments to eliminate
      // Zombie Notifications that link to now-deleted comment threads.
      Notification.deleteMany({ commentId: { $in: allAffectedCommentIds } }),
    ]);

    const deletedCount = deletionOutcome.modifiedCount || 0;
    if (deletedCount > 0) {
      await Post.updateOne(
        { _id: postId },
        {
          $set: {
            commentsCount: Math.max(0, (post.commentsCount || 0) - deletedCount),
          },
        },
      );

      emitSocialCommentDeleted({
        postId,
        commentId,
        deletedCommentIds: descendantIds,
        commentsCount: Math.max(0, (post.commentsCount || 0) - deletedCount),
      });
    }

    // Background Garbage Collection
    if (imageUrlsToDestroy.length > 0) {
      Promise.allSettled(imageUrlsToDestroy.map(url => destroyImageFromUrl(url)))
        .catch(err => console.error("[social] Cloudinary background destroy error:", err));
    }

    await invalidateCache(`feed:*`);

    return res.status(200).json({
      ok: true,
      postId,
      commentId,
      deletedCount,
    });
  } catch (error) {
    console.error("[social] deleteComment error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const deletePost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id" });
    }

    const post = await Post.findById(postId).select(
      "_id authorId isDeleted commentsCount media",
    );

    if (!post || post.isDeleted) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (String(post.authorId) !== String(userId)) {
      return res.status(403).json({ message: "You cannot delete this post" });
    }

    // Enterprise Fire-and-Forget: Thu thập tất cả Image URLs để dọn rác nền
    const imageUrlsToDestroy = [];

    if (post.media && post.media.length > 0) {
      post.media.forEach(m => {
        if (m.url) imageUrlsToDestroy.push(m.url);
      });
    }

    const commentsToDelete = await Comment.find({ postId, isDeleted: false }).select("imgUrl");
    commentsToDelete.forEach(c => {
      if (c.imgUrl) imageUrlsToDestroy.push(c.imgUrl);
    });

    await Promise.all([
      Post.updateOne(
        { _id: postId, isDeleted: false },
        {
          $set: {
            isDeleted: true,
            commentsCount: 0,
            likesCount: 0,
            reactions: [],
            likes: [],
          },
        },
      ),
      Comment.updateMany(
        { postId, isDeleted: false },
        { $set: { isDeleted: true } },
      ),
      // Cascade-delete all notifications tied to this post so stale
      // notifications (Zombie Notifications) don't remain for other users.
      Notification.deleteMany({ postId }),
    ]);

    emitSocialPostDeleted({ postId });

    // Background Garbage Collection
    if (imageUrlsToDestroy.length > 0) {
      Promise.allSettled(imageUrlsToDestroy.map(url => destroyImageFromUrl(url)))
        .catch(err => console.error("[social] Cloudinary background destroy error:", err));
    }

    await invalidateCache(`feed:*`);

    return res.status(200).json({
      ok: true,
      postId,
    });
  } catch (error) {
    console.error("[social] deletePost error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const getCommentsByPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const sortMode = String(req.query.sort || "relevant").toLowerCase();
    const { page, limit, skip } = normalizePaging(
      req.query.page,
      req.query.limit,
    );

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id" });
    }

    const query = {
      postId,
      isDeleted: false,
    };

    const post = await Post.findById(postId).select("authorId").lean();
    const postAuthorId = String(post?.authorId || "");

    const sortByNewest = { createdAt: -1 };
    const sortByRelevant = { createdAt: -1, _id: -1 };

    let comments = [];
    let total = 0;

    if (sortMode === "newest") {
      [comments, total] = await Promise.all([
        Comment.find(query)
          .sort(sortByNewest)
          .skip(skip)
          .limit(limit)
          .populate("authorId", "displayName username avatarUrl"),
        Comment.countDocuments(query),
      ]);
    } else {
      const postAuthorObjectId = mongoose.Types.ObjectId.isValid(postAuthorId)
        ? new mongoose.Types.ObjectId(postAuthorId)
        : null;

      const relevantComments = await Comment.aggregate([
        { $match: { postId: new mongoose.Types.ObjectId(postId), isDeleted: false } },
        {
          $addFields: {
            isAuthorComment: postAuthorObjectId
              ? {
                  $cond: [
                    { $eq: ["$authorId", postAuthorObjectId] },
                    1,
                    0,
                  ],
                }
              : 0,
          },
        },
        { $sort: { isAuthorComment: -1, ...sortByRelevant } },
        { $skip: skip },
        { $limit: limit },
      ]);

      comments = await Comment.populate(relevantComments, {
        path: "authorId",
        select: "displayName username avatarUrl",
      });
      total = await Comment.countDocuments(query);
    }

    return res.status(200).json({
      comments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: skip + comments.length < total,
      },
    });
  } catch (error) {
    console.error("[social] getCommentsByPost error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const toggleFollowUser = async (req, res) => {
  try {
    const followerId = req.user._id;
    const followingId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(followingId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    if (String(followerId) === String(followingId)) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    const exists = await Follow.findOne({ followerId, followingId });

    if (exists) {
      await Follow.deleteOne({ _id: exists._id });
      return res.status(200).json({ following: false });
    }

    await Follow.create({ followerId, followingId });

    await createAndEmitNotification({
      recipientId: followingId,
      actorId: followerId,
      type: "follow",
      message: "started following you",
    });

    return res.status(200).json({ following: true });
  } catch (error) {
    console.error("[social] toggleFollowUser error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, skip } = normalizePaging(
      req.query.page,
      req.query.limit,
    );

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ recipientId: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("actorId", "displayName username avatarUrl"),
      Notification.countDocuments({ recipientId: userId }),
      Notification.countDocuments({ recipientId: userId, isRead: false }),
    ]);

    return res.status(200).json({
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: skip + notifications.length < total,
      },
    });
  } catch (error) {
    console.error("[social] getNotifications error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { notificationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: "Invalid notification id" });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        recipientId: userId,
      },
      {
        $set: { isRead: true },
      },
      {
        new: true,
      },
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({ notification });
  } catch (error) {
    console.error("[social] markNotificationRead error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { recipientId: userId, isRead: false },
      { $set: { isRead: true } },
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[social] markAllNotificationsRead error", error);
    return res.status(500).json({ message: "System error" });
  }
};
