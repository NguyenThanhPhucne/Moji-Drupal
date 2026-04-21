import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5001/api";
const mongoUri = process.env.MONGODB_CONNECTIONSTRING;
const runTag = Date.now();

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const largeMessageCount = Math.max(
  600,
  parsePositiveInt(process.env.DELETE_CONVO_SMOKE_MESSAGE_COUNT, 1400),
);
const bookmarkSeedCount = Math.max(
  50,
  parsePositiveInt(process.env.DELETE_CONVO_SMOKE_BOOKMARK_COUNT, 260),
);
const notificationSeedCount = Math.max(
  50,
  parsePositiveInt(process.env.DELETE_CONVO_SMOKE_NOTIFICATION_COUNT, 220),
);
const contextOnlyReportCount = Math.max(
  10,
  parsePositiveInt(process.env.DELETE_CONVO_SMOKE_CONTEXT_REPORT_COUNT, 40),
);

const users = {
  owner: {
    username: `delete_convo_owner_${runTag}`,
    password: `Qa_${runTag}_Aa!`,
    email: `delete_convo_owner_${runTag}@local.dev`,
    firstName: "Delete",
    lastName: "Owner",
  },
  peer: {
    username: `delete_convo_peer_${runTag}`,
    password: `Qa_${runTag}_Aa!`,
    email: `delete_convo_peer_${runTag}@local.dev`,
    firstName: "Delete",
    lastName: "Peer",
  },
};

const results = [];

const record = (id, title, pass, detail = "") => {
  const item = {
    id,
    title,
    pass: Boolean(pass),
    detail: String(detail || ""),
  };
  results.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} | ${id} | ${title} | ${item.detail}`);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readRetryAfterSeconds = ({ data, headers }) => {
  const fromBody = Number(data?.retryAfterSeconds);
  if (Number.isFinite(fromBody) && fromBody > 0) {
    return Math.max(1, Math.floor(fromBody));
  }

  const fromHeader = Number(headers?.get?.("retry-after") || 0);
  if (Number.isFinite(fromHeader) && fromHeader > 0) {
    return Math.max(1, Math.floor(fromHeader));
  }

  return 1;
};

const api = async (
  path,
  {
    method = "GET",
    token,
    body,
    retry429 = true,
    retriesLeft = 4,
  } = {},
) => {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new Error(`Request failed ${method} ${path}: ${error?.message || error}`);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (retry429 && response.status === 429 && retriesLeft > 0) {
    const retryAfterSeconds = readRetryAfterSeconds({ data, headers: response.headers });
    await wait((retryAfterSeconds + 0.1) * 1000);
    return api(path, {
      method,
      token,
      body,
      retry429,
      retriesLeft: retriesLeft - 1,
    });
  }

  return {
    status: response.status,
    ok: response.ok,
    data,
  };
};

const signupAndSignin = async (label, user) => {
  const signupResponse = await api("/auth/signup", {
    method: "POST",
    body: user,
  });

  record(
    `SETUP-SIGNUP-${label}`,
    `Signup ${label}`,
    signupResponse.status === 204,
    `status=${signupResponse.status}`,
  );

  const signinResponse = await api("/auth/signin", {
    method: "POST",
    body: {
      username: user.username,
      password: user.password,
    },
  });

  const signedIn =
    signinResponse.status === 200 &&
    Boolean(signinResponse.data?.accessToken) &&
    Boolean(signinResponse.data?.user?._id);

  record(
    `SETUP-SIGNIN-${label}`,
    `Signin ${label}`,
    signedIn,
    `status=${signinResponse.status}`,
  );

  if (!signedIn) {
    throw new Error(`Cannot sign in ${label}: ${signinResponse.status}`);
  }

  return {
    token: signinResponse.data.accessToken,
    userId: String(signinResponse.data.user._id),
  };
};

const befriend = async ({ owner, peer }) => {
  const requestResponse = await api("/friends/requests", {
    method: "POST",
    token: owner.token,
    body: {
      to: peer.userId,
      message: `delete-convo-scale-${runTag}`,
    },
  });

  record(
    "SETUP-FRIEND-REQUEST",
    "Send friend request owner->peer",
    requestResponse.status === 201,
    `status=${requestResponse.status}`,
  );

  if (requestResponse.status !== 201) {
    throw new Error(`Cannot send friend request: ${requestResponse.status}`);
  }

  const inboxResponse = await api("/friends/requests", {
    token: peer.token,
  });

  const received = Array.isArray(inboxResponse.data?.received)
    ? inboxResponse.data.received
    : [];
  const pending = received.find(
    (item) => String(item?.from?._id || "") === String(owner.userId),
  );

  if (!pending?._id) {
    throw new Error("Cannot find pending friend request for peer");
  }

  const acceptResponse = await api(`/friends/requests/${pending._id}/accept`, {
    method: "POST",
    token: peer.token,
  });

  record(
    "SETUP-FRIEND-ACCEPT",
    "Peer accepts friend request",
    acceptResponse.status === 200,
    `status=${acceptResponse.status}`,
  );

  if (acceptResponse.status !== 200) {
    throw new Error(`Cannot accept friend request: ${acceptResponse.status}`);
  }
};

const createDirectConversation = async ({ owner, peer }) => {
  const seedMessageResponse = await api("/messages/direct", {
    method: "POST",
    token: owner.token,
    body: {
      recipientId: peer.userId,
      content: `DELETE_CONVO_SEED_${runTag}`,
    },
  });

  record(
    "SETUP-DIRECT-SEED",
    "Seed direct conversation by API",
    seedMessageResponse.status === 201,
    `status=${seedMessageResponse.status}`,
  );

  if (seedMessageResponse.status !== 201) {
    throw new Error(`Cannot seed direct conversation: ${seedMessageResponse.status}`);
  }

  const conversationsResponse = await api("/conversations", {
    token: owner.token,
  });

  if (conversationsResponse.status !== 200) {
    throw new Error(`Cannot fetch conversations: ${conversationsResponse.status}`);
  }

  const conversations = Array.isArray(conversationsResponse.data?.conversations)
    ? conversationsResponse.data.conversations
    : [];

  const directConversation = conversations.find((conversation) => {
    if (conversation?.type !== "direct") {
      return false;
    }

    return (conversation.participants || []).some(
      (participant) => String(participant?._id || "") === String(peer.userId),
    );
  });

  const conversationId = String(directConversation?._id || "");

  record(
    "SETUP-DIRECT-ID",
    "Resolve direct conversation id",
    Boolean(conversationId),
    `conversationId=${conversationId || "-"}`,
  );

  if (!conversationId) {
    throw new Error("Cannot resolve direct conversation id");
  }

  return conversationId;
};

const createControlConversation = async ({ owner, peer }) => {
  const response = await api("/conversations", {
    method: "POST",
    token: owner.token,
    body: {
      type: "group",
      name: `delete-convo-control-${runTag}`,
      memberIds: [peer.userId],
    },
  });

  const conversationId = String(response.data?.conversation?._id || "");
  record(
    "SETUP-CONTROL-CONVERSATION",
    "Create control conversation",
    response.status === 201 && Boolean(conversationId),
    `status=${response.status}, conversationId=${conversationId || "-"}`,
  );

  if (response.status !== 201 || !conversationId) {
    throw new Error(`Cannot create control conversation: ${response.status}`);
  }

  return conversationId;
};

const connectMongo = async () => {
  if (!mongoUri) {
    throw new Error("Missing MONGODB_CONNECTIONSTRING");
  }

  await mongoose.connect(mongoUri);
};

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

const seedLargeRuntimeData = async ({
  targetConversationId,
  controlConversationId,
  owner,
  peer,
}) => {
  const db = mongoose.connection.db;
  const conversationCollection = db.collection("conversations");
  const messageCollection = db.collection("messages");
  const bookmarkCollection = db.collection("bookmarks");
  const notificationCollection = db.collection("notifications");
  const reportCollection = db.collection("contentreports");

  const ownerId = toObjectId(owner.userId);
  const peerId = toObjectId(peer.userId);
  const targetConversationObjectId = toObjectId(targetConversationId);
  const controlConversationObjectId = toObjectId(controlConversationId);

  const existingTargetMessageIdDocs = await messageCollection
    .find({ conversationId: targetConversationObjectId }, { projection: { _id: 1 } })
    .toArray();

  const existingTargetMessageIds = existingTargetMessageIdDocs
    .map((doc) => doc?._id)
    .filter(Boolean);

  const now = Date.now();

  const seededMessages = Array.from({ length: largeMessageCount }).map((_, index) => {
    const createdAt = new Date(now + index);
    return {
      _id: new mongoose.Types.ObjectId(),
      conversationId: targetConversationObjectId,
      senderId: index % 2 === 0 ? ownerId : peerId,
      content: `bulk-msg-${runTag}-${index}`,
      imgUrl: null,
      replyTo: null,
      forwardedFrom: null,
      isForwardable: true,
      reactions: [],
      isDeleted: false,
      editedAt: null,
      readBy: [ownerId],
      hiddenFor: [],
      createdAt,
      updatedAt: createdAt,
    };
  });

  await messageCollection.insertMany(seededMessages, { ordered: false });

  const targetMessageIds = [
    ...existingTargetMessageIds,
    ...seededMessages.map((message) => message._id),
  ];

  const bookmarkDocs = targetMessageIds
    .slice(0, Math.min(bookmarkSeedCount, targetMessageIds.length))
    .map((messageId, index) => {
      const createdAt = new Date(now + 5000 + index);
      return {
        _id: new mongoose.Types.ObjectId(),
        userId: index % 2 === 0 ? ownerId : peerId,
        messageId,
        conversationId: targetConversationObjectId,
        note: `bookmark-${runTag}-${index}`,
        tags: ["smoke"],
        collections: ["delete-conversation"],
        createdAt,
        updatedAt: createdAt,
      };
    });

  if (bookmarkDocs.length > 0) {
    await bookmarkCollection.insertMany(bookmarkDocs, { ordered: false });
  }

  const notificationDocs = Array.from({ length: notificationSeedCount }).map((_, index) => {
    const createdAt = new Date(now + 10000 + index);
    return {
      _id: new mongoose.Types.ObjectId(),
      recipientId: index % 2 === 0 ? ownerId : peerId,
      actorId: index % 2 === 0 ? peerId : ownerId,
      type: "system",
      conversationId: targetConversationObjectId,
      postId: null,
      commentId: null,
      message: `notification-${runTag}-${index}`,
      isRead: false,
      createdAt,
      updatedAt: createdAt,
    };
  });

  if (notificationDocs.length > 0) {
    await notificationCollection.insertMany(notificationDocs, { ordered: false });
  }

  const messageReportDocs = targetMessageIds.map((messageId, index) => {
    const createdAt = new Date(now + 15000 + index);
    return {
      _id: new mongoose.Types.ObjectId(),
      reporterId: index % 2 === 0 ? ownerId : peerId,
      reportedUserId: index % 2 === 0 ? peerId : ownerId,
      targetType: "message",
      targetId: messageId,
      reason: "other",
      details: `message-report-${runTag}-${index}`,
      context: {
        conversationId: targetConversationObjectId,
        postId: null,
        snapshot: `snapshot-${runTag}-${index}`,
      },
      status: "open",
      reviewedBy: null,
      reviewedAt: null,
      moderationNote: "",
      createdAt,
      updatedAt: createdAt,
    };
  });

  const contextOnlyReportDocs = Array.from({ length: contextOnlyReportCount }).map((_, index) => {
    const createdAt = new Date(now + 20000 + index);
    return {
      _id: new mongoose.Types.ObjectId(),
      reporterId: ownerId,
      reportedUserId: peerId,
      targetType: "post",
      targetId: new mongoose.Types.ObjectId(),
      reason: "other",
      details: `context-only-report-${runTag}-${index}`,
      context: {
        conversationId: targetConversationObjectId,
        postId: null,
        snapshot: `context-only-${runTag}-${index}`,
      },
      status: "open",
      reviewedBy: null,
      reviewedAt: null,
      moderationNote: "",
      createdAt,
      updatedAt: createdAt,
    };
  });

  const reportDocs = [...messageReportDocs, ...contextOnlyReportDocs];
  if (reportDocs.length > 0) {
    await reportCollection.insertMany(reportDocs, { ordered: false });
  }

  const controlMessageDocs = Array.from({ length: 5 }).map((_, index) => {
    const createdAt = new Date(now + 30000 + index);
    return {
      _id: new mongoose.Types.ObjectId(),
      conversationId: controlConversationObjectId,
      senderId: ownerId,
      content: `control-msg-${runTag}-${index}`,
      imgUrl: null,
      replyTo: null,
      forwardedFrom: null,
      isForwardable: true,
      reactions: [],
      isDeleted: false,
      editedAt: null,
      readBy: [ownerId],
      hiddenFor: [],
      createdAt,
      updatedAt: createdAt,
    };
  });

  await messageCollection.insertMany(controlMessageDocs, { ordered: false });

  const controlMessageIds = controlMessageDocs.map((message) => message._id);

  await bookmarkCollection.insertMany(
    [
      {
        _id: new mongoose.Types.ObjectId(),
        userId: ownerId,
        messageId: controlMessageIds[0],
        conversationId: controlConversationObjectId,
        note: `control-bookmark-${runTag}`,
        tags: ["control"],
        collections: ["delete-conversation"],
        createdAt: new Date(now + 35000),
        updatedAt: new Date(now + 35000),
      },
    ],
    { ordered: false },
  );

  await notificationCollection.insertMany(
    [
      {
        _id: new mongoose.Types.ObjectId(),
        recipientId: ownerId,
        actorId: peerId,
        type: "system",
        conversationId: controlConversationObjectId,
        postId: null,
        commentId: null,
        message: `control-notification-${runTag}`,
        isRead: false,
        createdAt: new Date(now + 36000),
        updatedAt: new Date(now + 36000),
      },
    ],
    { ordered: false },
  );

  await reportCollection.insertMany(
    [
      {
        _id: new mongoose.Types.ObjectId(),
        reporterId: ownerId,
        reportedUserId: peerId,
        targetType: "message",
        targetId: controlMessageIds[0],
        reason: "other",
        details: `control-message-report-${runTag}`,
        context: {
          conversationId: controlConversationObjectId,
          postId: null,
          snapshot: `control-message-report-${runTag}`,
        },
        status: "open",
        reviewedBy: null,
        reviewedAt: null,
        moderationNote: "",
        createdAt: new Date(now + 37000),
        updatedAt: new Date(now + 37000),
      },
      {
        _id: new mongoose.Types.ObjectId(),
        reporterId: ownerId,
        reportedUserId: peerId,
        targetType: "post",
        targetId: new mongoose.Types.ObjectId(),
        reason: "other",
        details: `control-context-report-${runTag}`,
        context: {
          conversationId: controlConversationObjectId,
          postId: null,
          snapshot: `control-context-report-${runTag}`,
        },
        status: "open",
        reviewedBy: null,
        reviewedAt: null,
        moderationNote: "",
        createdAt: new Date(now + 38000),
        updatedAt: new Date(now + 38000),
      },
    ],
    { ordered: false },
  );

  const targetConversationExists = await conversationCollection.countDocuments({
    _id: targetConversationObjectId,
  });

  return {
    targetMessageIds,
    controlMessageIds,
    targetConversationObjectId,
    controlConversationObjectId,
    targetConversationExists,
  };
};

const readCounts = async ({
  targetConversationObjectId,
  controlConversationObjectId,
  targetMessageIds,
  controlMessageIds,
}) => {
  const db = mongoose.connection.db;
  const conversationCollection = db.collection("conversations");
  const messageCollection = db.collection("messages");
  const bookmarkCollection = db.collection("bookmarks");
  const notificationCollection = db.collection("notifications");
  const reportCollection = db.collection("contentreports");

  const [
    targetConversationCount,
    controlConversationCount,
    targetMessageCount,
    controlMessageCount,
    targetBookmarkCount,
    controlBookmarkCount,
    targetNotificationCount,
    controlNotificationCount,
    targetReportsByContext,
    controlReportsByContext,
    targetReportsByMessageId,
    controlReportsByMessageId,
  ] = await Promise.all([
    conversationCollection.countDocuments({ _id: targetConversationObjectId }),
    conversationCollection.countDocuments({ _id: controlConversationObjectId }),
    messageCollection.countDocuments({ conversationId: targetConversationObjectId }),
    messageCollection.countDocuments({ conversationId: controlConversationObjectId }),
    bookmarkCollection.countDocuments({ conversationId: targetConversationObjectId }),
    bookmarkCollection.countDocuments({ conversationId: controlConversationObjectId }),
    notificationCollection.countDocuments({ conversationId: targetConversationObjectId }),
    notificationCollection.countDocuments({ conversationId: controlConversationObjectId }),
    reportCollection.countDocuments({
      "context.conversationId": targetConversationObjectId,
    }),
    reportCollection.countDocuments({
      "context.conversationId": controlConversationObjectId,
    }),
    reportCollection.countDocuments({
      targetType: "message",
      targetId: { $in: targetMessageIds },
    }),
    reportCollection.countDocuments({
      targetType: "message",
      targetId: { $in: controlMessageIds },
    }),
  ]);

  return {
    target: {
      conversation: targetConversationCount,
      messages: targetMessageCount,
      bookmarks: targetBookmarkCount,
      notifications: targetNotificationCount,
      reportsByContext: targetReportsByContext,
      reportsByMessage: targetReportsByMessageId,
    },
    control: {
      conversation: controlConversationCount,
      messages: controlMessageCount,
      bookmarks: controlBookmarkCount,
      notifications: controlNotificationCount,
      reportsByContext: controlReportsByContext,
      reportsByMessage: controlReportsByMessageId,
    },
  };
};

const run = async () => {
  console.log("=== DELETE CONVERSATION SCALE RUNTIME SMOKE ===");
  console.log(`baseUrl=${baseUrl}`);
  console.log(`messageCount=${largeMessageCount}`);

  const owner = await signupAndSignin("OWNER", users.owner);
  const peer = await signupAndSignin("PEER", users.peer);
  await befriend({ owner, peer });

  const targetConversationId = await createDirectConversation({ owner, peer });
  const controlConversationId = await createControlConversation({ owner, peer });

  await connectMongo();

  let seeded;
  try {
    seeded = await seedLargeRuntimeData({
      targetConversationId,
      controlConversationId,
      owner,
      peer,
    });

    record(
      "SEED-TARGET-EXISTS",
      "Target conversation exists before delete",
      seeded.targetConversationExists === 1,
      `count=${seeded.targetConversationExists}`,
    );

    record(
      "SEED-MESSAGE-SCALE",
      "Seeded target message ids above batch threshold",
      seeded.targetMessageIds.length > 500,
      `targetMessageIds=${seeded.targetMessageIds.length}`,
    );

    const beforeCounts = await readCounts({
      targetConversationObjectId: seeded.targetConversationObjectId,
      controlConversationObjectId: seeded.controlConversationObjectId,
      targetMessageIds: seeded.targetMessageIds,
      controlMessageIds: seeded.controlMessageIds,
    });

    const hasTargetDependentsBeforeDelete =
      beforeCounts.target.messages > 0 &&
      beforeCounts.target.bookmarks > 0 &&
      beforeCounts.target.notifications > 0 &&
      beforeCounts.target.reportsByContext > 0 &&
      beforeCounts.target.reportsByMessage > 0;

    record(
      "PRECHECK-TARGET-DEPENDENTS",
      "Target has dependent rows before delete",
      hasTargetDependentsBeforeDelete,
      JSON.stringify(beforeCounts.target),
    );

    const deleteResponse = await api(`/conversations/${targetConversationId}`, {
      method: "DELETE",
      token: owner.token,
    });

    record(
      "DELETE-API",
      "Delete target conversation via API",
      deleteResponse.status === 200,
      `status=${deleteResponse.status}`,
    );

    if (deleteResponse.status !== 200) {
      throw new Error(`Delete API failed with status ${deleteResponse.status}`);
    }

    await wait(200);

    const afterCounts = await readCounts({
      targetConversationObjectId: seeded.targetConversationObjectId,
      controlConversationObjectId: seeded.controlConversationObjectId,
      targetMessageIds: seeded.targetMessageIds,
      controlMessageIds: seeded.controlMessageIds,
    });

    const targetFullyCleaned =
      afterCounts.target.conversation === 0 &&
      afterCounts.target.messages === 0 &&
      afterCounts.target.bookmarks === 0 &&
      afterCounts.target.notifications === 0 &&
      afterCounts.target.reportsByContext === 0 &&
      afterCounts.target.reportsByMessage === 0;

    record(
      "ASSERT-TARGET-CLEANED",
      "Target conversation and dependents removed",
      targetFullyCleaned,
      JSON.stringify(afterCounts.target),
    );

    const controlUnchanged =
      afterCounts.control.conversation === beforeCounts.control.conversation &&
      afterCounts.control.messages === beforeCounts.control.messages &&
      afterCounts.control.bookmarks === beforeCounts.control.bookmarks &&
      afterCounts.control.notifications === beforeCounts.control.notifications &&
      afterCounts.control.reportsByContext === beforeCounts.control.reportsByContext &&
      afterCounts.control.reportsByMessage === beforeCounts.control.reportsByMessage;

    record(
      "ASSERT-CONTROL-UNCHANGED",
      "Control conversation data remains unchanged",
      controlUnchanged,
      `before=${JSON.stringify(beforeCounts.control)} after=${JSON.stringify(afterCounts.control)}`,
    );

    const ownerConversationsResponse = await api("/conversations", { token: owner.token });
    const ownerConversations = Array.isArray(ownerConversationsResponse.data?.conversations)
      ? ownerConversationsResponse.data.conversations
      : [];

    const targetVisibleInOwnerList = ownerConversations.some(
      (conversation) => String(conversation?._id || "") === String(targetConversationId),
    );

    record(
      "ASSERT-OWNER-LIST",
      "Deleted conversation absent from owner conversation list",
      ownerConversationsResponse.status === 200 && !targetVisibleInOwnerList,
      `status=${ownerConversationsResponse.status}, stillVisible=${targetVisibleInOwnerList}`,
    );

    const cleanupControlResponse = await api(`/conversations/${controlConversationId}`, {
      method: "DELETE",
      token: owner.token,
    });

    record(
      "CLEANUP-CONTROL",
      "Best-effort cleanup control conversation",
      cleanupControlResponse.status === 200,
      `status=${cleanupControlResponse.status}`,
    );
  } finally {
    await mongoose.disconnect();
  }

  const failed = results.filter((item) => !item.pass);
  const summary = {
    ok: failed.length === 0,
    failedCount: failed.length,
    passedCount: results.length - failed.length,
    totalChecks: results.length,
    baseUrl,
    runTag,
    messageCount: largeMessageCount,
    checks: results,
  };

  console.log("=== DELETE CONVERSATION SCALE SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  process.exitCode = failed.length === 0 ? 0 : 1;
};

try {
  await run();
} catch (error) {
  console.error("FAIL | DELETE-CONVERSATION-SCALE-SMOKE |", error?.message || error);
  process.exit(1);
}
