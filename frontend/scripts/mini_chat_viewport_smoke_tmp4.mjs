import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:5001/api";
const runTag = Date.now();
const TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD || `P@ssw0rd-${runTag}`;
const dateStamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const outDir = path.resolve(
  process.env.QA_OUT_DIR || `qa-artifacts/mini-chat-viewport-smoke-${dateStamp}-final`,
);

const viewports = [
  { label: "1280x800", width: 1280, height: 800 },
  { label: "1366x768", width: 1366, height: 768 },
  { label: "1440x900", width: 1440, height: 900 },
];

const smokeUser = {
  username: `mini_chat_smoke_final_${runTag}`,
  password: TEST_PASSWORD,
  email: `mini_chat_smoke_final_${runTag}@local.dev`,
  firstName: "Mini",
  lastName: "Smoke",
};

const miniChatWindow = {
  userId: "mini-chat-peer-smoke",
  username: "mini.peer",
  displayName: "Design Peer",
  avatarUrl: "",
  conversationId: null,
  minimized: false,
  pinned: true,
  poppedOut: false,
  unreadCount: 2,
  pulseUntil: Date.now() + 1600,
  poppedHeight: 500,
  draft: "",
  imagePreview: null,
};

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const req = async (routePath, { method = "GET", body } = {}) => {
  const response = await fetch(`${API_BASE_URL}${routePath}`, {
    method,
    headers: {
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

  return { status: response.status, json };
};

const signUpUser = async () => {
  const signup = await req("/auth/signup", {
    method: "POST",
    body: smokeUser,
  });

  if (signup.status !== 204) {
    throw new Error(`Signup failed: ${signup.status}`);
  }
};

const signInUser = async () => {
  const signin = await req("/auth/signin", {
    method: "POST",
    body: {
      username: smokeUser.username,
      password: smokeUser.password,
    },
  });

  if (signin.status !== 200 || !signin?.json?.user) {
    throw new Error(`Signin failed: ${signin.status}`);
  }

  return {
    status: signin.status,
    accessToken: signin.json.accessToken || null,
    user: signin.json.user,
  };
};

const assertFeedPath = (actualPath) => {
  if (actualPath !== "/feed") {
    throw new Error(`Unexpected path after auth bootstrap: ${actualPath}`);
  }
};

const run = async () => {
  await ensureDir(outDir);
  await signUpUser();
  const auth = await signInUser();

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

      const check = {
        viewport: viewport.label,
        route: "/feed",
        actualPath: "",
        pageShellVisible: false,
        windowsCount: 0,
        screenshotPath: `mini-chat-${viewport.label}.png`,
        screenshotCaptured: false,
        found: false,
        overflowLeft: false,
        overflowRight: false,
        windowWidth: 0,
        windowHeight: 0,
        signInStatus: 0,
        error: null,
      };

      try {
        check.signInStatus = auth.status;

        await context.addInitScript(({ token, user }) => {
          globalThis.localStorage.setItem(
            "auth-storage",
            JSON.stringify({
              state: {
                user,
                accessToken: token,
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
          document.documentElement.dataset.motion = "reduced";
          document.documentElement.dataset.motionLevel = "calm";
        }, {
          token: auth.accessToken,
          user: auth.user,
        });

        const page = await context.newPage();

        await page.goto(`${APP_BASE_URL}/feed`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        await page.waitForTimeout(900);

        check.actualPath = new URL(page.url()).pathname;

        await page
          .locator(".social-page-shell")
          .first()
          .waitFor({ state: "visible", timeout: 12000 })
          .catch(() => undefined);

        check.pageShellVisible = await page
          .locator(".social-page-shell")
          .first()
          .isVisible()
          .catch(() => false);

        assertFeedPath(check.actualPath);

        await page.evaluate(async ({ windowItem }) => {
          const { useMiniChatDockStore } = await import("../src/stores/useMiniChatDockStore.ts");

          useMiniChatDockStore.setState({
            windows: [windowItem],
          });

          globalThis.localStorage.setItem(
            "mini-chat-dock-storage",
            JSON.stringify({
              state: {
                windows: [windowItem],
              },
              version: 0,
            }),
          );
        }, {
          windowItem: miniChatWindow,
        });

        await page.waitForTimeout(320);

        check.windowsCount = await page.evaluate(async () => {
          const { useMiniChatDockStore } = await import("../src/stores/useMiniChatDockStore.ts");
          return useMiniChatDockStore.getState().windows.length;
        });

        const miniChat = page.locator(".social-mini-chat-window").first();
        await miniChat.waitFor({ state: "visible", timeout: 15000 });

        await page.waitForFunction(() => {
          const miniWindow = document.querySelector(".social-mini-chat-window");
          if (!miniWindow) {
            return false;
          }

          const style = globalThis.getComputedStyle(miniWindow);
          const hasHeader = Boolean(miniWindow.querySelector(".social-mini-chat-head"));
          const hasInput = Boolean(miniWindow.querySelector(".social-mini-chat-input-row"));
          return style.opacity === "1" && hasHeader && hasInput;
        }, {
          timeout: 12000,
        });

        await page.waitForTimeout(700);

        const box = await miniChat.boundingBox();
        if (!box) {
          throw new Error("Mini chat visible but bounding box unavailable");
        }

        check.found = true;
        check.windowWidth = Number(box.width.toFixed(2));
        check.windowHeight = Number(box.height.toFixed(2));
        check.overflowLeft = box.x < 0;
        check.overflowRight = box.x + box.width > viewport.width;

        const screenshotPath = path.join(outDir, check.screenshotPath);
        await miniChat.screenshot({ path: screenshotPath });
        check.screenshotCaptured = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        check.error = message;

        const debugPage = context.pages()[0] || (await context.newPage());
        await debugPage
          .screenshot({
            path: path.join(outDir, `debug-${viewport.label}.png`),
            fullPage: true,
          })
          .catch(() => undefined);
      } finally {
        checks.push(check);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const passedChecks = checks.filter(
    (item) =>
      item.found &&
      !item.overflowLeft &&
      !item.overflowRight &&
      item.screenshotCaptured,
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
      `[mini-chat] ${item.viewport} status=${status} signin=${item.signInStatus} path=${item.actualPath} pageShell=${item.pageShellVisible} windows=${item.windowsCount} found=${item.found} overflowLeft=${item.overflowLeft} overflowRight=${item.overflowRight} size=${item.windowWidth}x${item.windowHeight}`,
    );
    if (item.error) {
      console.log(`[mini-chat] ${item.viewport} error=${item.error}`);
    }
  }

  console.log(`Saved ${checks.length} checks to ${outDir}`);
  console.log(`failedChecks=${summary.failedChecks}`);
};

try {
  await run();
} catch (error) {
  console.error("mini-chat viewport smoke failed", error);
  process.exitCode = 1;
}
