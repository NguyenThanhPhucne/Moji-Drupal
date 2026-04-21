import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:5001/api";
const TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD || `P@ssw0rd-${Date.now()}`;
const runTag = Date.now();
const dateStamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const outDir = path.resolve(
  process.env.QA_OUT_DIR || `qa-artifacts/mini-chat-viewport-smoke-${dateStamp}-rerun3`,
);

const viewports = [
  { label: "1280x800", width: 1280, height: 800 },
  { label: "1366x768", width: 1366, height: 768 },
  { label: "1440x900", width: 1440, height: 900 },
];

const smokeUser = {
  username: `mini_chat_smoke_${runTag}`,
  password: TEST_PASSWORD,
  email: `mini_chat_smoke_${runTag}@local.dev`,
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
  pulseUntil: Date.now() + 1200,
  poppedHeight: 500,
  draft: "",
  imagePreview: null,
};

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const req = async (routePath, { method = "GET", token, body } = {}) => {
  const response = await fetch(`${API_BASE_URL}${routePath}`, {
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

  return { status: response.status, json };
};

const signupAndSignin = async (payload) => {
  const signup = await req("/auth/signup", {
    method: "POST",
    body: payload,
  });

  if (signup.status !== 204) {
    throw new Error(`Signup failed: ${signup.status}`);
  }

  const signin = await req("/auth/signin", {
    method: "POST",
    body: {
      username: payload.username,
      password: payload.password,
    },
  });

  if (signin.status !== 200 || !signin?.json?.accessToken || !signin?.json?.user?._id) {
    throw new Error(`Signin failed: ${signin.status}`);
  }

  return {
    token: signin.json.accessToken,
    user: signin.json.user,
    username: payload.username,
    password: payload.password,
  };
};

const run = async () => {
  await ensureDir(outDir);

  const auth = await signupAndSignin(smokeUser);
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

      await context.addInitScript(({ accessToken, user }) => {
        globalThis.localStorage.setItem(
          "auth-storage",
          JSON.stringify({
            state: {
              accessToken,
              user,
            },
            version: 0,
          }),
        );

        globalThis.localStorage.setItem("app-motion-level", "calm");
        document.documentElement.dataset.motion = "reduced";
        document.documentElement.dataset.motionLevel = "calm";
      }, {
        accessToken: auth.token,
        user: auth.user,
      });

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

        await page.evaluate(async ({ token, user }) => {
          const authStore = globalThis.__MOJI_SMOKE_BRIDGE__?.useAuthStore;
          if (!authStore?.getState) {
            return;
          }

          const persistApi = authStore.persist;
          if (persistApi?.hasHydrated && !persistApi.hasHydrated()) {
            await new Promise((resolve) => {
              let settled = false;
              const done = () => {
                if (settled) {
                  return;
                }
                settled = true;
                resolve();
              };

              const unsubscribe =
                typeof persistApi.onFinishHydration === "function"
                  ? persistApi.onFinishHydration(() => {
                      unsubscribe?.();
                      done();
                    })
                  : undefined;

              globalThis.setTimeout(() => {
                unsubscribe?.();
                done();
              }, 3000);
            });
          }

          authStore.getState().setAccessToken(token);
          authStore.getState().setUser(user);

          globalThis.localStorage.setItem(
            "auth-storage",
            JSON.stringify({
              state: {
                user,
              },
              version: 0,
            }),
          );
        }, {
          token: auth.token,
          user: auth.user,
        });

        await page.goto(`${APP_BASE_URL}/feed`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        await sleep(1200);

        let currentPath = new URL(page.url()).pathname;
        if (currentPath.includes("/signin")) {
          await page.waitForSelector("#username", {
            state: "visible",
            timeout: 15000,
          });
          await page.waitForSelector("#password", {
            state: "visible",
            timeout: 15000,
          });

          await page.fill("#username", auth.username);
          await page.fill("#password", auth.password);
          await page.getByRole("button", { name: /sign in/i }).first().click();

          await page
            .waitForURL((url) => !url.pathname.includes("/signin"), {
              timeout: 20000,
            })
            .catch(() => undefined);

          currentPath = new URL(page.url()).pathname;

          if (currentPath.includes("/signin")) {
            throw new Error("Could not leave /signin after scripted sign-in");
          }
        }

        await page.waitForTimeout(900);

        await page.evaluate(async ({ windowItem }) => {
          const { useMiniChatDockStore } = await import("/src/stores/useMiniChatDockStore.ts");

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

        await page.waitForTimeout(450);

        check.actualPath = new URL(page.url()).pathname;
        check.pageShellVisible = await page
          .locator(".social-page-shell")
          .first()
          .isVisible()
          .catch(() => false);

        check.windowsCount = await page.evaluate(async () => {
          const { useMiniChatDockStore } = await import("/src/stores/useMiniChatDockStore.ts");
          return useMiniChatDockStore.getState().windows.length;
        });

        const miniChat = page.locator(".social-mini-chat-window").first();
        await miniChat.waitFor({ state: "visible", timeout: 15000 });

        const box = await miniChat.boundingBox();
        if (!box) {
          throw new Error("Mini chat visible but bounding box is unavailable");
        }

        check.found = true;
        check.windowWidth = Number(box.width.toFixed(2));
        check.windowHeight = Number(box.height.toFixed(2));
        check.overflowLeft = box.x < 0;
        check.overflowRight = box.x + box.width > viewport.width;

        const clipX = Math.max(0, Math.floor(box.x));
        const clipY = Math.max(0, Math.floor(box.y));
        const clipWidth = Math.max(
          1,
          Math.min(viewport.width - clipX, Math.ceil(box.width)),
        );
        const clipHeight = Math.max(
          1,
          Math.min(viewport.height - clipY, Math.ceil(box.height)),
        );

        await page.screenshot({
          path: path.join(outDir, check.screenshotPath),
          clip: {
            x: clipX,
            y: clipY,
            width: clipWidth,
            height: clipHeight,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        check.error = message;

        await page
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
