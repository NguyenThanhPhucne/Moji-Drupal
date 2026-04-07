import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const shouldFix = process.argv.includes("--fix");

const isLegacyConversationIndex = (index) => {
  const key = index?.key || {};
  return key["participant.userId"] === 1 && key.lastMessageAt === -1;
};

const countMissingRefByLookup = async ({
  collection,
  field,
  targetCollection,
  extraMatch = {},
  unwind = null,
}) => {
  const pipeline = [
    { $match: extraMatch },
    ...(unwind
      ? [
          {
            $unwind: {
              path: unwind,
              preserveNullAndEmptyArrays: false,
            },
          },
        ]
      : []),
    {
      $match: {
        [field]: { $type: "objectId" },
      },
    },
    {
      $lookup: {
        from: targetCollection,
        localField: field,
        foreignField: "_id",
        as: "_ref",
      },
    },
    {
      $match: {
        "_ref.0": { $exists: false },
      },
    },
    { $count: "count" },
  ];

  const result = await collection.aggregate(pipeline).toArray();
  return result[0]?.count ?? 0;
};

const run = async () => {
  const uri = process.env.MONGODB_CONNECTIONSTRING;
  if (!uri) {
    throw new Error("Missing MONGODB_CONNECTIONSTRING");
  }

  await mongoose.connect(uri);

  try {
    const db = mongoose.connection.db;

    const userCollection = db.collection("users");
    const conversationCollection = db.collection("conversations");
    const messageCollection = db.collection("messages");
    const sessionCollection = db.collection("sessions");
    const friendCollection = db.collection("friends");
    const friendRequestCollection = db.collection("friendrequests");
    const notificationCollection = db.collection("notifications");
    const postCollection = db.collection("posts");
    const commentCollection = db.collection("comments");

    const counts = {
      users: await userCollection.countDocuments(),
      conversations: await conversationCollection.countDocuments(),
      messages: await messageCollection.countDocuments(),
      sessions: await sessionCollection.countDocuments(),
      friends: await friendCollection.countDocuments(),
      friendRequests: await friendRequestCollection.countDocuments(),
      notifications: await notificationCollection.countDocuments(),
      posts: await postCollection.countDocuments(),
      comments: await commentCollection.countDocuments(),
    };

    const sessionExpiredCount = await sessionCollection.countDocuments({
      expiresAt: { $lt: new Date() },
    });

    const originalConvoIndexes = await conversationCollection.indexes();
    const legacyConversationIndexes = originalConvoIndexes.filter(
      isLegacyConversationIndex,
    );

    const fixesApplied = [];

    if (shouldFix && legacyConversationIndexes.length > 0) {
      for (const index of legacyConversationIndexes) {
        await conversationCollection.dropIndex(index.name);
        fixesApplied.push(`Dropped legacy conversation index: ${index.name}`);
      }
    }

    const convoIndexes = await conversationCollection.indexes();
    const messageIndexes = await messageCollection.indexes();
    const sessionIndexes = await sessionCollection.indexes();

    const convoIndexKeys = convoIndexes.map((x) => x.key);
    const messageIndexKeys = messageIndexes.map((x) => x.key);
    const sessionIndexKeys = sessionIndexes.map((x) => x.key);

    const sampleDirectDuplicates = await conversationCollection
      .aggregate([
        { $match: { type: "direct" } },
        {
          $project: {
            participants: {
              $sortArray: {
                input: "$participants.userId",
                sortBy: 1,
              },
            },
          },
        },
        {
          $group: {
            _id: "$participants",
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 5 },
      ])
      .toArray();

    const malformedDirectConversations = await conversationCollection.countDocuments(
      {
        type: "direct",
        $expr: { $ne: [{ $size: "$participants" }, 2] },
      },
    );

    const conversationsWithNoParticipants = await conversationCollection.countDocuments(
      {
        $or: [
          { participants: { $exists: false } },
          { participants: { $size: 0 } },
        ],
      },
    );

    const duplicateParticipantsInConversation = await conversationCollection
      .aggregate([
        {
          $project: {
            participantIds: {
              $map: {
                input: "$participants",
                as: "p",
                in: { $toString: "$$p.userId" },
              },
            },
          },
        },
        {
          $project: {
            participantCount: { $size: "$participantIds" },
            uniqueCount: { $size: { $setUnion: ["$participantIds", []] } },
          },
        },
        {
          $match: {
            $expr: { $gt: ["$participantCount", "$uniqueCount"] },
          },
        },
        { $count: "count" },
      ])
      .toArray();

    const conversationsWithInvalidParticipantRef = await countMissingRefByLookup({
      collection: conversationCollection,
      field: "participants.userId",
      targetCollection: "users",
      unwind: "$participants",
    });

    const conversationsWithInvalidSeenByRef = await countMissingRefByLookup({
      collection: conversationCollection,
      field: "seenBy",
      targetCollection: "users",
      unwind: "$seenBy",
    });

    const messagesWithInvalidConversationRef = await countMissingRefByLookup({
      collection: messageCollection,
      field: "conversationId",
      targetCollection: "conversations",
    });

    const messagesWithInvalidSenderRef = await countMissingRefByLookup({
      collection: messageCollection,
      field: "senderId",
      targetCollection: "users",
    });

    const messagesWithInvalidReplyToRef = await countMissingRefByLookup({
      collection: messageCollection,
      field: "replyTo",
      targetCollection: "messages",
      extraMatch: { replyTo: { $ne: null } },
    });

    const messagesWithInvalidReadByRef = await countMissingRefByLookup({
      collection: messageCollection,
      field: "readBy",
      targetCollection: "users",
      unwind: "$readBy",
    });

    const messagesWithInvalidHiddenForRef = await countMissingRefByLookup({
      collection: messageCollection,
      field: "hiddenFor",
      targetCollection: "users",
      unwind: "$hiddenFor",
    });

    const messagesWithInvalidReactionUserRef = await countMissingRefByLookup({
      collection: messageCollection,
      field: "reactions.userId",
      targetCollection: "users",
      unwind: "$reactions",
    });

    const friendWithInvalidUserARef = await countMissingRefByLookup({
      collection: friendCollection,
      field: "userA",
      targetCollection: "users",
    });

    const friendWithInvalidUserBRef = await countMissingRefByLookup({
      collection: friendCollection,
      field: "userB",
      targetCollection: "users",
    });

    const friendRequestWithInvalidFromRef = await countMissingRefByLookup({
      collection: friendRequestCollection,
      field: "from",
      targetCollection: "users",
    });

    const friendRequestWithInvalidToRef = await countMissingRefByLookup({
      collection: friendRequestCollection,
      field: "to",
      targetCollection: "users",
    });

    const notificationWithInvalidRecipientRef = await countMissingRefByLookup({
      collection: notificationCollection,
      field: "recipientId",
      targetCollection: "users",
    });

    const notificationWithInvalidActorRef = await countMissingRefByLookup({
      collection: notificationCollection,
      field: "actorId",
      targetCollection: "users",
    });

    const notificationWithInvalidPostRef = await countMissingRefByLookup({
      collection: notificationCollection,
      field: "postId",
      targetCollection: "posts",
      extraMatch: { postId: { $ne: null } },
    });

    const notificationWithInvalidCommentRef = await countMissingRefByLookup({
      collection: notificationCollection,
      field: "commentId",
      targetCollection: "comments",
      extraMatch: { commentId: { $ne: null } },
    });

    const sessionsWithInvalidUserRef = await countMissingRefByLookup({
      collection: sessionCollection,
      field: "userId",
      targetCollection: "users",
    });

    const unreadCountsMismatchSample = [];
    const conversationsWithUnreadCountForNonParticipant =
      await conversationCollection
        .aggregate([
          {
            $project: {
              participants: {
                $map: {
                  input: "$participants",
                  as: "p",
                  in: { $toString: "$$p.userId" },
                },
              },
              unreadEntries: {
                $objectToArray: { $ifNull: ["$unreadCounts", {}] },
              },
            },
          },
          {
            $project: {
              invalidUnreadKeys: {
                $filter: {
                  input: "$unreadEntries",
                  as: "entry",
                  cond: {
                    $not: {
                      $in: ["$$entry.k", "$participants"],
                    },
                  },
                },
              },
            },
          },
          {
            $match: {
              "invalidUnreadKeys.0": { $exists: true },
            },
          },
          {
            $project: {
              invalidUnreadKeys: 1,
            },
          },
          { $limit: 5 },
        ])
        .toArray();

    unreadCountsMismatchSample.push(
      ...conversationsWithUnreadCountForNonParticipant,
    );

    const integrity = {
      conversations: {
        malformedDirectConversations,
        conversationsWithNoParticipants,
        duplicateParticipantsInConversation:
          duplicateParticipantsInConversation[0]?.count ?? 0,
        conversationsWithInvalidParticipantRef,
        conversationsWithInvalidSeenByRef,
        conversationsWithUnreadCountForNonParticipant:
          unreadCountsMismatchSample.length,
      },
      messages: {
        messagesWithInvalidConversationRef,
        messagesWithInvalidSenderRef,
        messagesWithInvalidReplyToRef,
        messagesWithInvalidReadByRef,
        messagesWithInvalidHiddenForRef,
        messagesWithInvalidReactionUserRef,
      },
      social: {
        friendWithInvalidUserARef,
        friendWithInvalidUserBRef,
        friendRequestWithInvalidFromRef,
        friendRequestWithInvalidToRef,
        notificationWithInvalidRecipientRef,
        notificationWithInvalidActorRef,
        notificationWithInvalidPostRef,
        notificationWithInvalidCommentRef,
      },
      sessions: {
        sessionsWithInvalidUserRef,
      },
    };

    const healthWarnings = [];
    if (legacyConversationIndexes.length > 0 && !shouldFix) {
      healthWarnings.push(
        "Legacy conversation index found (participant.userId). Run with --fix to remove it.",
      );
    }
    if (sessionExpiredCount > 0) {
      healthWarnings.push(
        `Found ${sessionExpiredCount} expired sessions. Consider periodic cleanup.`,
      );
    }
    if (sampleDirectDuplicates.length > 0) {
      healthWarnings.push(
        `Found ${sampleDirectDuplicates.length} direct conversation duplicate group(s).`,
      );
    }
    if (malformedDirectConversations > 0) {
      healthWarnings.push(
        `Found ${malformedDirectConversations} malformed direct conversation(s) with participant count != 2.`,
      );
    }
    if (conversationsWithInvalidParticipantRef > 0) {
      healthWarnings.push(
        `Found ${conversationsWithInvalidParticipantRef} conversation participant reference(s) pointing to missing users.`,
      );
    }
    if (messagesWithInvalidConversationRef > 0) {
      healthWarnings.push(
        `Found ${messagesWithInvalidConversationRef} message(s) with missing conversation references.`,
      );
    }
    if (messagesWithInvalidSenderRef > 0) {
      healthWarnings.push(
        `Found ${messagesWithInvalidSenderRef} message(s) with missing sender references.`,
      );
    }
    if (sessionsWithInvalidUserRef > 0) {
      healthWarnings.push(
        `Found ${sessionsWithInvalidUserRef} session(s) with missing user references.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          mode: shouldFix ? "health-check+fix" : "health-check",
          counts,
          sessionExpiredCount,
          healthWarnings,
          fixesApplied,
          indexes: {
            conversations: convoIndexKeys,
            messages: messageIndexKeys,
            sessions: sessionIndexKeys,
          },
          integrity,
          unreadCountsMismatchSample,
          sampleDirectConversationDuplicates: sampleDirectDuplicates,
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
};

await run();
