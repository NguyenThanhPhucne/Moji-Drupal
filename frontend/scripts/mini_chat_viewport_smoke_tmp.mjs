import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const dateStamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const outDir = path.resolve(
  process.env.QA_OUT_DIR || `qa-artifacts/mini-chat-viewport-smoke-${dateStamp}`,
);

const viewports = [
  { label: "1280x800", width: 1280, height: 800 },
  { label: "1366x768", width: 1366, height: 768 },
  { label: "1440x900", width: 1440, height: 900 },
];

const mockAuthUser = {
  _id: "smoke_user_owner",
  username: "smoke.owner",
  displayName: "Smoke Owner",
  email: "smoke.owner@local.dev",
  avatarUrl: "",
  role: "user",
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
};

const miniChatWindow = {
  userId: "smoke_user_peer",
  username: "smoke.peer",
  displayName: "Design Peer",
  avatarUrl: "",
  conversationId: null,
  minimized: false,
  pinned: true,
  poppedOut: false,
  unreadCount: 2,
  pulseUntil: Date.now() + 1200,
  poppedHeight: 500,
  draft: "",
  imagePreview: null,
};

const jsonResponse = (payload, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(payload),
});

const emptyPagination = {
  page: 1,
  limit: 10,
  totalPages: 1,
  totalItems: 0,
  hasNextPage: false,
  hasPrevPage: false,
};

const fulfillApiMock = async (route) => {
  const request = route.request();
  const method = request.method().toUpperCase();
  if (method === "OPTIONS") {
    await route.fulfill({ status: 204 });
    return;
  }

  const requestUrl = new URL(request.url());
  const apiPath = requestUrl.pathname.replace(/^.*\/api\/node/, "") || "/";

  if (apiPath === "/auth/me") {
    await route.fulfill(jsonResponse({ user: mockAuthUser }));
    return;
  }

  if (apiPath === "/social/posts") {
    await route.fulfill(
      jsonResponse({
        posts: [],
        pagination: {
          ...emptyPagination,
          totalPosts: 0,
        },
      }),
    );
    return;
  }

  if (apiPath.startsWith("/social/posts/") && apiPath.endsWith("/comments")) {
    await route.fulfill(
      jsonResponse({
        comments: [],
        pagination: {
          ...emptyPagination,
          totalComments: 0,
        },
      }),
    );
    return;
  }

  if (apiPath === "/social/notifications") {
    await route.fulfill(jsonResponse({ notifications: [] }));
    return;
  }

  if (apiPath === "/friends/list" || apiPath === "/friends/online") {
    await route.fulfill(jsonResponse({ friends: [] }));
    return;
  }

  if (apiPath === "/users/suggestions") {
    await route.fulfill(jsonResponse({ users: [] }));
    return;
  }

  if (apiPath === "/stories") {
    await route.fulfill(jsonResponse({ stories: [] }));
    return;
  }

  if (apiPath === "/conversations") {
    await route.fulfill(jsonResponse({ conversations: [] }));
    return;
  }

  if (apiPath.startsWith("/messages/")) {
    await route.fulfill(
      jsonResponse({
        items: [],
        messages: [],
        pagination: {
          ...emptyPagination,
          totalMessages: 0,
        },
      }),
    );
    return;
  }

  await route.fulfill(jsonResponse({ ok: true }));
};

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const run = async () => {
  await ensureDir(outDir);
  const browser = await chromium.launch({ headless: true });

  const checks = [];

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: {
          width: viewport.width,
          height: viewport.height,
        },
      });

      await context.route("**/api/node/**", fulfillApiMock);

      const page = await context.newPage();
      const check = {
        viewport: viewport.label,
        route: "/feed",
        actualPath: "",
        windowsCount: 0,
        pageShellVisible: false,
        screenshotPath: `mini-chat-${viewport.label}.png`,
        found: false,
        overflowLeft: false,
        overflowRight: false,
        windowWidth: 0,
        windowHeight: 0,
        error: null,
      };

      try {
        await page.goto(`${APP_BASE_URL}/signin`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        await page.waitForFunction(() => {
          const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;
          return Boolean(bridge?.useAuthStore?.getState);
        }, {
          timeout: 12000,
        });

        await page.evaluate(async ({ user }) => {
          const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;
          const authStore = bridge?.useAuthStore;

          if (authStore?.getState) {
            authStore.getState().setAccessToken("smoke-access-token");
            authStore.getState().setUser(user);
          }

          globalThis.localStorage.setItem(
            "auth-storage",
            JSON.stringify({
              state: {
                accessToken: "smoke-access-token",
                user,
              },
              version: 0,
            }),
          );

          globalThis.localStorage.setItem(
            "mini-chat-dock-storage",
            JSON.stringify({
              state: {
                windows: [],
              },
              version: 0,
            }),
          );

          globalThis.localStorage.setItem("app-motion-level", "calm");
          globalThis.localStorage.setItem(
            "moji-appearance",
            JSON.stringify({
              state: {
                panelStyle: "flat-enterprise",
                motionPreference: "reduced",
              },
              version: 0,
            }),
          );

          document.documentElement.dataset.motion = "reduced";
          document.documentElement.dataset.motionLevel = "calm";
        }, {
          user: mockAuthUser,
        });

        await page.evaluate(() => {
          globalThis.history.pushState({}, "", "/feed");
          globalThis.dispatchEvent(new PopStateEvent("popstate"));
        });

        const reachedFeedInSpa = await page
          .waitForFunction(() => globalThis.location.pathname === "/feed", {
            timeout: 12000,
          })
          .then(() => true)
          .catch(() => false);

        if (!reachedFeedInSpa) {
          await page.goto(`${APP_BASE_URL}/feed?miniChatSmoke=1`, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
        }

        await page.waitForTimeout(450);

        await page.evaluate(async ({ miniWindow }) => {
          const { useMiniChatDockStore } = await import(
            "/src/stores/useMiniChatDockStore.ts"
          );

          useMiniChatDockStore.setState({
            windows: [miniWindow],
          });

          globalThis.localStorage.setItem(
            "mini-chat-dock-storage",
            JSON.stringify({
              state: {
                windows: [miniWindow],
              },
              version: 0,
            }),
          );
        }, {
          miniWindow: miniChatWindow,
        });

        check.actualPath = new URL(page.url()).pathname;
        check.windowsCount = await page.evaluate(async () => {
          const { useMiniChatDockStore } = await import(
            "/src/stores/useMiniChatDockStore.ts"
          );
          return useMiniChatDockStore.getState().windows.length;
        });

        check.pageShellVisible = await page
          .locator(".social-page-shell")
          .first()
          .isVisible()
          .catch(() => false);

        await page.waitForTimeout(500);

        const miniChat = page.locator(".social-mini-chat-window").first();
        await miniChat.waitFor({ state: "visible", timeout: 15000 });
        await page.waitForTimeout(300);

        const box = await miniChat.boundingBox();
        if (!box) {
          throw new Error("Mini chat is visible but bounding box is unavailable");
        }

        check.found = true;
        check.windowWidth = Number(box.width.toFixed(2));
        check.windowHeight = Number(box.height.toFixed(2));
        check.overflowLeft = box.x < 0;
        check.overflowRight = box.x + box.width > viewport.width;

        await miniChat.screenshot({
          path: path.join(outDir, check.screenshotPath),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        check.error = message;

        await page.screenshot({
          path: path.join(outDir, `debug-${viewport.label}.png`),
          fullPage: true,
        }).catch(() => undefined);
      } finally {
        checks.push(check);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const passedChecks = checks.filter(
    (item) => item.found && !item.overflowLeft && !item.overflowRight,
  ).length;

  const summary = {
    generatedAt: new Date().toISOString(),
    appBaseUrl: APP_BASE_URL,
    outDir,
    totalChecks: checks.length,
    passedChecks,
    failedChecks: checks.length - passedChecks,
    checks,
  };

  await fs.writeFile(
    path.join(outDir, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );

  for (const item of checks) {
    const status = item.found && !item.overflowLeft && !item.overflowRight ? "ok" : "issue";
    console.log(
      `[mini-chat] ${item.viewport} status=${status} path=${item.actualPath} pageShell=${item.pageShellVisible} windows=${item.windowsCount} found=${item.found} overflowLeft=${item.overflowLeft} overflowRight=${item.overflowRight} size=${item.windowWidth}x${item.windowHeight}`,
    );
    if (item.error) {
      console.log(`[mini-chat] ${item.viewport} error=${item.error}`);
    }
  }

  console.log(`Saved ${checks.length} checks to ${outDir}`);
  console.log(`failedChecks=${summary.failedChecks}`);
};

run().catch((error) => {
  console.error("mini-chat viewport smoke failed", error);
  process.exitCode = 1;
});
