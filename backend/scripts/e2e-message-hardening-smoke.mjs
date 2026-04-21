import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5001/api";
const mongoUri = process.env.MONGODB_CONNECTIONSTRING;
const runTag = Date.now();

const REMOVED_MESSAGE_CONTENT = "This message was removed";

const users = {
  owner: {
    username: `msg_harden_owner_${runTag}`,
    password: `Qa_${runTag}_Aa!`,
    email: `msg_harden_owner_${runTag}@local.dev`,
    firstName: "Msg",
    lastName: "Owner",
  },
  peer: {
    username: `msg_harden_peer_${runTag}`,
    password: `Qa_${runTag}_Aa!`,
    email: `msg_harden_peer_${runTag}@local.dev`,
    firstName: "Msg",
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
      message: `message-hardening-${runTag}`,
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

const run = async () => {
  console.log("=== MESSAGE HARDENING RUNTIME SMOKE ===");
  console.log(`baseUrl=${baseUrl}`);

  const owner = await signupAndSignin("OWNER", users.owner);
  const peer = await signupAndSignin("PEER", users.peer);
  await befriend({ owner, peer });

  const seedMessageResponse = await sendDirect({
    token: owner.token,
    recipientId: peer.userId,
    content: `seed-message-${runTag}`,
  });

  const messageId = String(seedMessageResponse.data?.message?._id || "");
  const conversationId = String(seedMessageResponse.data?.message?.conversationId || "");

  record(
    "SETUP-SEED-MESSAGE",
    "Create direct message for endpoint checks",
    seedMessageResponse.status === 201 && Boolean(messageId) && Boolean(conversationId),
    `status=${seedMessageResponse.status}, messageId=${messageId || "-"}`,
  );

  if (seedMessageResponse.status !== 201 || !messageId) {
    throw new Error(`Cannot create seed message: ${seedMessageResponse.status}`);
  }

  const invalidMessageId = "invalid-object-id";

  const invalidUnsend = await api(`/messages/${invalidMessageId}/unsend`, {
    method: "DELETE",
    token: owner.token,
  });
  record(
    "VALIDATION-INVALID-ID-UNSEND",
    "Unsend rejects malformed message id",
    invalidUnsend.status === 400,
    `status=${invalidUnsend.status}`,
  );

  const invalidRemoveForMe = await api(`/messages/${invalidMessageId}/remove-for-me`, {
    method: "DELETE",
    token: owner.token,
  });
  record(
    "VALIDATION-INVALID-ID-REMOVE",
    "Remove-for-me rejects malformed message id",
    invalidRemoveForMe.status === 400,
    `status=${invalidRemoveForMe.status}`,
  );

  const invalidEdit = await api(`/messages/${invalidMessageId}/edit`, {
    method: "PUT",
    token: owner.token,
    body: {
      content: "edited",
    },
  });
  record(
    "VALIDATION-INVALID-ID-EDIT",
    "Edit rejects malformed message id",
    invalidEdit.status === 400,
    `status=${invalidEdit.status}`,
  );

  const nonStringEdit = await api(`/messages/${messageId}/edit`, {
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

  const emptyEdit = await api(`/messages/${messageId}/edit`, {
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

  const editedContent = `edited-message-${runTag}`;
  const editSuccess = await api(`/messages/${messageId}/edit`, {
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

  await connectMongo();

  try {
    const editedMessageFromDb = await getMessageFromDb(messageId);
    record(
      "ASSERT-EDIT-DB",
      "Edited content persisted in database",
      String(editedMessageFromDb?.content || "") === editedContent && Boolean(editedMessageFromDb?.editedAt),
      `content=${String(editedMessageFromDb?.content || "")}`,
    );

    const peerUnsendForbidden = await api(`/messages/${messageId}/unsend`, {
      method: "DELETE",
      token: peer.token,
    });
    record(
      "AUTHZ-PEER-UNSEND-FORBIDDEN",
      "Peer cannot unsend owner's message",
      peerUnsendForbidden.status === 403,
      `status=${peerUnsendForbidden.status}`,
    );

    const removeForMe = await api(`/messages/${messageId}/remove-for-me`, {
      method: "DELETE",
      token: peer.token,
    });
    record(
      "FLOW-REMOVE-FOR-ME",
      "Remove-for-me succeeds",
      removeForMe.status === 200 && removeForMe.data?.success === true,
      `status=${removeForMe.status}, alreadyHidden=${Boolean(removeForMe.data?.alreadyHidden)}`,
    );

    const removeForMeAgain = await api(`/messages/${messageId}/remove-for-me`, {
      method: "DELETE",
      token: peer.token,
    });
    record(
      "FLOW-REMOVE-FOR-ME-IDEMPOTENT",
      "Remove-for-me remains idempotent",
      removeForMeAgain.status === 200 && removeForMeAgain.data?.alreadyHidden === true,
      `status=${removeForMeAgain.status}, alreadyHidden=${Boolean(removeForMeAgain.data?.alreadyHidden)}`,
    );

    const hiddenMessageFromDb = await getMessageFromDb(messageId);
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

    const unsendSuccess = await api(`/messages/${messageId}/unsend`, {
      method: "DELETE",
      token: owner.token,
    });
    record(
      "FLOW-UNSEND-SUCCESS",
      "Owner unsend succeeds",
      unsendSuccess.status === 200,
      `status=${unsendSuccess.status}`,
    );

    const unsendAgain = await api(`/messages/${messageId}/unsend`, {
      method: "DELETE",
      token: owner.token,
    });
    record(
      "FLOW-UNSEND-IDEMPOTENT",
      "Owner unsend remains idempotent",
      unsendAgain.status === 200,
      `status=${unsendAgain.status}`,
    );

    const deletedMessageFromDb = await getMessageFromDb(messageId);
    const deletedPayloadNormalized =
      Boolean(deletedMessageFromDb?.isDeleted) &&
      String(deletedMessageFromDb?.content || "") === REMOVED_MESSAGE_CONTENT &&
      deletedMessageFromDb?.imgUrl === null &&
      Array.isArray(deletedMessageFromDb?.reactions) &&
      deletedMessageFromDb.reactions.length === 0;

    record(
      "ASSERT-UNSEND-DB",
      "Unsend normalization persisted in database",
      deletedPayloadNormalized,
      `isDeleted=${Boolean(deletedMessageFromDb?.isDeleted)}, content=${String(deletedMessageFromDb?.content || "")}`,
    );

    const editAfterUnsend = await api(`/messages/${messageId}/edit`, {
      method: "PUT",
      token: owner.token,
      body: {
        content: "cannot-edit",
      },
    });
    record(
      "VALIDATION-EDIT-AFTER-UNSEND",
      "Edit is rejected after message was unsent",
      editAfterUnsend.status === 400,
      `status=${editAfterUnsend.status}`,
    );

    const peerMessagesAfterHide = await api(`/conversations/${conversationId}/messages`, {
      token: peer.token,
    });
    const peerCanStillSeeHiddenMessage = Array.isArray(peerMessagesAfterHide.data?.messages)
      ? peerMessagesAfterHide.data.messages.some(
          (message) => String(message?._id || "") === String(messageId),
        )
      : false;
    record(
      "ASSERT-PEER-HIDDEN-VISIBILITY",
      "Hidden message is absent from peer message list",
      peerMessagesAfterHide.status === 200 && !peerCanStillSeeHiddenMessage,
      `status=${peerMessagesAfterHide.status}, stillVisible=${peerCanStillSeeHiddenMessage}`,
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
    checks: results,
  };

  console.log("=== MESSAGE HARDENING SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  process.exitCode = failed.length === 0 ? 0 : 1;
};

try {
  await run();
} catch (error) {
  console.error("FAIL | MESSAGE-HARDENING-SMOKE |", error?.message || error);
  process.exit(1);
}
