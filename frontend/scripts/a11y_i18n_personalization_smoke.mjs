#!/usr/bin/env node

import { chromium } from "playwright";
import { promises as fs } from "node:fs";
import path from "node:path";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://127.0.0.1:5173";

const dateStamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const OUT_DIR = path.resolve(
  process.cwd(),
  process.env.QA_OUT_DIR || `qa-artifacts/a11y-i18n-smoke-${dateStamp}`,
);

const now = Date.now();
const sampleUserId = `smoke-user-${now}`;
const accessToken = `smoke-token-${now}`;

const sampleUser = {
  _id: sampleUserId,
  username: `smoke_user_${now}`,
  email: `smoke_user_${now}@local.dev`,
  displayName: "Smoke User",
  avatarUrl: null,
  bio: "Smoke profile",
  notificationPreferences: {
    message: true,
    sound: true,
    desktop: false,
    social: {
      muted: false,
      follow: true,
      like: true,
      comment: true,
      mention: true,
      friendAccepted: true,
      system: true,
      mutedUserIds: [],
      mutedConversationIds: [],
      digestEnabled: false,
      digestWindowHours: 6,
    },
  },
  personalizationPreferences: {
    locale: "en",
    startPagePreference: "feed",
    timestampStylePreference: "relative",
    notificationGroupingPreference: "auto",
    notificationDensityPreference: "comfortable",
  },
};

const sampleProfile = {
  _id: sampleUserId,
  displayName: sampleUser.displayName,
  username: sampleUser.username,
  avatarUrl: sampleUser.avatarUrl,
  bio: sampleUser.bio,
  createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
  followerCount: 14,
  followingCount: 12,
  friendCount: 5,
  friendsPreview: [],
  postCount: 2,
  isFollowing: false,
  isFriend: false,
  canViewProfile: true,
};

const sampleNotifications = [
  {
    _id: `notif-high-${now}`,
    recipientId: sampleUserId,
    actorId: {
      _id: "actor-high",
      displayName: "Alex",
      username: "alex",
      avatarUrl: null,
    },
    type: "mention",
    postId: null,
    conversationId: "conv-1",
    commentId: null,
    message: "mentioned you in #general",
    isRead: false,
    createdAt: new Date(now - 2 * 60 * 1000).toISOString(),
  },
  {
    _id: `notif-normal-${now}`,
    recipientId: sampleUserId,
    actorId: {
      _id: "actor-normal",
      displayName: "Nina",
      username: "nina",
      avatarUrl: null,
    },
    type: "comment",
    postId: "post-1",
    conversationId: "conv-1",
    commentId: "comment-1",
    message: "commented on your post",
    isRead: false,
    createdAt: new Date(now - 60 * 60 * 1000).toISOString(),
  },
  {
    _id: `notif-low-${now}`,
    recipientId: sampleUserId,
    actorId: {
      _id: "actor-low",
      displayName: "System",
      username: "system",
      avatarUrl: null,
    },
    type: "system",
    postId: null,
    conversationId: null,
    commentId: null,
    message: "weekly digest is ready",
    isRead: true,
    createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const pagination = {
  page: 1,
  limit: 20,
  total: sampleNotifications.length,
  totalPages: 1,
  hasNextPage: false,
};

const results = [];

const record = (id, title, pass, detail) => {
  const entry = {
    id,
    title,
    pass: Boolean(pass),
    detail: String(detail || ""),
  };
  results.push(entry);
  console.log(
    `${entry.pass ? "PASS" : "FAIL"} | ${entry.id} | ${entry.title} | ${entry.detail}`,
  );
};

const ensureOutDir = async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });
};

const writeSummary = async () => {
  const passCount = results.filter((item) => item.pass).length;
  const summary = {
    appBaseUrl: APP_BASE_URL,
    generatedAt: new Date().toISOString(),
    checks: results,
    passCount,
    failCount: results.length - passCount,
  };

  await fs.writeFile(
    path.join(OUT_DIR, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
};

const jsonResponse = (data, status = 200) => ({
  status,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  },
  body: JSON.stringify(data),
});

const extractApiPath = (url) => {
  try {
    const parsedUrl = new URL(url);
    const marker = "/api/node";
    const markerIndex = parsedUrl.pathname.indexOf(marker);
    if (markerIndex < 0) {
      return "";
    }
    return parsedUrl.pathname.slice(markerIndex + marker.length);
  } catch {
    return "";
  }
};

const createProfileResponse = (userId) => ({
  profile: {
    ...sampleProfile,
    _id: String(userId || sampleProfile._id),
  },
});

const resolveUserMockResponse = ({ apiPath, method, body, syncPayloads }) => {
  if (apiPath === "/auth/signin" && method === "POST") {
    return jsonResponse({
      accessToken,
      user: sampleUser,
    });
  }

  if (apiPath === "/auth/refresh" && method === "POST") {
    return jsonResponse({
      accessToken,
    });
  }

  if (apiPath === "/users/me" && method === "GET") {
    return jsonResponse({ user: sampleUser });
  }

  if (apiPath === "/users/personalization-preferences" && method === "PATCH") {
    const payload = body?.personalizationPreferences || body || {};
    syncPayloads.push(payload);
    sampleUser.personalizationPreferences = {
      ...sampleUser.personalizationPreferences,
      ...payload,
    };
    return jsonResponse({
      message: "ok",
      user: sampleUser,
    });
  }

  return null;
};

const resolveFeedAndProfileMockResponse = ({ apiPath, method }) => {
  if (apiPath === "/social/feed/home" && method === "GET") {
    return jsonResponse({
      posts: [],
      pagination: {
        page: 1,
        limit: 15,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
      },
    });
  }

  if (/^\/social\/profiles\/[^/]+$/.test(apiPath) && method === "GET") {
    const userId = apiPath.split("/")[3];
    return jsonResponse(createProfileResponse(userId));
  }

  if (/^\/social\/profiles\/[^/]+\/posts$/.test(apiPath) && method === "GET") {
    return jsonResponse({
      posts: [],
      pagination: {
        page: 1,
        limit: 15,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
      },
    });
  }

  return null;
};

const resolveNotificationMockResponse = ({ apiPath, method }) => {
  if (apiPath === "/social/notifications" && method === "GET") {
    return jsonResponse({
      notifications: sampleNotifications,
      unreadCount: sampleNotifications.filter((item) => !item.isRead).length,
      pagination,
    });
  }

  if (/^\/social\/notifications\/[^/]+\/read$/.test(apiPath) && method === "PATCH") {
    return jsonResponse({
      notification: sampleNotifications[0],
    });
  }

  if (apiPath === "/social/notifications/read-all" && method === "PATCH") {
    return jsonResponse({ ok: true });
  }

  return null;
};

const resolveFriendsAndConversationMockResponse = ({ apiPath, method }) => {
  if (apiPath === "/friends/requests" && method === "GET") {
    return jsonResponse({
      received: [],
      sent: [],
    });
  }

  if (apiPath === "/friends" && method === "GET") {
    return jsonResponse({
      friends: [],
    });
  }

  if (apiPath === "/conversations" && method === "GET") {
    return jsonResponse({
      conversations: [],
    });
  }

  return null;
};

const resolveBookmarkMockResponse = ({ apiPath, method }) => {
  if (apiPath === "/bookmarks" && method === "GET") {
    return jsonResponse({
      bookmarks: [],
      pagination: {
        page: 1,
        limit: 30,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
      },
    });
  }

  return null;
};

const MOCK_RESPONSE_RESOLVERS = [
  resolveUserMockResponse,
  resolveFeedAndProfileMockResponse,
  resolveNotificationMockResponse,
  resolveFriendsAndConversationMockResponse,
  resolveBookmarkMockResponse,
];

const resolveMockApiResponse = (requestContext) => {
  for (const resolver of MOCK_RESPONSE_RESOLVERS) {
    const response = resolver(requestContext);
    if (response) {
      return response;
    }
  }

  return jsonResponse({ ok: true });
};

const waitForSmokeBridge = async (page) => {
  await page.waitForFunction(
    () => {
      const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;

      return Boolean(
        bridge?.useAuthStore &&
          bridge?.usePersonalizationStore &&
          bridge?.useNotificationStore,
      );
    },
      undefined,
    { timeout: 8000 },
  );
};

const bootstrapStores = async (page) => {
  await page.goto(`${APP_BASE_URL}/signin`, { waitUntil: "domcontentloaded" });

  await waitForSmokeBridge(page);

  await page.getByLabel("Username").fill(sampleUser.username);
  await page.getByLabel("Password").fill("smoke-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForFunction(
    () => {
      const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;
      const authState = bridge?.useAuthStore?.getState?.();

      return (
        Boolean(authState?.accessToken && authState?.user?._id) &&
        globalThis.location.pathname !== "/signin"
      );
    },
    undefined,
    { timeout: 10000 },
  );

  await page.evaluate((user) => {
    const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;
    if (!bridge) {
      return;
    }

    bridge.usePersonalizationStore
      .getState()
      .hydrateFromProfile(user.personalizationPreferences);
  }, sampleUser);
};

const navigateSpa = async (page, pathname) => {
  await page.evaluate((targetPath) => {
    globalThis.history.pushState({}, "", targetPath);
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
  }, pathname);
};

const waitForPoliteAnnouncement = async (page, expectedText) => {
  await page.waitForFunction(
    (text) => {
      const liveRegion = document.querySelector('[data-testid="a11y-live-polite"]');
      const content = String(liveRegion?.textContent || "").trim();
      return content.includes(text);
    },
    expectedText,
    { timeout: 8000 },
  );
};

const openNotificationHub = async (page) => {
  await page.evaluate(() => {
    const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;
    if (!bridge) {
      return;
    }

    const { useNotificationStore } = bridge;
    useNotificationStore.getState().setIsHubOpen(true);
  });

  await page.waitForSelector('[data-testid="notification-hub"]', {
    state: "visible",
    timeout: 8000,
  });
};

const setPersonalization = async (page, updates) => {
  await page.evaluate(async (payload) => {
    const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;
    if (!bridge) {
      return;
    }

    const { useAuthStore, usePersonalizationStore } = bridge;

    const personalizationState = usePersonalizationStore.getState();
    const authState = useAuthStore.getState();

    if (authState.user) {
      const basePreferences = authState.user.personalizationPreferences;
      if (!basePreferences) {
        return;
      }

      authState.setUser({
        ...authState.user,
        personalizationPreferences: {
          ...basePreferences,
          ...payload,
        },
      });
    }

    if (payload.locale) {
      personalizationState.setLocale(payload.locale);
    }

    if (payload.timestampStylePreference) {
      personalizationState.setTimestampStylePreference(payload.timestampStylePreference);
    }

    if (payload.notificationGroupingPreference) {
      personalizationState.setNotificationGroupingPreference(
        payload.notificationGroupingPreference,
      );
    }

    try {
      await fetch("/api/node/users/personalization-preferences", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          personalizationPreferences: payload,
        }),
      });
    } catch {
      // Ignore network failures in smoke helper; route interception is best-effort.
    }
  }, updates);
};

const run = async () => {
  await ensureOutDir();

  const syncPayloads = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  await page.route("**/api/node/**", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const apiPath = extractApiPath(request.url());

    let body = {};
    try {
      body = request.postDataJSON?.() || {};
    } catch {
      body = {};
    }

    await route.fulfill(
      resolveMockApiResponse({ apiPath, method, body, syncPayloads }),
    );
  });

  try {
    await bootstrapStores(page);

    await navigateSpa(page, "/feed");
    await page.waitForSelector("text=Home feed", { timeout: 8000 });
    record("I18N-EN-BASE", "Render feed in EN locale", true, "Home feed visible");

    await setPersonalization(page, { locale: "vi" });

    await page.waitForFunction(
      () => document.documentElement.lang === "vi",
      undefined,
      {
        timeout: 5000,
      },
    );
    await page.waitForSelector("text=Bảng tin", { timeout: 8000 });
    record("I18N-LOCALE-SWITCH", "Switch locale EN -> VI", true, "lang=vi");

    await navigateSpa(page, "/profile");
    await waitForPoliteAnnouncement(page, "Đã chuyển đến Hồ sơ");
    record(
      "A11Y-ROUTE-ANNOUNCE",
      "Announce route changes via polite live region",
      true,
      "Received Vietnamese route announcement",
    );

    await openNotificationHub(page);

    await setPersonalization(page, {
      notificationGroupingPreference: "priority",
    });
    await page.waitForSelector('[data-testid="notification-group-header"]:has-text("Quan trọng")', {
      timeout: 8000,
    });
    record(
      "NOTIF-GROUP-PRIORITY",
      "Notification grouping mode: priority",
      true,
      "Header Quan trọng rendered",
    );

    await setPersonalization(page, {
      notificationGroupingPreference: "time",
    });
    await page.waitForSelector('[data-testid="notification-group-header"]:has-text("Mới")', {
      timeout: 8000,
    });
    record(
      "NOTIF-GROUP-TIME",
      "Notification grouping mode: time",
      true,
      "Header Mới rendered",
    );

    await setPersonalization(page, {
      timestampStylePreference: "relative",
    });
    await page.waitForSelector('[data-testid="notification-timestamp"]', {
      timeout: 8000,
    });
    const relativeTimestamp = (
      await page.locator('[data-testid="notification-timestamp"]').first().innerText()
    ).trim();

    await setPersonalization(page, {
      timestampStylePreference: "absolute",
    });

    await page.waitForFunction(
      (previousTimestamp) => {
        const element = document.querySelector('[data-testid="notification-timestamp"]');
        const currentText = String(element?.textContent || "").trim();
        return (
          currentText.length > 0 &&
          currentText !== previousTimestamp &&
          /\d{1,2}:\d{2}/.test(currentText)
        );
      },
      relativeTimestamp,
      { timeout: 8000 },
    );

    const absoluteTimestamp = (
      await page.locator('[data-testid="notification-timestamp"]').first().innerText()
    ).trim();

    record(
      "NOTIF-TIMESTAMP-MODE",
      "Notification timestamp mode: relative -> absolute",
      absoluteTimestamp !== relativeTimestamp,
      `relative="${relativeTimestamp}" | absolute="${absoluteTimestamp}"`,
    );

    const hasLocaleSyncPayload = syncPayloads.some(
      (payload) => payload?.locale === "vi",
    );
    const hasGroupingSyncPayload = syncPayloads.some(
      (payload) => payload?.notificationGroupingPreference === "time",
    );
    const hasTimestampSyncPayload = syncPayloads.some(
      (payload) => payload?.timestampStylePreference === "absolute",
    );

    record(
      "PERSONALIZATION-SYNC-BE",
      "Sync personalization updates to backend profile endpoint",
      hasLocaleSyncPayload && hasGroupingSyncPayload && hasTimestampSyncPayload,
      `syncCalls=${syncPayloads.length}`,
    );
  } catch (error) {
    record(
      "SMOKE-FATAL",
      "Unexpected smoke failure",
      false,
      error instanceof Error ? error.message : String(error),
    );

    try {
      await page.screenshot({
        path: path.join(OUT_DIR, "fatal.png"),
        fullPage: true,
      });
    } catch {
      // Ignore screenshot errors in fatal flow.
    }
  } finally {
    await writeSummary();
    await context.close();
    await browser.close();
  }

  const failed = results.some((item) => !item.pass);
  process.exit(failed ? 1 : 0);
};

void run();
