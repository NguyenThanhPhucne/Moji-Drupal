#!/usr/bin/env node

import { chromium } from "playwright";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:5001/api";
const TEST_PASSWORD =
  process.env.SMOKE_TEST_PASSWORD ||
  `SavedScale-${Math.random().toString(36).slice(2, 9)}-Pw!`;
const MESSAGE_COUNT = Math.max(
  40,
  Number.parseInt(process.env.SAVED_SMOKE_MESSAGE_COUNT || "64", 10) || 64,
);
const PAGE_LIMIT = 30;

const runTag = Date.now();
const BULK_TAG = `bulkremove_${runTag}`;
const SEARCH_NEEDLE = `needle_saved_scale_${runTag}`;

const users = {
  owner: {
    username: `savedscale_owner_${runTag}`,
    password: TEST_PASSWORD,
    email: `savedscale_owner_${runTag}@local.dev`,
    firstName: "Saved",
    lastName: "Owner",
  },
  peer: {
    username: `savedscale_peer_${runTag}`,
    password: TEST_PASSWORD,
    email: `savedscale_peer_${runTag}@local.dev`,
    firstName: "Saved",
    lastName: "Peer",
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
  };
};

const befriendUsers = async ({ owner, peer }) => {
  const sent = await req("/friends/requests", {
    method: "POST",
    token: owner.token,
    body: {
      to: peer.userId,
      message: `saved scale smoke ${runTag}`,
    },
  });

  record(
    "SETUP-FRIEND-REQUEST",
    "Send friend request",
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
    "SETUP-FRIEND-ACCEPT",
    "Accept friend request",
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

const parseSavedResultsMetaText = (rawText) => {
  const text = String(rawText || "");
  const matched = text.match(/Showing\s+([\d,]+)\s+of\s+([\d,]+)\s+saved messages/i);

  if (!matched) {
    return {
      visible: 0,
      total: 0,
      ok: false,
    };
  }

  const visible = Number.parseInt(String(matched[1]).replaceAll(",", ""), 10) || 0;
  const total = Number.parseInt(String(matched[2]).replaceAll(",", ""), 10) || 0;

  return {
    visible,
    total,
    ok: visible >= 0 && total >= 0,
  };
};

const readSavedResultsMeta = async (page) => {
  const metaLabel = page.locator(".saved-results-meta span").first();
  await metaLabel.waitFor({ state: "visible", timeout: 20000 });
  const text = await metaLabel.textContent();
  return parseSavedResultsMetaText(text);
};

let browser;

try {
  await assertServiceReady();

  const owner = await signupAndSignin("OWNER", users.owner);
  const peer = await signupAndSignin("PEER", users.peer);

  await befriendUsers({ owner, peer });

  const sentMessageIds = [];

  const firstSeed = await sendDirect({
    senderToken: peer.token,
    recipientId: owner.userId,
    content: `SAVED_SCALE_BOOT_${runTag}`,
  });

  record(
    "SETUP-SEED-FIRST",
    "Create first direct message",
    firstSeed.status === 201 && Boolean(firstSeed.data?.message?._id),
    `status=${firstSeed.status}`,
  );

  if (firstSeed.status !== 201 || !firstSeed.data?.message?._id) {
    throw new Error(`Cannot create first direct message: ${firstSeed.status}`);
  }

  sentMessageIds.push(String(firstSeed.data.message._id));

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

  let sentOkCount = 1;
  for (let index = 1; index < MESSAGE_COUNT; index += 1) {
    const content =
      index === Math.floor(MESSAGE_COUNT / 2)
        ? `${SEARCH_NEEDLE} content marker`
        : `SAVED_SCALE_MSG_${runTag}_${index}`;

    const sent = await sendDirect({
      senderToken: peer.token,
      recipientId: owner.userId,
      conversationId,
      content,
    });

    if (sent.status === 201 && sent.data?.message?._id) {
      sentMessageIds.push(String(sent.data.message._id));
      sentOkCount += 1;
    }
  }

  record(
    "SETUP-SEED-MESSAGES",
    "Seed direct messages for large saved dataset",
    sentOkCount === MESSAGE_COUNT,
    `created=${sentOkCount}/${MESSAGE_COUNT}`,
  );

  if (sentOkCount !== MESSAGE_COUNT) {
    throw new Error(`Cannot seed all messages: ${sentOkCount}/${MESSAGE_COUNT}`);
  }

  let bookmarkedOkCount = 0;
  for (let index = 0; index < sentMessageIds.length; index += 1) {
    const messageId = sentMessageIds[index];
    const tags = ["scale-smoke"];
    if (index >= sentMessageIds.length - 2) {
      tags.push(BULK_TAG);
    }

    const collections = [
      index % 2 === 0 ? "scale-even" : "scale-odd",
      "scale-smoke",
    ];

    const toggled = await req(`/bookmarks/${messageId}/toggle`, {
      method: "POST",
      token: owner.token,
      body: {
        note: index % 5 === 0 ? `scale-note-${runTag}-${index}` : "",
        tags,
        collections,
      },
    });

    if (toggled.status === 201) {
      bookmarkedOkCount += 1;
    }
  }

  record(
    "SETUP-BOOKMARK-SEED",
    "Bookmark seeded messages with metadata",
    bookmarkedOkCount === sentMessageIds.length,
    `bookmarked=${bookmarkedOkCount}/${sentMessageIds.length}`,
  );

  if (bookmarkedOkCount !== sentMessageIds.length) {
    throw new Error(
      `Cannot bookmark all seeded messages: ${bookmarkedOkCount}/${sentMessageIds.length}`,
    );
  }

  const preBulkQuery = await req(
    `/bookmarks?q=${encodeURIComponent(BULK_TAG)}&page=1&limit=10`,
    { token: owner.token },
  );

  const preBulkTotal = Number(preBulkQuery.data?.pagination?.total || 0);

  record(
    "API-BACKEND-Q-PRECHECK",
    "Backend text query finds bulk-tag bookmarks",
    preBulkQuery.status === 200 && preBulkTotal >= 2,
    `status=${preBulkQuery.status} total=${preBulkTotal}`,
  );

  if (preBulkQuery.status !== 200 || preBulkTotal < 2) {
    throw new Error("Backend text query precheck failed before UI actions");
  }

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
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

  await page.goto(`${APP_BASE_URL}/saved`, {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("heading", { name: "Saved Messages" }).waitFor({
    state: "visible",
    timeout: 20000,
  });

  await page.locator(".saved-bookmark-card").first().waitFor({
    state: "visible",
    timeout: 30000,
  });

  const initialMeta = await readSavedResultsMeta(page);

  record(
    "UI-SAVED-INITIAL",
    "Saved page loads first paginated slice",
    initialMeta.ok &&
      initialMeta.visible >= PAGE_LIMIT &&
      initialMeta.total >= MESSAGE_COUNT,
    `visible=${initialMeta.visible} total=${initialMeta.total}`,
  );

  const listViewport = page.locator(".saved-bookmark-list-viewport");
  await listViewport.waitFor({ state: "visible", timeout: 10000 });

  let pagedMeta = initialMeta;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await listViewport.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    const loadNextButton = page.getByRole("button", { name: "Load next page" });
    const canClickLoadNext = await loadNextButton.isVisible().catch(() => false);
    if (canClickLoadNext) {
      await loadNextButton.click().catch(() => {});
    }

    await wait(500);
    const candidateMeta = await readSavedResultsMeta(page);
    if (candidateMeta.visible > pagedMeta.visible) {
      pagedMeta = candidateMeta;
    }

    if (pagedMeta.visible > initialMeta.visible) {
      break;
    }
  }

  record(
    "UI-SAVED-SCROLL",
    "Infinite scroll loads additional pages",
    pagedMeta.visible > initialMeta.visible,
    `visible=${pagedMeta.visible} total=${pagedMeta.total}`,
  );

  await page.goto(`${APP_BASE_URL}/saved`, {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("heading", { name: "Saved Messages" }).waitFor({
    state: "visible",
    timeout: 20000,
  });

  await page.locator(".saved-bookmark-card").first().waitFor({
    state: "visible",
    timeout: 30000,
  });

  const savedSearchInput = page.getByRole("textbox", {
    name: "Search saved messages",
  });

  await savedSearchInput.fill(SEARCH_NEEDLE);

  await page.waitForFunction(
    ({ selector, maxTotal }) => {
      const target = document.querySelector(selector);
      if (!target) {
        return false;
      }

      const parsed = String(target.textContent || "").match(
        /Showing\s+([\d,]+)\s+of\s+([\d,]+)\s+saved messages/i,
      );

      if (!parsed) {
        return false;
      }

      const visible = Number.parseInt(String(parsed[1]).replaceAll(",", ""), 10) || 0;
      const total = Number.parseInt(String(parsed[2]).replaceAll(",", ""), 10) || 0;

      return visible >= 1 && total >= 1 && total <= maxTotal;
    },
    {
      selector: ".saved-results-meta span",
      maxTotal: 3,
    },
    { timeout: 30000 },
  );

  const searchMeta = await readSavedResultsMeta(page);

  record(
    "UI-SAVED-SEARCH",
    "Search uses backend-filtered bookmark dataset",
    searchMeta.visible > 0 && searchMeta.total <= 3,
    `filtered=${searchMeta.visible} total=${searchMeta.total}`,
  );

  await savedSearchInput.fill(BULK_TAG);

  await page.waitForFunction(
    ({ selector, expectedTotal }) => {
      const target = document.querySelector(selector);
      if (!target) {
        return false;
      }

      const parsed = String(target.textContent || "").match(
        /Showing\s+([\d,]+)\s+of\s+([\d,]+)\s+saved messages/i,
      );

      if (!parsed) {
        return false;
      }

      const visible = Number.parseInt(String(parsed[1]).replaceAll(",", ""), 10) || 0;
      const total = Number.parseInt(String(parsed[2]).replaceAll(",", ""), 10) || 0;

      return visible === expectedTotal && total === expectedTotal;
    },
    {
      selector: ".saved-results-meta span",
      expectedTotal: 2,
    },
    { timeout: 30000 },
  );

  const bulkFilterMeta = await readSavedResultsMeta(page);

  record(
    "UI-SAVED-BULK-TAG-FILTER",
    "Tag search narrows list to bulk-target bookmarks",
    bulkFilterMeta.visible === 2 && bulkFilterMeta.total === 2,
    `filtered=${bulkFilterMeta.visible} total=${bulkFilterMeta.total}`,
  );

  const checkboxes = page.locator(".saved-select-checkbox");
  await checkboxes.first().waitFor({ state: "visible", timeout: 10000 });
  await checkboxes.nth(1).waitFor({ state: "visible", timeout: 10000 });

  await checkboxes.first().click();
  await checkboxes.nth(1).click();

  await page.getByText("2 selected").first().waitFor({
    state: "visible",
    timeout: 10000,
  });

  record(
    "UI-SAVED-SELECT",
    "Selection toolbar tracks selected bookmarks",
    true,
    "2 bookmarks selected",
  );

  const bulkMetadataButton = page.getByRole("button", { name: "Bulk metadata" });
  await bulkMetadataButton.click();

  const bulkPanel = page.locator("#saved-bulk-panel");
  await bulkPanel.waitFor({ state: "visible", timeout: 10000 });

  const tagInput = page.getByPlaceholder("tag-name");
  await tagInput.fill(BULK_TAG);

  const bulkRequestPromise = page.waitForResponse(
    (response) => {
      return (
        response.url().includes("/bookmarks/bulk") &&
        response.request().method() === "POST"
      );
    },
    { timeout: 15000 },
  );

  await bulkPanel.getByRole("button", { name: "Remove" }).first().click();

  const bulkResponse = await bulkRequestPromise;
  const bulkResponseUrl = bulkResponse.url();
  const bulkRawBody = await bulkResponse.text();
  let bulkResponsePayload = null;

  try {
    bulkResponsePayload = JSON.parse(bulkRawBody);
  } catch {
    bulkResponsePayload = null;
  }

  const bulkStatus = bulkResponse.status();
  const bulkModifiedCount = Number(bulkResponsePayload?.modifiedCount || 0);
  const bulkMessage = String(
    bulkResponsePayload?.message || bulkRawBody || "",
  ).slice(0, 180);

  record(
    "UI-SAVED-BULK-REQUEST",
    "Bulk remove API request succeeds",
    bulkStatus === 200,
    `status=${bulkStatus} modified=${bulkModifiedCount} url=${bulkResponseUrl} message=${bulkMessage}`,
  );

  let bulkRemoved = false;
  let bulkRemaining = -1;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const bulkQuery = await req(
      `/bookmarks?q=${encodeURIComponent(BULK_TAG)}&page=1&limit=10`,
      { token: owner.token },
    );

    bulkRemaining = Number(bulkQuery.data?.pagination?.total || 0);
    if (bulkQuery.status === 200 && bulkRemaining === 0) {
      bulkRemoved = true;
      break;
    }

    await wait(250);
  }

  record(
    "UI-SAVED-BULK-REMOVE",
    "Bulk tag removal updates backend bookmark metadata",
    bulkRemoved && bulkModifiedCount >= 1,
    `remainingWithTag=${bulkRemaining} modified=${bulkModifiedCount}`,
  );

  await context.close();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  record("FATAL", "Saved scale smoke", false, message);
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
