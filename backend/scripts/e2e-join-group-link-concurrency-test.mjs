const args = process.argv.slice(2);

const readArg = (name, fallback = "") => {
  const flag = `--${name}`;
  const exactIndex = args.indexOf(flag);
  if (exactIndex !== -1) {
    return args[exactIndex + 1] ?? fallback;
  }

  const inline = args.find((value) => value.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }

  return fallback;
};

const baseUrl =
  readArg("base", process.env.BASE_URL || "http://localhost:5001/api") ||
  "http://localhost:5001/api";
const username = readArg("username", process.env.TEST_USERNAME || "");
const password = readArg("password", process.env.TEST_PASSWORD || "");
const conversationId = readArg("conversation-id", process.env.CONVERSATION_ID || "");
const joinToken = readArg("token", process.env.JOIN_TOKEN || "");
const parallel = Math.max(
  2,
  Number.parseInt(readArg("parallel", process.env.PARALLEL || "20"), 10) || 20,
);

const printUsage = () => {
  console.log(
    [
      "Usage:",
      "  node scripts/e2e-join-group-link-concurrency-test.mjs \\",
      "    --username <username> --password <password> \\",
      "    --conversation-id <conversationId> --token <joinToken> [--parallel 20] [--base http://localhost:5001/api]",
      "",
      "You can also pass values via env:",
      "  BASE_URL, TEST_USERNAME, TEST_PASSWORD, CONVERSATION_ID, JOIN_TOKEN, PARALLEL",
    ].join("\n"),
  );
};

if (!username || !password || !conversationId || !joinToken) {
  printUsage();
  process.exit(1);
}

const requestJson = async ({ url, method = "GET", token, body }) => {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
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
  } catch (error) {
    return {
      status: 0,
      ok: false,
      data: null,
      error: String(error?.message || error),
    };
  }
};

const fetchConversationForUser = async ({ token, targetConversationId }) => {
  const response = await requestJson({
    url: `${baseUrl}/conversations`,
    method: "GET",
    token,
  });

  if (!response.ok || !Array.isArray(response.data?.conversations)) {
    return {
      response,
      conversation: null,
    };
  }

  const conversation = response.data.conversations.find(
    (item) => String(item?._id) === String(targetConversationId),
  );

  return {
    response,
    conversation: conversation || null,
  };
};

const countUserEntries = (participants, userId) => {
  if (!Array.isArray(participants)) {
    return 0;
  }

  return participants.filter((participant) => String(participant?._id) === String(userId)).length;
};

const signInResult = await requestJson({
  url: `${baseUrl}/auth/signin`,
  method: "POST",
  body: {
    username,
    password,
  },
});

if (!signInResult.ok || !signInResult.data?.accessToken || !signInResult.data?.user?._id) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        step: "signin",
        detail: signInResult,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const accessToken = signInResult.data.accessToken;
const currentUserId = signInResult.data.user._id;

const beforeState = await fetchConversationForUser({
  token: accessToken,
  targetConversationId: conversationId,
});

const beforeParticipants = beforeState.conversation?.participants || [];
const beforeParticipantIds = beforeParticipants.map((participant) => String(participant?._id || ""));
const beforeUniqueCount = new Set(beforeParticipantIds).size;
const beforeDuplicateCount = beforeParticipantIds.length - beforeUniqueCount;
const beforeUserEntryCount = countUserEntries(beforeParticipants, currentUserId);

const joinRequests = await Promise.all(
  Array.from({ length: parallel }, (_, index) =>
    requestJson({
      url: `${baseUrl}/conversations/${conversationId}/join-by-link`,
      method: "POST",
      token: accessToken,
      body: { token: joinToken },
    }).then((result) => ({
      index: index + 1,
      ...result,
      alreadyJoined: result?.data?.alreadyJoined,
      message: result?.data?.message,
    })),
  ),
);

const afterState = await fetchConversationForUser({
  token: accessToken,
  targetConversationId: conversationId,
});

const afterParticipants = afterState.conversation?.participants || [];
const afterParticipantIds = afterParticipants.map((participant) => String(participant?._id || ""));
const afterUniqueCount = new Set(afterParticipantIds).size;
const afterDuplicateCount = afterParticipantIds.length - afterUniqueCount;
const afterUserEntryCount = countUserEntries(afterParticipants, currentUserId);

const statusHistogram = joinRequests.reduce((acc, item) => {
  const key = String(item.status);
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const transportErrors = joinRequests.filter((item) => item.status === 0).length;
const serverErrors = joinRequests.filter((item) => item.status >= 500).length;
const successResponses = joinRequests.filter((item) => item.status === 200).length;
const joinedNowResponses = joinRequests.filter(
  (item) => item.status === 200 && item.alreadyJoined === false,
).length;
const alreadyJoinedResponses = joinRequests.filter(
  (item) => item.status === 200 && item.alreadyJoined === true,
).length;

const expectedAfterUserEntryCount = beforeUserEntryCount > 0 ? beforeUserEntryCount : 1;
const userEntryCountValid =
  beforeUserEntryCount > 0
    ? afterUserEntryCount === beforeUserEntryCount
    : afterUserEntryCount === expectedAfterUserEntryCount;

const ok =
  transportErrors === 0 &&
  serverErrors === 0 &&
  beforeDuplicateCount === 0 &&
  afterDuplicateCount === 0 &&
  userEntryCountValid &&
  successResponses > 0;

const summary = {
  ok,
  config: {
    baseUrl,
    conversationId,
    username,
    parallel,
  },
  user: {
    userId: currentUserId,
  },
  before: {
    conversationVisible: Boolean(beforeState.conversation),
    participantCount: beforeParticipants.length,
    duplicateParticipantCount: beforeDuplicateCount,
    userEntryCount: beforeUserEntryCount,
  },
  requests: {
    total: joinRequests.length,
    statusHistogram,
    transportErrors,
    serverErrors,
    successResponses,
    joinedNowResponses,
    alreadyJoinedResponses,
  },
  after: {
    conversationVisible: Boolean(afterState.conversation),
    participantCount: afterParticipants.length,
    duplicateParticipantCount: afterDuplicateCount,
    userEntryCount: afterUserEntryCount,
  },
  notes: {
    expectation:
      beforeUserEntryCount > 0
        ? "User existed before test; expected user entry count to stay unchanged"
        : "User did not exist before test; expected exactly one user entry after concurrent joins",
  },
};

console.log(JSON.stringify(summary, null, 2));

if (!ok) {
  process.exit(1);
}
