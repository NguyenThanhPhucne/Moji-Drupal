import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5001/api";
const mongoUri = process.env.MONGODB_CONNECTIONSTRING;
const runTag = Date.now();

const REMOVED_MESSAGE_CONTENT = "This message was removed";

const users = {
  owner: {
    username: `msg_actions_owner_${runTag}`,
    password: `Qa_${runTag}_Aa!`,
    email: `msg_actions_owner_${runTag}@local.dev`,
    firstName: "Msg",
    lastName: "Owner",
  },
  peer: {
    username: `msg_actions_peer_${runTag}`,
    password: `Qa_${runTag}_Aa!`,
    email: `msg_actions_peer_${runTag}@local.dev`,
    firstName: "Msg",
    lastName: "Peer",
  },
  third: {
    username: `msg_actions_third_${runTag}`,
    password: `Qa_${runTag}_Aa!`,
    email: `msg_actions_third_${runTag}@local.dev`,
    firstName: "Msg",
    lastName: "Third",
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

const befriend = async ({ owner, target, label }) => {
  const requestResponse = await api("/friends/requests", {
    method: "POST",
    token: owner.token,
    body: {
      to: target.userId,
      message: `message-actions-ci-${label}-${runTag}`,
    },
  });

  record(
    `SETUP-FRIEND-REQUEST-${label}`,
    `Send friend request owner->${label}`,
    requestResponse.status === 201,
    `status=${requestResponse.status}`,
  );

  if (requestResponse.status !== 201) {
    throw new Error(`Cannot send friend request (${label}): ${requestResponse.status}`);
  }

  const inboxResponse = await api("/friends/requests", {
    token: target.token,
  });

  const received = Array.isArray(inboxResponse.data?.received)
    ? inboxResponse.data.received
    : [];
  const pending = received.find(
    (item) => String(item?.from?._id || "") === String(owner.userId),
  );

  if (!pending?._id) {
    throw new Error(`Cannot find pending friend request for ${label}`);
  }

  const acceptResponse = await api(`/friends/requests/${pending._id}/accept`, {
    method: "POST",
    token: target.token,
  });

  record(
    `SETUP-FRIEND-ACCEPT-${label}`,
    `${label} accepts friend request`,
    acceptResponse.status === 200,
    `status=${acceptResponse.status}`,
  );

  if (acceptResponse.status !== 200) {
    throw new Error(`Cannot accept friend request (${label}): ${acceptResponse.status}`);
  }
};

const createGroupConversation = async ({ ownerToken, memberIds, name }) => {
  return api("/conversations", {
    method: "POST",
    token: ownerToken,
    body: {
      type: "group",
      name,
      memberIds,
    },
  });
};

const sendDirect = async ({ token, recipientId, content }) => {
  return api("/messages/direct", {
    method: "POST",
    token,
    body: {
      recipientId,
      content,
    },
  });
};

const connectMongo = async () => {
  if (!mongoUri) {
    throw new Error("Missing MONGODB_CONNECTIONSTRING");
  }

  await mongoose.connect(mongoUri);
};

const getMessageFromDb = async (messageId) => {
  const db = mongoose.connection.db;
  return db.collection("messages").findOne({
    _id: new mongoose.Types.ObjectId(String(messageId)),
  });
};

const countForwardedMessagesFromDb = async ({ senderId, content, excludeMessageId }) => {
  const db = mongoose.connection.db;

  return db.collection("messages").countDocuments({
    senderId: new mongoose.Types.ObjectId(String(senderId)),
    forwardedFrom: new mongoose.Types.ObjectId(String(senderId)),
    content,
    _id: {
      $ne: new mongoose.Types.ObjectId(String(excludeMessageId)),
    },
  });
};

const toObjectIdLike = (value) => {
  const hex = Number(value).toString(16);
  return hex.padStart(24, "0").slice(-24);
};

const setupScenario = async () => {
  const owner = await signupAndSignin("OWNER", users.owner);
  const peer = await signupAndSignin("PEER", users.peer);
  const third = await signupAndSignin("THIRD", users.third);

  await befriend({ owner, target: peer, label: "PEER" });
  await befriend({ owner, target: third, label: "THIRD" });

  const groupResponse = await createGroupConversation({
    ownerToken: owner.token,
    memberIds: [peer.userId, third.userId],
    name: `Message Actions CI Group ${runTag}`,
  });

  const groupConversationId = String(groupResponse.data?.conversation?._id || "");
  record(
    "SETUP-CREATE-GROUP",
    "Create target group conversation for forward",
    groupResponse.status === 201 && Boolean(groupConversationId),
    `status=${groupResponse.status}, groupId=${groupConversationId || "-"}`,
  );

  if (groupResponse.status !== 201 || !groupConversationId) {
    throw new Error(`Cannot create group conversation: ${groupResponse.status}`);
  }

  const seedMessageResponse = await sendDirect({
    token: owner.token,
    recipientId: peer.userId,
    content: `seed-message-actions-${runTag}`,
  });

  const sourceMessageId = String(seedMessageResponse.data?.message?._id || "");
  const sourceConversationId = String(
    seedMessageResponse.data?.message?.conversationId || "",
  );

  record(
    "SETUP-SEED-MESSAGE",
    "Create source direct message",
    seedMessageResponse.status === 201 && Boolean(sourceMessageId) && Boolean(sourceConversationId),
    `status=${seedMessageResponse.status}, messageId=${sourceMessageId || "-"}`,
  );

  if (seedMessageResponse.status !== 201 || !sourceMessageId || !sourceConversationId) {
    throw new Error(`Cannot create source message: ${seedMessageResponse.status}`);
  }

  return {
    owner,
    peer,
    third,
    groupConversationId,
    sourceMessageId,
    sourceConversationId,
  };
};

const runApiPhaseChecks = async ({ owner, peer, third, sourceMessageId }) => {
  const invalidMessageId = "invalid-object-id";

  const invalidRead = await api(`/messages/${invalidMessageId}/read`, {
    method: "POST",
    token: peer.token,
  });
  record(
    "VALIDATION-INVALID-ID-READ",
    "Mark-read rejects malformed message id",
    invalidRead.status === 400,
    `status=${invalidRead.status}`,
  );

  const invalidReact = await api(`/messages/${invalidMessageId}/react`, {
    method: "POST",
    token: owner.token,
    body: {
      emoji: "👍",
    },
  });
  record(
    "VALIDATION-INVALID-ID-REACT",
    "React rejects malformed message id",
    invalidReact.status === 400,
    `status=${invalidReact.status}`,
  );

  const invalidForward = await api(`/messages/${invalidMessageId}/forward`, {
    method: "POST",
    token: owner.token,
    body: {
      recipientIds: [third.userId],
    },
  });
  record(
    "VALIDATION-INVALID-ID-FORWARD",
    "Forward rejects malformed message id",
    invalidForward.status === 400,
    `status=${invalidForward.status}`,
  );

  const nonStringEdit = await api(`/messages/${sourceMessageId}/edit`, {
    method: "PUT",
    token: owner.token,
    body: {
      content: { nested: true },
    },
  });
  record(
    "VALIDATION-EDIT-NON-STRING",
    "Edit rejects non-string content",
    nonStringEdit.status === 400,
    `status=${nonStringEdit.status}`,
  );

  const emptyEdit = await api(`/messages/${sourceMessageId}/edit`, {
    method: "PUT",
    token: owner.token,
    body: {
      content: "   ",
    },
  });
  record(
    "VALIDATION-EDIT-EMPTY",
    "Edit rejects empty/whitespace-only content",
    emptyEdit.status === 400,
    `status=${emptyEdit.status}`,
  );

  const editedContent = `edited-message-actions-${runTag}`;
  const editSuccess = await api(`/messages/${sourceMessageId}/edit`, {
    method: "PUT",
    token: owner.token,
    body: {
      content: `  ${editedContent}  `,
    },
  });
  record(
    "FLOW-EDIT-SUCCESS",
    "Edit succeeds with normalized content",
    editSuccess.status === 200 && String(editSuccess.data?.message?.content || "") === editedContent,
    `status=${editSuccess.status}, content=${String(editSuccess.data?.message?.content || "")}`,
  );

  const reactNonString = await api(`/messages/${sourceMessageId}/react`, {
    method: "POST",
    token: owner.token,
    body: {
      emoji: { value: "👍" },
    },
  });
  record(
    "VALIDATION-REACT-NON-STRING",
    "React rejects non-string emoji",
    reactNonString.status === 400,
    `status=${reactNonString.status}`,
  );

  const reactSuccess = await api(`/messages/${sourceMessageId}/react`, {
    method: "POST",
    token: owner.token,
    body: {
      emoji: " 👍 ",
    },
  });

  const ownerReacted = Array.isArray(reactSuccess.data?.reactions)
    ? reactSuccess.data.reactions.some(
        (reaction) =>
          String(reaction?.userId || "") === String(owner.userId) &&
          String(reaction?.emoji || "") === "👍",
      )
    : false;

  record(
    "FLOW-REACT-SUCCESS",
    "React adds normalized emoji",
    reactSuccess.status === 200 && ownerReacted,
    `status=${reactSuccess.status}, reactionCount=${Array.isArray(reactSuccess.data?.reactions) ? reactSuccess.data.reactions.length : 0}`,
  );

  const reactToggle = await api(`/messages/${sourceMessageId}/react`, {
    method: "POST",
    token: owner.token,
    body: {
      emoji: "👍",
    },
  });

  const ownerReactionRemoved = Array.isArray(reactToggle.data?.reactions)
    ? !reactToggle.data.reactions.some(
        (reaction) => String(reaction?.userId || "") === String(owner.userId),
      )
    : false;

  record(
    "FLOW-REACT-TOGGLE",
    "React toggles off existing user emoji",
    reactToggle.status === 200 && ownerReactionRemoved,
    `status=${reactToggle.status}, reactionCount=${Array.isArray(reactToggle.data?.reactions) ? reactToggle.data.reactions.length : 0}`,
  );

  const markReadSuccess = await api(`/messages/${sourceMessageId}/read`, {
    method: "POST",
    token: peer.token,
  });
  record(
    "FLOW-READ-SUCCESS",
    "Peer marks message read",
    markReadSuccess.status === 200 && markReadSuccess.data?.ok === true,
    `status=${markReadSuccess.status}`,
  );

  const markReadAgain = await api(`/messages/${sourceMessageId}/read`, {
    method: "POST",
    token: peer.token,
  });
  record(
    "FLOW-READ-IDEMPOTENT",
    "Mark-read remains idempotent",
    markReadAgain.status === 200 && markReadAgain.data?.alreadyRead === true,
    `status=${markReadAgain.status}, alreadyRead=${Boolean(markReadAgain.data?.alreadyRead)}`,
  );

  return {
    editedContent,
  };
};

const runDbBackedChecks = async ({
  owner,
  peer,
  third,
  groupConversationId,
  sourceMessageId,
  sourceConversationId,
  editedContent,
}) => {
  const editedMessageFromDb = await getMessageFromDb(sourceMessageId);
  const peerReadByInDb = Array.isArray(editedMessageFromDb?.readBy)
    ? editedMessageFromDb.readBy.some(
        (userId) => String(userId) === String(peer.userId),
      )
    : false;

  record(
    "ASSERT-DB-EDIT-AND-READ",
    "DB reflects edited content and readBy peer",
    String(editedMessageFromDb?.content || "") === editedContent && peerReadByInDb,
    `content=${String(editedMessageFromDb?.content || "")}, readByCount=${Array.isArray(editedMessageFromDb?.readBy) ? editedMessageFromDb.readBy.length : 0}`,
  );

  const removeForMe = await api(`/messages/${sourceMessageId}/remove-for-me`, {
    method: "DELETE",
    token: peer.token,
  });
  record(
    "FLOW-REMOVE-FOR-ME",
    "Remove-for-me succeeds for peer",
    removeForMe.status === 200 && removeForMe.data?.success === true,
    `status=${removeForMe.status}, alreadyHidden=${Boolean(removeForMe.data?.alreadyHidden)}`,
  );

  const removeForMeAgain = await api(`/messages/${sourceMessageId}/remove-for-me`, {
    method: "DELETE",
    token: peer.token,
  });
  record(
    "FLOW-REMOVE-FOR-ME-IDEMPOTENT",
    "Remove-for-me remains idempotent",
    removeForMeAgain.status === 200 && removeForMeAgain.data?.alreadyHidden === true,
    `status=${removeForMeAgain.status}, alreadyHidden=${Boolean(removeForMeAgain.data?.alreadyHidden)}`,
  );

  const hiddenMessageFromDb = await getMessageFromDb(sourceMessageId);
  const hiddenForPeer = Array.isArray(hiddenMessageFromDb?.hiddenFor)
    ? hiddenMessageFromDb.hiddenFor.some(
        (userId) => String(userId) === String(peer.userId),
      )
    : false;
  record(
    "ASSERT-HIDDEN-FOR",
    "Message hiddenFor contains peer user id",
    hiddenForPeer,
    `hiddenForCount=${Array.isArray(hiddenMessageFromDb?.hiddenFor) ? hiddenMessageFromDb.hiddenFor.length : 0}`,
  );

  const markReadHidden = await api(`/messages/${sourceMessageId}/read`, {
    method: "POST",
    token: peer.token,
  });
  record(
    "VALIDATION-READ-HIDDEN",
    "Mark-read is rejected for hidden message",
    markReadHidden.status === 400,
    `status=${markReadHidden.status}`,
  );

  const reactHidden = await api(`/messages/${sourceMessageId}/react`, {
    method: "POST",
    token: peer.token,
    body: {
      emoji: "👍",
    },
  });
  record(
    "VALIDATION-REACT-HIDDEN",
    "React is rejected for hidden message",
    reactHidden.status === 400,
    `status=${reactHidden.status}`,
  );

  const peerMessages = await api(`/conversations/${sourceConversationId}/messages`, {
    token: peer.token,
  });

  const peerStillSeesSource = Array.isArray(peerMessages.data?.messages)
    ? peerMessages.data.messages.some(
        (message) => String(message?._id || "") === String(sourceMessageId),
      )
    : false;

  record(
    "ASSERT-PEER-HIDDEN-VISIBILITY",
    "Peer no longer sees source message in conversation list",
    peerMessages.status === 200 && !peerStillSeesSource,
    `status=${peerMessages.status}, stillVisible=${peerStillSeesSource}`,
  );

  const forwardMissingTargets = await api(`/messages/${sourceMessageId}/forward`, {
    method: "POST",
    token: owner.token,
    body: {},
  });
  record(
    "VALIDATION-FORWARD-MISSING-TARGETS",
    "Forward rejects empty target lists",
    forwardMissingTargets.status === 400,
    `status=${forwardMissingTargets.status}`,
  );

  const forwardInvalidOnly = await api(`/messages/${sourceMessageId}/forward`, {
    method: "POST",
    token: owner.token,
    body: {
      recipientIds: ["bad-id"],
    },
  });
  record(
    "VALIDATION-FORWARD-INVALID-ONLY",
    "Forward rejects when all targets are invalid",
    forwardInvalidOnly.status === 400 && Array.isArray(forwardInvalidOnly.data?.failedTargets),
    `status=${forwardInvalidOnly.status}, failedTargets=${Array.isArray(forwardInvalidOnly.data?.failedTargets) ? forwardInvalidOnly.data.failedTargets.length : 0}`,
  );

  const overLimitRecipientIds = Array.from({ length: 31 }, (_, index) =>
    toObjectIdLike(runTag + index + 1),
  );

  const forwardOverLimit = await api(`/messages/${sourceMessageId}/forward`, {
    method: "POST",
    token: owner.token,
    body: {
      recipientIds: overLimitRecipientIds,
    },
  });
  record(
    "VALIDATION-FORWARD-OVER-LIMIT",
    "Forward rejects target lists over configured limit",
    forwardOverLimit.status === 400,
    `status=${forwardOverLimit.status}`,
  );

  const forwardPartial = await api(`/messages/${sourceMessageId}/forward`, {
    method: "POST",
    token: owner.token,
    body: {
      recipientIds: [third.userId, owner.userId, "invalid-id"],
      groupIds: [groupConversationId],
    },
  });

  const partialFailedTargets = Array.isArray(forwardPartial.data?.failedTargets)
    ? forwardPartial.data.failedTargets
    : [];

  record(
    "FLOW-FORWARD-PARTIAL-SUCCESS",
    "Forward supports partial success with invalid/self targets",
    forwardPartial.status === 201 &&
      Number(forwardPartial.data?.count || 0) === 2 &&
      forwardPartial.data?.partial === true &&
      partialFailedTargets.length >= 2,
    `status=${forwardPartial.status}, count=${Number(forwardPartial.data?.count || 0)}, failed=${partialFailedTargets.length}`,
  );

  const forwardedCountFromDb = await countForwardedMessagesFromDb({
    senderId: owner.userId,
    content: editedContent,
    excludeMessageId: sourceMessageId,
  });

  record(
    "ASSERT-FORWARD-DB",
    "DB contains forwarded copies for successful targets",
    forwardedCountFromDb >= 2,
    `forwardedCount=${forwardedCountFromDb}`,
  );

  const unsendSuccess = await api(`/messages/${sourceMessageId}/unsend`, {
    method: "DELETE",
    token: owner.token,
  });
  record(
    "FLOW-UNSEND-SUCCESS",
    "Owner unsend succeeds",
    unsendSuccess.status === 200,
    `status=${unsendSuccess.status}`,
  );

  const unsendAgain = await api(`/messages/${sourceMessageId}/unsend`, {
    method: "DELETE",
    token: owner.token,
  });
  record(
    "FLOW-UNSEND-IDEMPOTENT",
    "Owner unsend remains idempotent",
    unsendAgain.status === 200,
    `status=${unsendAgain.status}`,
  );

  const editAfterUnsend = await api(`/messages/${sourceMessageId}/edit`, {
    method: "PUT",
    token: owner.token,
    body: {
      content: "cannot-edit-after-unsend",
    },
  });
  record(
    "VALIDATION-EDIT-AFTER-UNSEND",
    "Edit is rejected after unsend",
    editAfterUnsend.status === 400,
    `status=${editAfterUnsend.status}`,
  );

  const forwardAfterUnsend = await api(`/messages/${sourceMessageId}/forward`, {
    method: "POST",
    token: owner.token,
    body: {
      recipientIds: [third.userId],
    },
  });
  record(
    "VALIDATION-FORWARD-AFTER-UNSEND",
    "Forward is rejected after source message unsend",
    forwardAfterUnsend.status === 400,
    `status=${forwardAfterUnsend.status}`,
  );

  const deletedMessageFromDb = await getMessageFromDb(sourceMessageId);
  const deletedPayloadNormalized =
    Boolean(deletedMessageFromDb?.isDeleted) &&
    String(deletedMessageFromDb?.content || "") === REMOVED_MESSAGE_CONTENT &&
    deletedMessageFromDb?.imgUrl === null &&
    Array.isArray(deletedMessageFromDb?.reactions) &&
    deletedMessageFromDb.reactions.length === 0;

  record(
    "ASSERT-UNSEND-DB",
    "Unsend normalization persisted in DB",
    deletedPayloadNormalized,
    `isDeleted=${Boolean(deletedMessageFromDb?.isDeleted)}, content=${String(deletedMessageFromDb?.content || "")}`,
  );
};

const run = async () => {
  console.log("=== MESSAGE ACTIONS CI SMOKE ===");
  console.log(`baseUrl=${baseUrl}`);

  const scenario = await setupScenario();
  const { editedContent } = await runApiPhaseChecks(scenario);

  await connectMongo();
  try {
    await runDbBackedChecks({
      ...scenario,
      editedContent,
    });
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
    checks: results,
  };

  console.log("=== MESSAGE ACTIONS CI SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  process.exitCode = failed.length === 0 ? 0 : 1;
};

try {
  await run();
} catch (error) {
  console.error("FAIL | MESSAGE-ACTIONS-CI-SMOKE |", error?.message || error);
  process.exit(1);
}
