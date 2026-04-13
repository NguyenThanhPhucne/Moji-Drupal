import Bookmark from "../models/Bookmark.js";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";

const normalizeStringList = ({
  value,
  maxItems,
  maxLength,
  toLowerCase = false,
}) => {
  const list = Array.isArray(value) ? value : [];

  return [
    ...new Set(
      list
        .map((item) => {
          const normalized = String(item || "").trim();
          if (!normalized) {
            return "";
          }

          const trimmed = normalized.slice(0, maxLength);
          return toLowerCase ? trimmed.toLowerCase() : trimmed;
        })
        .filter(Boolean),
    ),
  ].slice(0, maxItems);
};

const ensureConversationMembership = async (conversationId, userId) => {
  const membership = await Conversation.exists({
    _id: conversationId,
    "participants.userId": userId,
  });

  return Boolean(membership);
};

const ORPHAN_BOOKMARK_CLEANUP_BATCH_SIZE = 1000;

const resolveBookmarkMatchQuery = (query) => {
  try {
    if (typeof Bookmark.castObject === "function") {
      return Bookmark.castObject(query);
    }
  } catch {
    // Fallback to the original query when casting fails.
  }

  return query;
};

const findOrphanBookmarkIdsForQuery = async (query) => {
  const rows = await Bookmark.aggregate([
    { $match: query },
    {
      $lookup: {
        from: "messages",
        localField: "messageId",
        foreignField: "_id",
        as: "_messageRef",
      },
    },
    {
      $lookup: {
        from: "conversations",
        localField: "conversationId",
        foreignField: "_id",
        as: "_conversationRef",
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $size: "$_messageRef" }, 0] },
            { $eq: [{ $size: "$_conversationRef" }, 0] },
          ],
        },
      },
    },
    { $project: { _id: 1 } },
  ]);

  return rows.map((row) => row?._id).filter(Boolean);
};

const cleanupOrphanBookmarks = async ({ userId, bookmarkIds }) => {
  if (!Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
    return;
  }

  for (let index = 0; index < bookmarkIds.length; index += ORPHAN_BOOKMARK_CLEANUP_BATCH_SIZE) {
    const chunk = bookmarkIds.slice(
      index,
      index + ORPHAN_BOOKMARK_CLEANUP_BATCH_SIZE,
    );

    await Bookmark.deleteMany({
      _id: { $in: chunk },
      userId,
    });
  }
};

export const toggleBookmark = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;
    const note = String(req.body?.note || "").trim();
    const tags = normalizeStringList({
      value: req.body?.tags,
      maxItems: 10,
      maxLength: 30,
      toLowerCase: true,
    });
    const collections = normalizeStringList({
      value: req.body?.collections,
      maxItems: 10,
      maxLength: 40,
      toLowerCase: true,
    });

    const message = await Message.findById(messageId).select(
      "_id conversationId senderId content imgUrl createdAt isDeleted",
    );

    if (!message) {
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });
    }

    if (message.isDeleted) {
      return res.status(400).json({ message: "Không thể lưu tin nhắn đã bị gỡ" });
    }

    const isMember = await ensureConversationMembership(
      message.conversationId,
      userId,
    );

    if (!isMember) {
      return res.status(403).json({ message: "Không có quyền thao tác" });
    }

    const existing = await Bookmark.findOne({
      userId,
      messageId,
    });

    if (existing) {
      await Bookmark.findByIdAndDelete(existing._id);
      return res.status(200).json({
        bookmarked: false,
        messageId: message._id,
      });
    }

    const bookmark = await Bookmark.create({
      userId,
      messageId: message._id,
      conversationId: message.conversationId,
      note,
      tags,
      collections,
    });

    return res.status(201).json({
      bookmarked: true,
      messageId: message._id,
      bookmark,
    });
  } catch (error) {
    console.error("Lỗi khi lưu bookmark", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getBookmarks = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      conversationId,
      collection,
      from,
      to,
      page: pageRaw,
      limit: limitRaw,
    } = req.query;
    const page = Math.max(1, Number.parseInt(String(pageRaw || "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(String(limitRaw || "30"), 10) || 30),
    );

    const query = { userId };

    if (conversationId) {
      query.conversationId = conversationId;
    }

    const normalizedCollection = String(collection || "")
      .trim()
      .toLowerCase();
    if (normalizedCollection) {
      query.collections = normalizedCollection;
    }

    if (from || to) {
      query.createdAt = {};
      if (from) {
        query.createdAt.$gte = new Date(from);
      }
      if (to) {
        query.createdAt.$lte = new Date(to);
      }
    }

    const matchQuery = resolveBookmarkMatchQuery(query);
    const orphanBookmarkIds = await findOrphanBookmarkIdsForQuery(matchQuery);

    if (orphanBookmarkIds.length > 0) {
      // Deep auto-heal on the full filtered dataset, not only the current page.
      await cleanupOrphanBookmarks({ userId, bookmarkIds: orphanBookmarkIds });
    }

    const sanitizedQuery =
      orphanBookmarkIds.length > 0
        ? {
            ...matchQuery,
            _id: { $nin: orphanBookmarkIds },
          }
        : matchQuery;

    const [bookmarks, total] = await Promise.all([
      Bookmark.find(sanitizedQuery)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate({
          path: "messageId",
          select:
            "_id conversationId senderId content imgUrl createdAt isDeleted",
        })
        .populate({
          path: "conversationId",
          select: "_id type group participants",
          populate: {
            path: "participants.userId",
            select: "_id displayName avatarUrl",
          },
        })
        .lean(),
      Bookmark.countDocuments(sanitizedQuery),
    ]);

    const filtered = bookmarks.filter(
      (item) => item.messageId && item.conversationId,
    );

    const normalized = filtered.map((item) => {
      const participants = (item.conversationId.participants || []).map(
        (participant) => ({
          _id:
            participant.userId?._id?.toString?.() ||
            participant.userId?.toString?.() ||
            "",
          displayName: participant.userId?.displayName,
          avatarUrl: participant.userId?.avatarUrl ?? null,
          joinedAt: participant.joinedAt,
        }),
      );

      return {
        ...item,
        conversationId: {
          ...item.conversationId,
          participants,
        },
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.status(200).json({
      bookmarks: normalized,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy bookmarks", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateBookmarkMeta = async (req, res) => {
  try {
    const userId = req.user._id;
    const { bookmarkId } = req.params;

    const updates = {};

    if (req.body?.note !== undefined) {
      updates.note = String(req.body?.note || "")
        .trim()
        .slice(0, 500);
    }

    if (req.body?.tags !== undefined) {
      updates.tags = normalizeStringList({
        value: req.body?.tags,
        maxItems: 10,
        maxLength: 30,
        toLowerCase: true,
      });
    }

    if (req.body?.collections !== undefined) {
      updates.collections = normalizeStringList({
        value: req.body?.collections,
        maxItems: 10,
        maxLength: 40,
        toLowerCase: true,
      });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Không có metadata để cập nhật" });
    }

    const bookmark = await Bookmark.findOneAndUpdate(
      {
        _id: bookmarkId,
        userId,
      },
      {
        $set: updates,
      },
      { new: true },
    ).lean();

    if (!bookmark) {
      return res.status(404).json({ message: "Không tìm thấy bookmark" });
    }

    return res.status(200).json({ bookmark });
  } catch (error) {
    console.error("Lỗi khi cập nhật bookmark metadata", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const bulkBookmarkAction = async (req, res) => {
  try {
    const userId = req.user._id;
    const { bookmarkIds, action, tag, collection } = req.body || {};

    if (!Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
      return res.status(400).json({ message: "Thiếu danh sách bookmark" });
    }

    let result = null;

    if (action === "remove-tag") {
      const normalizedTag = String(tag || "")
        .trim()
        .toLowerCase();
      if (!normalizedTag) {
        return res.status(400).json({ message: "Thiếu tag để xoá" });
      }

      result = await Bookmark.updateMany(
        {
          _id: { $in: bookmarkIds },
          userId,
        },
        {
          $pull: { tags: normalizedTag },
        },
      );
    } else if (action === "remove-collection") {
      const normalizedCollection = String(collection || "")
        .trim()
        .toLowerCase();
      if (!normalizedCollection) {
        return res.status(400).json({ message: "Thiếu collection để xoá" });
      }

      result = await Bookmark.updateMany(
        {
          _id: { $in: bookmarkIds },
          userId,
        },
        {
          $pull: { collections: normalizedCollection },
        },
      );
    } else {
      return res.status(400).json({ message: "Hành động không hợp lệ" });
    }

    return res.status(200).json({
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error("Lỗi khi thao tác bookmark hàng loạt", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
