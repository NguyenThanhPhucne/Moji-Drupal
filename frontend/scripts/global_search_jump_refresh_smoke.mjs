#!/usr/bin/env node

import { chromium } from "playwright";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://127.0.0.1:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:5001/api";
const TEST_PASSWORD =
  process.env.SMOKE_TEST_PASSWORD ||
  `SearchJump-${Math.random().toString(36).slice(2, 9)}-Pw!`;

const runTag = Date.now();

const users = {
  owner: {
    username: `searchjump_owner_${runTag}`,
    password: TEST_PASSWORD,
    email: `searchjump_owner_${runTag}@local.dev`,
    firstName: "Search",
    lastName: "Owner",
  },
  peer: {
    username: `searchjump_peer_${runTag}`,
    password: TEST_PASSWORD,
    email: `searchjump_peer_${runTag}@local.dev`,
    firstName: "Search",
    lastName: "Peer",
  },
  alt: {
    username: `searchjump_alt_${runTag}`,
    password: TEST_PASSWORD,
    email: `searchjump_alt_${runTag}@local.dev`,
    firstName: "Search",
    lastName: "Alt",
  },
};

const results = [];

const record = (id, title, pass, detail) => {
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

const trimTrailingSlashes = (value) => String(value || "").replace(/\/+$/, "");

const getErrorMessage = (error) => {
  if (!error) {
    return "unknown error";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const pingUrl = async (url, timeoutMs = 7000) => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    return {
      ok: response.ok,
      status: response.status,
      detail: `status=${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      detail: `error=${getErrorMessage(error)}`,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const assertServiceReady = async () => {
  const apiRoot = trimTrailingSlashes(API_BASE_URL).replace(/\/api$/, "");
  const appRoot = trimTrailingSlashes(APP_BASE_URL);

  const apiProbeUrl = `${apiRoot}/api-docs/`;
  const appProbeUrl = `${appRoot}/`;

  const apiProbe = await pingUrl(apiProbeUrl);
  record(
    "PRECHECK-API",
    "Backend API is reachable",
    apiProbe.ok,
    `${apiProbe.detail} url=${apiProbeUrl}`,
  );

  if (!apiProbe.ok) {
    throw new Error(
      `Backend API is not reachable at ${apiProbeUrl}. ${apiProbe.detail}`,
    );
  }

  const appProbe = await pingUrl(appProbeUrl);
  record(
    "PRECHECK-APP",
    "Frontend app is reachable",
    appProbe.ok,
    `${appProbe.detail} url=${appProbeUrl}`,
  );

  if (!appProbe.ok) {
    throw new Error(
      `Frontend app is not reachable at ${appProbeUrl}. ${appProbe.detail}`,
    );
  }
};

const req = async (
  path,
  {
    method = "GET",
    token,
    body,
    retry429 = true,
    retriesLeft = 4,
  } = {},
) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
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

  if (retry429 && response.status === 429 && retriesLeft > 0) {
    const retryAfterHeader = Number(response.headers.get("retry-after") || "1");
    const retryAfterBody = Number(data?.retryAfterSeconds || 0);
    let retryAfterSeconds = 1;

    if (Number.isFinite(retryAfterBody) && retryAfterBody > 0) {
      retryAfterSeconds = retryAfterBody;
    } else if (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) {
      retryAfterSeconds = retryAfterHeader;
    }

    await wait(Math.max(1000, retryAfterSeconds * 1000 + 150));

    return req(path, {
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
    headers: response.headers,
  };
};

const signupAndSignin = async (label, payload) => {
  const signup = await req("/auth/signup", {
    method: "POST",
    body: payload,
  });

  record(
    `SETUP-SIGNUP-${label}`,
    `Signup ${label}`,
    signup.status === 204,
    `status=${signup.status}`,
  );

  if (signup.status !== 204) {
    throw new Error(`Signup failed for ${label}: ${signup.status}`);
  }

  const signin = await req("/auth/signin", {
    method: "POST",
    body: {
      username: payload.username,
      password: payload.password,
    },
  });

  const signedIn =
    signin.status === 200 &&
    Boolean(signin.data?.accessToken) &&
    Boolean(signin.data?.user?._id);

  record(
    `SETUP-SIGNIN-${label}`,
    `Signin ${label}`,
    signedIn,
    `status=${signin.status}`,
  );

  if (!signedIn) {
    throw new Error(`Signin failed for ${label}: ${signin.status}`);
  }

  return {
    token: signin.data.accessToken,
    user: signin.data.user,
    userId: String(signin.data.user._id),
    username: payload.username,
    password: payload.password,
  };
};

const befriendUsers = async ({
  owner,
  peer,
  recordPrefix = "SETUP-FRIEND",
  titleSuffix = "",
}) => {
  const sent = await req("/friends/requests", {
    method: "POST",
    token: owner.token,
    body: {
      to: peer.userId,
      message: `search jump smoke ${runTag}`,
    },
  });

  record(
    `${recordPrefix}-REQUEST`,
    `Send friend request${titleSuffix}`,
    sent.status === 201,
    `status=${sent.status}`,
  );

  if (sent.status !== 201) {
    throw new Error(`Send friend request failed: ${sent.status}`);
  }

  const pendingList = await req("/friends/requests", {
    method: "GET",
    token: peer.token,
  });

  const received = Array.isArray(pendingList.data?.received)
    ? pendingList.data.received
    : [];

  const pending = received.find(
    (entry) => String(entry?.from?._id || "") === String(owner.userId),
  );

  if (!pending?._id) {
    throw new Error("Pending friend request not found");
  }

  const accepted = await req(`/friends/requests/${pending._id}/accept`, {
    method: "POST",
    token: peer.token,
  });

  record(
    `${recordPrefix}-ACCEPT`,
    `Accept friend request${titleSuffix}`,
    accepted.status === 200,
    `status=${accepted.status}`,
  );

  if (accepted.status !== 200) {
    throw new Error(`Accept friend request failed: ${accepted.status}`);
  }
};

const sendDirect = async ({ senderToken, recipientId, conversationId, content }) => {
  return req("/messages/direct", {
    method: "POST",
    token: senderToken,
    body: {
      recipientId,
      ...(conversationId ? { conversationId } : {}),
      content,
    },
  });
};

const getDirectConversationId = async ({ token, peerUserId }) => {
  const conversationsRes = await req("/conversations", { token });

  if (conversationsRes.status !== 200) {
    throw new Error(`Fetch conversations failed: ${conversationsRes.status}`);
  }

  const conversations = Array.isArray(conversationsRes.data?.conversations)
    ? conversationsRes.data.conversations
    : [];

  const directConversation = conversations.find((conversation) => {
    if (conversation?.type !== "direct") {
      return false;
    }

    const participants = Array.isArray(conversation?.participants)
      ? conversation.participants
      : [];

    return participants.some((participant) => {
      const participantId =
        typeof participant === "string"
          ? participant
          : participant?._id || participant?.id;

      return String(participantId || "") === String(peerUserId);
    });
  });

  return String(directConversation?._id || "");
};

const resolveMessageIdFromGlobalSearch = async ({ token, conversationId, query }) => {
  const searchResponse = await req(`/search/global?q=${encodeURIComponent(query)}`, {
    token,
  });

  if (searchResponse.status !== 200) {
    return { found: false, status: searchResponse.status, messageId: "" };
  }

  const messageResults = Array.isArray(searchResponse.data?.messages)
    ? searchResponse.data.messages
    : [];

  const match = messageResults.find((messageItem) => {
    const sameConversation =
      String(messageItem?.conversationId || "") === String(conversationId);
    const content = String(messageItem?.content || "").toLowerCase();
    return sameConversation && content.includes(String(query).toLowerCase());
  });

  if (match?.messageId) {
    return {
      found: true,
      status: 200,
      messageId: String(match.messageId),
    };
  }

  return { found: false, status: 200, messageId: "" };
};

let browser;

try {
  await assertServiceReady();

  const owner = await signupAndSignin("OWNER", users.owner);
  const peer = await signupAndSignin("PEER", users.peer);
  const alt = await signupAndSignin("ALT", users.alt);

  const altDisplayName = String(
    alt.user?.displayName || `${users.alt.firstName} ${users.alt.lastName}`,
  );

  await befriendUsers({ owner, peer });
  await befriendUsers({
    owner,
    peer: alt,
    recordPrefix: "SETUP-FRIEND-ALT",
    titleSuffix: " (ALT)",
  });

  const oldMarkerContent = `GSJUMP_OLD_${runTag}`;

  const seedFirst = await sendDirect({
    senderToken: peer.token,
    recipientId: owner.userId,
    content: oldMarkerContent,
  });

  record(
    "SETUP-SEED-FIRST",
    "Seed oldest target message",
    seedFirst.status === 201,
    `status=${seedFirst.status}`,
  );

  if (seedFirst.status !== 201) {
    throw new Error(`Cannot seed oldest message: ${seedFirst.status}`);
  }

  const conversationId = await getDirectConversationId({
    token: owner.token,
    peerUserId: peer.userId,
  });

  record(
    "SETUP-CONVERSATION",
    "Resolve direct conversation",
    Boolean(conversationId),
    conversationId ? `conversationId=${conversationId}` : "not found",
  );

  if (!conversationId) {
    throw new Error("Cannot resolve direct conversation");
  }

  const secondaryMarkerContent = `SIDEBAR_ALT_${runTag}`;
  const seedSecondary = await sendDirect({
    senderToken: alt.token,
    recipientId: owner.userId,
    content: secondaryMarkerContent,
  });

  record(
    "SETUP-SECONDARY-SEED",
    "Seed secondary direct conversation",
    seedSecondary.status === 201,
    `status=${seedSecondary.status}`,
  );

  if (seedSecondary.status !== 201) {
    throw new Error(`Cannot seed secondary conversation: ${seedSecondary.status}`);
  }

  const secondaryConversationId = await getDirectConversationId({
    token: owner.token,
    peerUserId: alt.userId,
  });

  record(
    "SETUP-SECONDARY-CONVERSATION",
    "Resolve secondary direct conversation",
    Boolean(secondaryConversationId),
    secondaryConversationId
      ? `conversationId=${secondaryConversationId}`
      : "not found",
  );

  if (!secondaryConversationId) {
    throw new Error("Cannot resolve secondary direct conversation");
  }

  const fillerCount = 52;
  let fillerOkCount = 0;
  for (let i = 0; i < fillerCount; i += 1) {
    const sender = i % 2 === 0 ? owner : peer;
    const recipientId = i % 2 === 0 ? peer.userId : owner.userId;

    const response = await sendDirect({
      senderToken: sender.token,
      recipientId,
      conversationId,
      content: `GSJUMP_FILL_${i}_${runTag}`,
    });

    if (response.status === 201) {
      fillerOkCount += 1;
    }
  }

  record(
    "SETUP-FILLER",
    "Seed filler messages",
    fillerOkCount === fillerCount,
    `created=${fillerOkCount}/${fillerCount}`,
  );

  if (fillerOkCount !== fillerCount) {
    throw new Error(`Cannot seed filler messages completely: ${fillerOkCount}/${fillerCount}`);
  }

  const oldMessageLookup = await resolveMessageIdFromGlobalSearch({
    token: owner.token,
    conversationId,
    query: oldMarkerContent,
  });

  record(
    "SETUP-LOCATE-OLD",
    "Locate old target message ID",
    oldMessageLookup.found && Boolean(oldMessageLookup.messageId),
    oldMessageLookup.found ? `messageId=${oldMessageLookup.messageId}` : `status=${oldMessageLookup.status}`,
  );

  if (!oldMessageLookup.found || !oldMessageLookup.messageId) {
    throw new Error("Cannot find old target message by content");
  }

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addInitScript(({ accessToken, user }) => {
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({
        state: {
          accessToken,
          user,
        },
        version: 0,
      }),
    );
  }, {
    accessToken: owner.token,
    user: owner.user,
  });
  const page = await context.newPage();

  await page.goto(`${APP_BASE_URL}/?conversationId=${conversationId}`, {
    waitUntil: "domcontentloaded",
  });

  await page.waitForFunction(
    async (targetConversationId) => {
      const { useChatStore } = await import("./src/stores/useChatStore.ts");
      const state = useChatStore.getState();

      const hasConversation = (state.conversations || []).some(
        (conversation) => String(conversation?._id || "") === String(targetConversationId),
      );

      if (!hasConversation) {
        await state.fetchConversations();
      }

      const refreshedState = useChatStore.getState();
      const hasConversationAfterFetch = (refreshedState.conversations || []).some(
        (conversation) => String(conversation?._id || "") === String(targetConversationId),
      );

      if (!hasConversationAfterFetch) {
        return false;
      }

      if (String(refreshedState.activeConversationId || "") !== String(targetConversationId)) {
        refreshedState.setActiveConversation(String(targetConversationId));
      }

      const stateAfterSelect = useChatStore.getState();
      if ((stateAfterSelect.messages?.[targetConversationId]?.items?.length || 0) <= 0) {
        await stateAfterSelect.fetchMessages(String(targetConversationId));
      }

      return String(useChatStore.getState().activeConversationId || "") === String(targetConversationId);
    },
    conversationId,
    { timeout: 30000 },
  );

  const bootstrapState = await page.evaluate(async (targetConversationId) => {
    const { useAuthStore } = await import("./src/stores/useAuthStore.ts");
    const { useChatStore } = await import("./src/stores/useChatStore.ts");

    const chatState = useChatStore.getState();
    const authState = useAuthStore.getState();

    return {
      path: globalThis.location.pathname,
      hasAccessToken: Boolean(authState.accessToken),
      hasUser: Boolean(authState.user?._id),
      activeConversationId: String(chatState.activeConversationId || ""),
      hasTargetConversation: (chatState.conversations || []).some(
        (conversation) =>
          String(conversation?._id || "") === String(targetConversationId),
      ),
    };
  }, conversationId);

  record(
    "UI-BOOTSTRAP-STATE",
    "Chat page is authenticated and target conversation is active",
    bootstrapState.path !== "/signin" &&
      bootstrapState.hasAccessToken &&
      bootstrapState.hasUser &&
      bootstrapState.hasTargetConversation,
    JSON.stringify(bootstrapState),
  );

  const composer = page.getByRole("textbox", { name: "Message input" });
  await composer.waitFor({ state: "visible", timeout: 20000 });

  const draftText = `DRAFT_PERSIST_${runTag}`;
  await composer.fill(draftText);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .getByRole("textbox", { name: "Message input" })
    .waitFor({ state: "visible", timeout: 20000 });
  const draftAfterReload = await page
    .getByRole("textbox", { name: "Message input" })
    .inputValue();

  record(
    "UI-DRAFT-PERSIST",
    "Draft persists after refresh",
    draftAfterReload === draftText,
    `value=${draftAfterReload}`,
  );

  const loadedBeforeJump = await page.evaluate(async ({ targetConversationId, targetMessageId }) => {
    const { useChatStore } = await import("./src/stores/useChatStore.ts");
    const items = useChatStore.getState().messages?.[targetConversationId]?.items || [];
    return items.some((message) => String(message?._id || "") === String(targetMessageId));
  }, {
    targetConversationId: conversationId,
    targetMessageId: oldMessageLookup.messageId,
  });

  record(
    "UI-PRECONDITION-PAGINATION",
    "Target message is not in initial loaded page",
    !loadedBeforeJump,
    `loadedBeforeJump=${loadedBeforeJump}`,
  );

  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });

  const searchInput = page.getByRole("textbox", { name: "Global search" });
  await searchInput.waitFor({ state: "visible", timeout: 8000 });
  await searchInput.fill(oldMarkerContent);

  const searchDialog = page.getByRole("dialog");
  const messageResultButton = searchDialog
    .locator("button")
    .filter({ hasText: oldMarkerContent })
    .first();

  await messageResultButton.waitFor({ state: "visible", timeout: 15000 });
  await messageResultButton.click();

  await searchInput.waitFor({ state: "hidden", timeout: 10000 });

  await page.waitForFunction(
    async ({ targetConversationId, targetMessageId }) => {
      const url = new URL(globalThis.location.href);
      if (String(url.searchParams.get("conversationId") || "") !== String(targetConversationId)) {
        return false;
      }

      if (url.searchParams.get("messageId")) {
        return false;
      }

      const { useChatStore } = await import("./src/stores/useChatStore.ts");
      const state = useChatStore.getState();
      const messageItems = state.messages?.[targetConversationId]?.items || [];

      return (
        String(state.activeConversationId || "") === String(targetConversationId) &&
        messageItems.some((message) => String(message?._id || "") === String(targetMessageId))
      );
    },
    {
      targetConversationId: conversationId,
      targetMessageId: oldMessageLookup.messageId,
    },
    { timeout: 35000 },
  );

  record(
    "UI-SEARCH-JUMP",
    "Global search jumps to exact old message",
    true,
    `messageId=${oldMessageLookup.messageId}`,
  );

  const sidebarSyncGhostMessageId = `ghost_sidebar_${runTag}`;
  await page.goto(
    `${APP_BASE_URL}/?conversationId=${conversationId}&messageId=${sidebarSyncGhostMessageId}`,
    { waitUntil: "domcontentloaded" },
  );

  const secondaryConversationButton = page
    .getByRole("button", {
      name: `Open conversation with ${altDisplayName}`,
    })
    .first();

  await secondaryConversationButton.waitFor({ state: "visible", timeout: 15000 });
  await secondaryConversationButton.click();

  await page.waitForFunction(
    async ({ targetConversationId }) => {
      const url = new URL(globalThis.location.href);

      if (
        String(url.searchParams.get("conversationId") || "") !==
        String(targetConversationId)
      ) {
        return false;
      }

      if (url.searchParams.get("messageId")) {
        return false;
      }

      const { useChatStore } = await import("./src/stores/useChatStore.ts");
      return (
        String(useChatStore.getState().activeConversationId || "") ===
        String(targetConversationId)
      );
    },
    { targetConversationId: secondaryConversationId },
    { timeout: 25000 },
  );

  record(
    "UI-SIDEBAR-URL-SYNC",
    "Sidebar card click syncs conversation URL and clears stale messageId",
    true,
    `conversationId=${secondaryConversationId}`,
  );

  const missingMessageId = `missing_${runTag}`;
  await page.goto(
    `${APP_BASE_URL}/?conversationId=${conversationId}&messageId=${missingMessageId}`,
    { waitUntil: "domcontentloaded" },
  );

  await page.getByText("Couldn't locate that message").first().waitFor({
    state: "visible",
    timeout: 15000,
  });

  await page.waitForFunction(() => {
    const url = new URL(globalThis.location.href);
    return !url.searchParams.get("messageId");
  }, { timeout: 12000 });

  record(
    "UI-MISSING-MESSAGE-FALLBACK",
    "Old or missing message shows fallback and clears messageId",
    true,
    "toast-visible-and-messageId-cleared",
  );

  await context.close();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  record("FATAL", "Global search jump + draft persistence smoke", false, message);
} finally {
  if (browser) {
    await browser.close();
  }

  const failed = results.filter((item) => !item.pass);
  console.log("\n========== SUMMARY ==========");
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${results.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}
