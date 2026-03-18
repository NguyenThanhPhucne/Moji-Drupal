import Bookmark from "../models/Bookmark.js";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";

const ensureConversationMembership = async (conversationId, userId) => {
  const membership = await Conversation.exists({
    _id: conversationId,
    "participants.userId": userId,
  });

  return Boolean(membership);
};

export const toggleBookmark = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;
    const note = String(req.body?.note || "").trim();
    const incomingTags = Array.isArray(req.body?.tags) ? req.body.tags : [];
    const tags = [
      ...new Set(
        incomingTags
          .map((tag) =>
            String(tag || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ].slice(0, 10);

    const message = await Message.findById(messageId).select(
      "_id conversationId senderId content imgUrl createdAt",
    );

    if (!message) {
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });
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

    if (from || to) {
      query.createdAt = {};
      if (from) {
        query.createdAt.$gte = new Date(from);
      }
      if (to) {
        query.createdAt.$lte = new Date(to);
      }
    }

    const [bookmarks, total] = await Promise.all([
      Bookmark.find(query)
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
      Bookmark.countDocuments(query),
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

    const note = String(req.body?.note || "")
      .trim()
      .slice(0, 500);
    const incomingTags = Array.isArray(req.body?.tags) ? req.body.tags : [];
    const tags = [
      ...new Set(
        incomingTags
          .map((tag) =>
            String(tag || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ].slice(0, 10);

    const bookmark = await Bookmark.findOneAndUpdate(
      {
        _id: bookmarkId,
        userId,
      },
      {
        $set: {
          note,
          tags,
        },
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
    const { bookmarkIds, action, tag } = req.body || {};

    if (!Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
      return res.status(400).json({ message: "Thiếu danh sách bookmark" });
    }

    if (action !== "remove-tag") {
      return res.status(400).json({ message: "Hành động không hợp lệ" });
    }

    const normalizedTag = String(tag || "")
      .trim()
      .toLowerCase();
    if (!normalizedTag) {
      return res.status(400).json({ message: "Thiếu tag để xoá" });
    }

    const result = await Bookmark.updateMany(
      {
        _id: { $in: bookmarkIds },
        userId,
      },
      {
        $pull: { tags: normalizedTag },
      },
    );

    return res.status(200).json({
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error("Lỗi khi thao tác bookmark hàng loạt", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
