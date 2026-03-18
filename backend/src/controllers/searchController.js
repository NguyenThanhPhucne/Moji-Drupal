import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

const normalize = (value) =>
  String(value || "")
    .trim()
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const levenshteinDistance = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
};

const tokenize = (text) => normalize(text).split(/\s+/).filter(Boolean);

const typoScore = (source, query) => {
  const sourceTokens = tokenize(source);
  const queryTokens = tokenize(query);

  if (sourceTokens.length === 0 || queryTokens.length === 0) {
    return 0;
  }

  let total = 0;

  for (const queryToken of queryTokens) {
    let bestDistance = Infinity;
    for (const sourceToken of sourceTokens) {
      const distance = levenshteinDistance(sourceToken, queryToken);
      if (distance < bestDistance) {
        bestDistance = distance;
      }
    }

    const maxAllowed = queryToken.length <= 4 ? 1 : 2;
    if (bestDistance <= maxAllowed) {
      total += (maxAllowed - bestDistance + 1) * 8;
    }
  }

  return total;
};

const baseTextScore = (text, query) => {
  const source = normalize(text);
  const q = normalize(query);
  if (!source || !q) return 0;
  if (source === q) return 120;
  if (source.startsWith(q)) return 90;
  if (source.includes(q)) return 60;
  return typoScore(source, q);
};

const recencyScore = (dateValue, weight = 30, halfLifeDays = 14) => {
  if (!dateValue) return 0;

  const ageMs = Date.now() - new Date(dateValue).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return weight;

  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return weight * Math.exp(-ageDays / halfLifeDays);
};

const scoreText = (text, query) => {
  return baseTextScore(text, query);
};

export const globalSearch = async (req, res) => {
  try {
    const userId = req.user._id;
    const q = String(req.query.q || "").trim();

    if (q.length < 2) {
      return res.status(200).json({ people: [], groups: [], messages: [] });
    }

    const conversations = await Conversation.find({
      "participants.userId": userId,
    })
      .select("_id type group participants updatedAt")
      .populate("participants.userId", "_id displayName username avatarUrl")
      .lean();

    const conversationIds = conversations.map((c) => c._id);

    const candidateUserIds = conversations
      .flatMap((conversation) =>
        conversation.participants.map((participant) =>
          String(participant.userId?._id || ""),
        ),
      )
      .filter(Boolean);

    const [usersFromDb, regexUsersFromDb, messagesFromDb, usersLastMessages] =
      await Promise.all([
        User.find({ _id: { $in: candidateUserIds } })
          .select("_id displayName username avatarUrl bio updatedAt")
          .lean(),
        User.find({
          $or: [
            { displayName: { $regex: q, $options: "i" } },
            { username: { $regex: q, $options: "i" } },
          ],
        })
          .select("_id displayName username avatarUrl bio updatedAt")
          .limit(80)
          .lean(),
        Message.find({
          conversationId: { $in: conversationIds },
          isDeleted: { $ne: true },
        })
          .sort({ createdAt: -1 })
          .limit(400)
          .populate("senderId", "_id displayName")
          .lean(),
        Message.aggregate([
          {
            $match: {
              senderId: {
                $in: conversations
                  .flatMap((c) => c.participants.map((p) => p.userId?._id))
                  .filter(Boolean),
              },
            },
          },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: "$senderId",
              lastActiveAt: { $first: "$createdAt" },
            },
          },
        ]),
      ]);

    const lastActiveMap = new Map(
      usersLastMessages.map((item) => [String(item._id), item.lastActiveAt]),
    );

    const directConversationsByUserId = new Map();
    for (const convo of conversations) {
      if (convo.type !== "direct") continue;
      const partner = convo.participants
        .map((p) => p.userId)
        .find((u) => String(u?._id) !== String(userId));
      if (partner?._id) {
        directConversationsByUserId.set(String(partner._id), String(convo._id));
      }
    }

    const groupItems = conversations
      .filter((conversation) => conversation.type === "group")
      .map((conversation) => {
        const groupName = conversation.group?.name || "Untitled group";
        const score = scoreText(groupName, q);
        return {
          conversationId: String(conversation._id),
          name: groupName,
          membersCount: conversation.participants.length,
          score,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const mergedUsersMap = new Map();
    [...usersFromDb, ...regexUsersFromDb].forEach((userItem) => {
      mergedUsersMap.set(String(userItem._id), userItem);
    });

    const peopleItems = Array.from(mergedUsersMap.values())
      .filter((u) => String(u._id) !== String(userId))
      .map((u) => {
        const mutualGroups = conversations.filter(
          (conversation) =>
            conversation.type === "group" &&
            conversation.participants.some(
              (participant) =>
                String(participant.userId?._id) === String(u._id),
            ),
        );

        const displayNameScore = scoreText(u.displayName, q) * 1.4;
        const usernameScore = scoreText(u.username, q) * 1.2;
        const typoBoost = typoScore(`${u.displayName} ${u.username}`, q);
        const freshness = recencyScore(
          lastActiveMap.get(String(u._id)) || u.updatedAt,
          24,
          21,
        );

        return {
          _id: String(u._id),
          displayName: u.displayName,
          username: u.username,
          avatarUrl: u.avatarUrl || null,
          bio: u.bio || "",
          lastActiveAt: lastActiveMap.get(String(u._id)) || u.updatedAt || null,
          mutualGroupsCount: mutualGroups.length,
          conversationId:
            directConversationsByUserId.get(String(u._id)) || null,
          score: Math.round(
            displayNameScore +
              usernameScore +
              typoBoost +
              mutualGroups.length * 5 +
              freshness,
          ),
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const messageItems = messagesFromDb
      .map((item) => {
        const contentScore = scoreText(item.content, q) * 1.2;
        const senderScore = scoreText(item.senderId?.displayName, q) * 0.4;
        const typoBoost = typoScore(item.content, q);
        const freshness = recencyScore(item.createdAt, 16, 10);

        return {
          messageId: String(item._id),
          conversationId: String(item.conversationId),
          content: item.content,
          createdAt: item.createdAt,
          senderId: String(item.senderId?._id || ""),
          senderName: item.senderId?.displayName || "Unknown",
          score: Math.round(contentScore + senderScore + typoBoost + freshness),
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);

    const groupItemsWeighted = groupItems
      .map((item) => {
        const base = scoreText(item.name, q) * 1.3;
        const typoBoost = typoScore(item.name, q);
        const freshnessConvo = conversations.find(
          (conversation) => String(conversation._id) === item.conversationId,
        );
        const freshness = recencyScore(freshnessConvo?.updatedAt, 12, 20);

        return {
          ...item,
          score: Math.round(
            base + typoBoost + item.membersCount * 0.6 + freshness,
          ),
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    return res.status(200).json({
      people: peopleItems,
      groups: groupItemsWeighted,
      messages: messageItems,
    });
  } catch (error) {
    console.error("Lỗi khi tìm kiếm toàn cục", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
