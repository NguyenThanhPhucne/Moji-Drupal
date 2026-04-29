const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5001/api";
const runTag = Date.now();
const VOICE_PREVIEW_CONTENT = "🎤 Voice message";

const users = {
  owner: {
    username: `preview_audio_owner_${runTag}`,
    password: `Qa_${runTag}_Aa!`,
    email: `preview_audio_owner_${runTag}@local.dev`,
    firstName: "Preview",
    lastName: "Owner",
  },
  peer: {
    username: `preview_audio_peer_${runTag}`,
    password: `Qa_${runTag}_Aa!`,
    email: `preview_audio_peer_${runTag}@local.dev`,
    firstName: "Preview",
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

const api = async (
  path,
  {
    method = "GET",
    token,
    body,
  } = {},
) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
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
      message: `chat-preview-audio-smoke-${runTag}`,
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

const getConversations = async (token) => {
  const response = await api("/conversations", { token });
  return {
    ...response,
    conversations: Array.isArray(response.data?.conversations)
      ? response.data.conversations
      : [],
  };
};

const getConversationPreviewWithRetry = async ({
  token,
  conversationId,
  maxAttempts = 6,
  delayMs = 250,
}) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await getConversations(token);
    const targetConversation = response.conversations.find(
      (conversation) => String(conversation?._id || "") === String(conversationId),
    );

    const previewContent = String(
      targetConversation?.lastMessage?.content || "",
    );

    if (previewContent) {
      return {
        status: response.status,
        previewContent,
      };
    }

    if (attempt < maxAttempts) {
      await wait(delayMs);
    }
  }

  return {
    status: 200,
    previewContent: "",
  };
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

const run = async () => {
  console.log("=== CHAT PREVIEW/AUDIO SMOKE ===");
  console.log(`baseUrl=${baseUrl}`);

  const owner = await signupAndSignin("OWNER", users.owner);
  const peer = await signupAndSignin("PEER", users.peer);
  await befriend({ owner, peer });

  const directAudioSend = await api("/messages/direct", {
    method: "POST",
    token: owner.token,
    body: {
      recipientId: peer.userId,
      content: "",
      audioUrl: "https://example.com/smoke-audio-direct.mp4",
    },
  });

  const directMessageId = String(directAudioSend.data?.message?._id || "");
  const directConversationId = String(
    directAudioSend.data?.message?.conversationId || "",
  );

  record(
    "D1-DIRECT-AUDIO-SEND",
    "Send direct audio-only message",
    directAudioSend.status === 201 && Boolean(directMessageId) && Boolean(directConversationId),
    `status=${directAudioSend.status}, convId=${directConversationId || "-"}`,
  );

  if (directAudioSend.status !== 201 || !directConversationId) {
    throw new Error("Cannot continue without direct conversation");
  }

  const ownerPreview = await getConversationPreviewWithRetry({
    token: owner.token,
    conversationId: directConversationId,
  });
  record(
    "D2-OWNER-PREVIEW-AUDIO",
    "Owner conversation preview shows voice fallback",
    ownerPreview.previewContent === VOICE_PREVIEW_CONTENT,
    `preview=${ownerPreview.previewContent || "-"}`,
  );

  const peerPreview = await getConversationPreviewWithRetry({
    token: peer.token,
    conversationId: directConversationId,
  });
  record(
    "D3-PEER-PREVIEW-AUDIO",
    "Peer conversation preview shows voice fallback",
    peerPreview.previewContent === VOICE_PREVIEW_CONTENT,
    `preview=${peerPreview.previewContent || "-"}`,
  );

  const followupText = await api("/messages/direct", {
    method: "POST",
    token: owner.token,
    body: {
      recipientId: peer.userId,
      conversationId: directConversationId,
      content: `remove-me-${runTag}`,
    },
  });

  const followupMessageId = String(followupText.data?.message?._id || "");

  record(
    "D4-SEND-TEXT-FOLLOWUP",
    "Send text message after audio",
    followupText.status === 201 && Boolean(followupMessageId),
    `status=${followupText.status}`,
  );

  if (followupText.status !== 201 || !followupMessageId) {
    throw new Error("Cannot continue without follow-up message id");
  }

  const removeForMe = await api(`/messages/${followupMessageId}/remove-for-me`, {
    method: "DELETE",
    token: peer.token,
  });

  const removePreview = String(removeForMe.data?.conversation?.lastMessage?.content || "");

  record(
    "D5-REMOVE-FOR-ME-PREVIEW",
    "remove-for-me returns voice preview when latest visible is audio",
    removeForMe.status === 200 && removePreview === VOICE_PREVIEW_CONTENT,
    `status=${removeForMe.status}, preview=${removePreview || "-"}`,
  );

  const peerPreviewAfterRemove = await getConversationPreviewWithRetry({
    token: peer.token,
    conversationId: directConversationId,
  });

  record(
    "D6-PEER-PREVIEW-AFTER-REMOVE",
    "Peer conversation list keeps voice preview after remove-for-me",
    peerPreviewAfterRemove.previewContent === VOICE_PREVIEW_CONTENT,
    `preview=${peerPreviewAfterRemove.previewContent || "-"}`,
  );

  const groupResponse = await createGroupConversation({
    ownerToken: owner.token,
    memberIds: [peer.userId],
    name: `Preview Audio Group ${runTag}`,
  });

  const groupConversationId = String(groupResponse.data?.conversation?._id || "");

  record(
    "G1-CREATE-GROUP",
    "Create group conversation",
    groupResponse.status === 201 && Boolean(groupConversationId),
    `status=${groupResponse.status}, groupId=${groupConversationId || "-"}`,
  );

  if (groupResponse.status !== 201 || !groupConversationId) {
    throw new Error("Cannot continue without group conversation");
  }

  const groupAudioSend = await api("/messages/group", {
    method: "POST",
    token: owner.token,
    body: {
      conversationId: groupConversationId,
      content: "",
      audioUrl: "https://example.com/smoke-audio-group.mp4",
    },
  });

  record(
    "G2-GROUP-AUDIO-SEND",
    "Send group audio-only message",
    groupAudioSend.status === 201,
    `status=${groupAudioSend.status}`,
  );

  const ownerGroupPreview = await getConversationPreviewWithRetry({
    token: owner.token,
    conversationId: groupConversationId,
  });

  record(
    "G3-OWNER-GROUP-PREVIEW",
    "Group conversation preview shows voice fallback",
    ownerGroupPreview.previewContent === VOICE_PREVIEW_CONTENT,
    `preview=${ownerGroupPreview.previewContent || "-"}`,
  );

  const failed = results.filter((item) => !item.pass);
  const passed = results.length - failed.length;
  console.log(`SUMMARY | passed=${passed} failed=${failed.length}`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
};

try {
  await run();
} catch (error) {
  console.error("SMOKE ERROR", error?.message || error);
  process.exitCode = 1;
}
