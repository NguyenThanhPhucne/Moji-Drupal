const base = process.env.SMOKE_API_BASE_URL || "http://127.0.0.1:5001/api";
const now = Date.now();
const smokePassword = `Smoke_${now}_Aa!`;

const users = {
  a: {
    username: `s3a_${now}`,
    password: smokePassword,
    email: `s3a_${now}@local.dev`,
    firstName: "S3",
    lastName: "A",
  },
  b: {
    username: `s3b_${now}`,
    password: smokePassword,
    email: `s3b_${now}@local.dev`,
    firstName: "S3",
    lastName: "B",
  },
};

const results = [];

const logResult = (id, pass, detail) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} | ${id} | ${detail}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const req = async (path, { method = "GET", token, body } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    json,
    headers: response.headers,
  };
};

const signupSignin = async (user) => {
  const signup = await req("/auth/signup", { method: "POST", body: user });
  if (signup.status !== 204) {
    throw new Error(`signup ${user.username} failed: ${signup.status}`);
  }

  const signin = await req("/auth/signin", {
    method: "POST",
    body: {
      username: user.username,
      password: user.password,
    },
  });

  if (signin.status !== 200 || !signin.json?.accessToken || !signin.json?.user?._id) {
    throw new Error(`signin ${user.username} failed: ${signin.status}`);
  }

  return {
    token: signin.json.accessToken,
    userId: signin.json.user._id,
  };
};

const befriend = async (from, to) => {
  const send = await req("/friends/requests", {
    method: "POST",
    token: from.token,
    body: { to: to.userId, message: "s3 smoke" },
  });

  if (send.status !== 201) {
    throw new Error(`send request failed: ${send.status}`);
  }

  const requests = await req("/friends/requests", { token: to.token });
  const incoming = requests.json?.received || [];
  const target = incoming.find(
    (request) => String(request.from?._id || "") === String(from.userId),
  );

  if (!target?._id) {
    throw new Error("incoming request not found");
  }

  const accept = await req(`/friends/requests/${target._id}/accept`, {
    method: "POST",
    token: to.token,
  });

  if (accept.status !== 200) {
    throw new Error(`accept request failed: ${accept.status}`);
  }
};

const sendDirectWithRetry = async ({
  senderToken,
  recipientId,
  conversationId,
  content,
  maxAttempts = 6,
}) => {
  let lastResponse = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await req("/messages/direct", {
      method: "POST",
      token: senderToken,
      body: {
        recipientId,
        ...(conversationId ? { conversationId } : {}),
        content,
      },
    });

    lastResponse = response;

    if (response.status !== 429) {
      return response;
    }

    const retryAfterSeconds = Number(response.headers.get("retry-after") || "1");
    const waitMs = Math.max(1000, (Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 1) * 1000 + 150);
    await sleep(waitMs);
  }

  return lastResponse;
};

const fetchMessagesPage = async ({ token, conversationId, limit, cursor }) => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) {
    params.set("cursor", cursor);
  }

  return req(`/conversations/${conversationId}/messages?${params.toString()}`, {
    token,
  });
};

const seedMessagesForPagination = async ({ a, b, conversationId }) => {
  const parallelSeed = [];

  for (let i = 0; i < 4; i += 1) {
    parallelSeed.push(
      sendDirectWithRetry({
        senderToken: a.token,
        recipientId: b.userId,
        conversationId,
        content: `s3 A burst ${i} ${now}`,
      }),
      sendDirectWithRetry({
        senderToken: b.token,
        recipientId: a.userId,
        conversationId,
        content: `s3 B burst ${i} ${now}`,
      }),
    );
  }

  return Promise.all(parallelSeed);
};

const runPaginationChecks = async ({ a, b, conversationId }) => {
  const seedResponses = await seedMessagesForPagination({ a, b, conversationId });
  const seedOk = seedResponses.every((response) => response.status === 201);
  logResult(
    "S3-SEED-MESSAGES",
    seedOk,
    `created=${seedResponses.filter((response) => response.status === 201).length}/${seedResponses.length}`,
  );

  const paginationPageSize = 4;
  const allFetchedIds = [];
  const seenCursorValues = [];
  let cursor = "";
  let pagesFetched = 0;
  let paginationHasError = false;

  while (pagesFetched < 12) {
    const pageResponse = await fetchMessagesPage({
      token: a.token,
      conversationId,
      limit: paginationPageSize,
      cursor: cursor || undefined,
    });

    if (pageResponse.status !== 200) {
      paginationHasError = true;
      logResult(
        `S3-PAGINATION-PAGE-${pagesFetched + 1}`,
        false,
        `status=${pageResponse.status}`,
      );
      break;
    }

    const pageMessages = Array.isArray(pageResponse.json?.messages)
      ? pageResponse.json.messages
      : [];
    const pageIds = pageMessages
      .map((message) => String(message?._id || ""))
      .filter(Boolean);
    const uniqueInPage = new Set(pageIds);
    const pagePass =
      pageMessages.length <= paginationPageSize &&
      pageIds.length === uniqueInPage.size;

    logResult(
      `S3-PAGINATION-PAGE-${pagesFetched + 1}`,
      pagePass,
      `items=${pageMessages.length}`,
    );

    allFetchedIds.push(...pageIds);

    const nextCursor = pageResponse.json?.nextCursor;
    if (typeof nextCursor === "string" && nextCursor.length > 0) {
      seenCursorValues.push(nextCursor);
      cursor = nextCursor;
    } else {
      break;
    }

    pagesFetched += 1;
  }

  const uniqueAcrossPages = new Set(allFetchedIds);
  logResult(
    "S3-PAGINATION-NO-DUPLICATES",
    !paginationHasError && uniqueAcrossPages.size === allFetchedIds.length,
    `unique=${uniqueAcrossPages.size},total=${allFetchedIds.length}`,
  );

  const compositeCursorDetected = seenCursorValues.some(
    (value) => value.includes("|") && value.split("|").length === 2,
  );
  logResult(
    "S3-PAGINATION-COMPOSITE-CURSOR",
    compositeCursorDetected,
    `sample=${seenCursorValues[0] || "none"}`,
  );

  if (seenCursorValues.length > 0) {
    const dateOnlyCursor = seenCursorValues[0].split("|")[0];
    const legacyCursorResponse = await fetchMessagesPage({
      token: a.token,
      conversationId,
      limit: paginationPageSize,
      cursor: dateOnlyCursor,
    });

    logResult(
      "S3-PAGINATION-LEGACY-CURSOR",
      legacyCursorResponse.status === 200,
      `status=${legacyCursorResponse.status}`,
    );
  } else {
    logResult("S3-PAGINATION-LEGACY-CURSOR", false, "no cursor emitted");
  }
};

const runRemoveForMeConcurrencyChecks = async ({ a, b, conversationId }) => {
  const markerResponse = await sendDirectWithRetry({
    senderToken: a.token,
    recipientId: b.userId,
    conversationId,
    content: `s3 remove-for-me marker ${now}`,
  });

  const markerMessageId = markerResponse.json?.message?._id;
  logResult(
    "S3-REMOVE-FOR-ME-MARKER",
    markerResponse.status === 201 && !!markerMessageId,
    `status=${markerResponse.status}`,
  );

  if (!markerMessageId) {
    throw new Error("cannot continue without marker message id");
  }

  const removeResponses = await Promise.all(
    Array.from({ length: 10 }, () =>
      req(`/messages/${markerMessageId}/remove-for-me`, {
        method: "DELETE",
        token: b.token,
      }),
    ),
  );

  const removeStatusesOk = removeResponses.every((response) => response.status === 200);
  const alreadyHiddenCount = removeResponses.filter(
    (response) => response.json?.alreadyHidden === true,
  ).length;

  logResult(
    "S3-REMOVE-FOR-ME-CONCURRENCY-STATUS",
    removeStatusesOk,
    `statuses=${removeResponses.map((response) => response.status).join(",")}`,
  );

  logResult(
    "S3-REMOVE-FOR-ME-IDEMPOTENT",
    alreadyHiddenCount > 0,
    `alreadyHiddenCount=${alreadyHiddenCount}`,
  );

  const visibleForReceiver = await fetchMessagesPage({
    token: b.token,
    conversationId,
    limit: 50,
  });
  const receiverHasMarker = (visibleForReceiver.json?.messages || []).some(
    (message) => String(message?._id || "") === String(markerMessageId),
  );

  logResult(
    "S3-REMOVE-FOR-ME-HIDDEN-FOR-RECEIVER",
    visibleForReceiver.status === 200 && !receiverHasMarker,
    `status=${visibleForReceiver.status},present=${receiverHasMarker}`,
  );

  const visibleForSender = await fetchMessagesPage({
    token: a.token,
    conversationId,
    limit: 50,
  });
  const senderHasMarker = (visibleForSender.json?.messages || []).some(
    (message) => String(message?._id || "") === String(markerMessageId),
  );

  logResult(
    "S3-REMOVE-FOR-ME-STILL-VISIBLE-FOR-SENDER",
    visibleForSender.status === 200 && senderHasMarker,
    `status=${visibleForSender.status},present=${senderHasMarker}`,
  );
};

const run = async () => {
  try {
    const a = await signupSignin(users.a);
    const b = await signupSignin(users.b);

    await befriend(a, b);

    const firstSend = await sendDirectWithRetry({
      senderToken: a.token,
      recipientId: b.userId,
      content: `s3 init ${now}`,
    });

    const conversationId = firstSend.json?.message?.conversationId;
    logResult(
      "S3-SETUP-CONVERSATION",
      firstSend.status === 201 && !!conversationId,
      `status=${firstSend.status}`,
    );

    if (!conversationId) {
      throw new Error("cannot continue without conversationId");
    }

    await runPaginationChecks({ a, b, conversationId });
    await runRemoveForMeConcurrencyChecks({ a, b, conversationId });

    const failCount = results.filter((entry) => !entry.pass).length;
    console.log(
      "SUMMARY",
      JSON.stringify({ total: results.length, fail: failCount }, null, 2),
    );

    process.exitCode = failCount > 0 ? 1 : 0;
  } catch (error) {
    console.error("SMOKE ERROR", error?.message || error);
    process.exitCode = 1;
  }
};

await run();
