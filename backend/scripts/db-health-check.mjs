import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const shouldFix = process.argv.includes("--fix");

const isLegacyConversationIndex = (index) => {
  const key = index?.key || {};
  return key["participant.userId"] === 1 && key.lastMessageAt === -1;
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

    const counts = {
      users: await userCollection.countDocuments(),
      conversations: await conversationCollection.countDocuments(),
      messages: await messageCollection.countDocuments(),
      sessions: await sessionCollection.countDocuments(),
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
