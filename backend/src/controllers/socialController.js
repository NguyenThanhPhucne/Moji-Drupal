import mongoose from "mongoose";
import User from "../models/User.js";
import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import Follow from "../models/Follow.js";
import Friend from "../models/Friend.js";
import Notification from "../models/Notification.js";
import { io } from "../socket/index.js";

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

const toPostPayload = (post, currentUserId) => {
  const postObject = post.toObject ? post.toObject() : post;
  const likes = (postObject.likes || []).map(String);

  return {
    ...postObject,
    isLiked: likes.includes(String(currentUserId)),
    likes: undefined,
  };
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

export const createPost = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      caption = "",
      mediaUrls = [],
      tags = [],
      privacy = "public",
    } = req.body;

    if (
      !caption.trim() &&
      (!Array.isArray(mediaUrls) || mediaUrls.length === 0)
    ) {
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
      mediaUrls: Array.isArray(mediaUrls) ? mediaUrls.slice(0, 10) : [],
      tags: [...new Set(sanitizedTags)],
      privacy,
    });

    await post.populate("authorId", "displayName username avatarUrl");

    return res.status(201).json({ post: toPostPayload(post, userId) });
  } catch (error) {
    console.error("[social] createPost error", error);
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

    return res.status(200).json({
      posts: posts.map((post) => toPostPayload(post, userId)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: skip + posts.length < total,
      },
    });
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

    return res.status(200).json({
      posts: posts.map((post) => toPostPayload(post, userId)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: skip + posts.length < total,
      },
    });
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

    return res.status(200).json({
      post: toPostPayload(post, currentUserId),
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

    const [profile, followerCount, followingCount, postCount, access] =
      await Promise.all([
        User.findById(profileUserId).select(
          "displayName username avatarUrl bio createdAt",
        ),
        Follow.countDocuments({ followingId: profileUserId }),
        Follow.countDocuments({ followerId: profileUserId }),
        Post.countDocuments({ authorId: profileUserId, isDeleted: false }),
        resolveProfileAccess(currentUserId, profileUserId),
      ]);

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    return res.status(200).json({
      profile: {
        ...profile.toObject(),
        followerCount,
        followingCount,
        postCount,
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

    return res.status(200).json({
      posts: posts.map((post) => toPostPayload(post, currentUserId)),
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

    const [likers, comments] = await Promise.all([
      User.find({ _id: { $in: post.likes || [] } })
        .select("displayName username avatarUrl")
        .limit(50),
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

    return res.status(200).json({
      likers,
      commenters: uniqueCommenters,
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

    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      return res.status(404).json({ message: "Post not found" });
    }

    const alreadyLiked = post.likes.some(
      (item) => String(item) === String(userId),
    );

    if (alreadyLiked) {
      post.likes = post.likes.filter((item) => String(item) !== String(userId));
    } else {
      post.likes.push(userId);

      await createAndEmitNotification({
        recipientId: post.authorId,
        actorId: userId,
        type: "like",
        postId: post._id,
        message: "liked your post",
      });
    }

    post.likesCount = post.likes.length;
    await post.save();

    return res.status(200).json({
      liked: !alreadyLiked,
      likesCount: post.likesCount,
      postId: post._id,
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

    const comment = await Comment.create({
      postId,
      authorId: userId,
      parentCommentId: parentCommentId || null,
      content: String(content).trim(),
    });

    post.commentsCount += 1;
    await post.save();

    await comment.populate("authorId", "displayName username avatarUrl");

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

    return res.status(201).json({ comment });
  } catch (error) {
    console.error("[social] addComment error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const getCommentsByPost = async (req, res) => {
  try {
    const { postId } = req.params;
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

    const [comments, total] = await Promise.all([
      Comment.find(query)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate("authorId", "displayName username avatarUrl"),
      Comment.countDocuments(query),
    ]);

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
