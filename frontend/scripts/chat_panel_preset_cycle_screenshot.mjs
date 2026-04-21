import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const runTag = Date.now();
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:5001/api";
const TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD || `P@ssw0rd-${runTag}`;
const dateStamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const outDir = path.resolve(
  process.env.QA_OUT_DIR || `qa-artifacts/panel-preset-cycle-${dateStamp}`,
);

const allowedPresets = [
  "soft-glass",
  "flat-enterprise",
  "flat-enterprise-ultra",
];

const parsePresetList = (value) => {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => allowedPresets.includes(item));
};

const panelPresets = (() => {
  const parsed = parsePresetList(
    process.env.QA_PANEL_PRESETS || allowedPresets.join(","),
  );
  return parsed.length > 0 ? parsed : [...allowedPresets];
})();

const parseViewportList = (value) => {
  return value
    .split(",")
    .map((segment) => segment.trim())
    .map((segment) => {
      const [w, h] = segment.split("x").map((part) => Number(part.trim()));
      if (
        !Number.isFinite(w) ||
        !Number.isFinite(h) ||
        w < 320 ||
        h < 480 ||
        w > 2560 ||
        h > 1600
      ) {
        return null;
      }

      return {
        label: `${w}x${h}`,
        width: w,
        height: h,
      };
    })
    .filter(Boolean);
};

const viewports = (() => {
  const parsed = parseViewportList(process.env.QA_VIEWPORTS || "1536x960");
  return parsed.length > 0
    ? parsed
    : [{ label: "1536x960", width: 1536, height: 960 }];
})();

const users = {
  owner: {
    username: `panel_cycle_owner_${runTag}`,
    password: TEST_PASSWORD,
    email: `panel_cycle_owner_${runTag}@local.dev`,
    firstName: "Panel",
    lastName: "Owner",
  },
  peer: {
    username: `panel_cycle_peer_${runTag}`,
    password: TEST_PASSWORD,
    email: `panel_cycle_peer_${runTag}@local.dev`,
    firstName: "Panel",
    lastName: "Peer",
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

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
    throw new Error(`Signup failed for ${payload.username}: ${signup.status}`);
  }

  const signin = await req("/auth/signin", {
    method: "POST",
    body: {
      username: payload.username,
      password: payload.password,
    },
  });

  if (signin.status !== 200 || !signin?.json?.accessToken || !signin?.json?.user?._id) {
    throw new Error(`Signin failed for ${payload.username}: ${signin.status}`);
  }

  return {
    token: signin.json.accessToken,
    userId: signin.json.user._id,
    user: signin.json.user,
    username: payload.username,
    password: payload.password,
  };
};

const befriendUsers = async ({ owner, peer }) => {
  const sent = await req("/friends/requests", {
    method: "POST",
    token: owner.token,
    body: {
      to: peer.userId,
      message: "panel preset cycle friend request",
    },
  });

  if (sent.status !== 201) {
    throw new Error(`Send friend request failed: ${sent.status}`);
  }

  const incoming = await req("/friends/requests", {
    token: peer.token,
  });

  const pendingRequest = (incoming?.json?.received || []).find(
    (entry) => String(entry?.from?._id || "") === String(owner.userId),
  );

  if (!pendingRequest?._id) {
    throw new Error("Cannot find pending friend request");
  }

  const accepted = await req(`/friends/requests/${pendingRequest._id}/accept`, {
    method: "POST",
    token: peer.token,
  });

  if (accepted.status !== 200) {
    throw new Error(`Accept friend request failed: ${accepted.status}`);
  }
};

const seedConversation = async ({ owner, peer }) => {
  const seedMessage = await req("/messages/direct", {
    method: "POST",
    token: owner.token,
    body: {
      recipientId: peer.userId,
      content: `PANEL_PRESET_SEED_${runTag}`,
    },
  });

  if (seedMessage.status !== 201) {
    throw new Error(`Seed direct message failed: ${seedMessage.status}`);
  }
};

const resolveDirectConversationId = async ({ ownerToken, peerId }) => {
  const ownerConversations = await req("/conversations", {
    token: ownerToken,
  });

  if (ownerConversations.status !== 200) {
    throw new Error(`Load conversations failed: ${ownerConversations.status}`);
  }

  const conversations = ownerConversations?.json?.conversations || [];
  const directConversation = conversations.find((conversation) => {
    if (conversation?.type !== "direct") {
      return false;
    }

    return (conversation?.participants || []).some((participant) => {
      const participantId =
        typeof participant === "string"
          ? participant
          : participant?._id || participant?.id;

      return String(participantId || "") === String(peerId);
    });
  });

  const conversationId = String(directConversation?._id || "");
  if (!conversationId) {
    throw new Error("Direct conversation ID not found after seeding");
  }

  return conversationId;
};

const applyPreset = async (page, preset) => {
  await page.evaluate(({ nextStyle }) => {
    const root = document.documentElement;
    root.dataset.panelStyle = nextStyle;
    root.dataset.accent = "blue";
    root.dataset.chatDensity = "comfortable";
    root.dataset.messageSize = "md";
    root.dataset.bubbleStyle = "ultra-flat";
    root.dataset.motion = "reduced";

    try {
      const raw = globalThis.localStorage.getItem("moji-appearance");
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.state) {
        return;
      }

      parsed.state.panelStyle = nextStyle;
      parsed.state.accentColor = "blue";
      parsed.state.chatDensity = "comfortable";
      parsed.state.messageTextSize = "md";
      parsed.state.bubbleStyle = "ultra-flat";
      parsed.state.motionPreference = "reduced";
      globalThis.localStorage.setItem("moji-appearance", JSON.stringify(parsed));
    } catch {
      // no-op
    }
  }, {
    nextStyle: preset,
  });

  await sleep(160);
};

const collectPresetMetrics = async (page) => {
  return page.evaluate(() => {
    const root = document.documentElement;
    const panel = document.querySelector(".chat-shell-panel");
    const mainShell = document.querySelector(".chat-main-shell");
    const panelStyle = panel ? globalThis.getComputedStyle(panel) : null;
    const mainStyle = mainShell ? globalThis.getComputedStyle(mainShell) : null;

    return {
      datasetPanelStyle: root.dataset.panelStyle || null,
      panelBorderRadius: panelStyle?.borderRadius || null,
      panelBorderColor: panelStyle?.borderColor || null,
      panelBoxShadow: panelStyle?.boxShadow || null,
      panelBackdropFilter:
        panelStyle?.backdropFilter || panelStyle?.webkitBackdropFilter || null,
      mainBackgroundImage: mainStyle?.backgroundImage || null,
    };
  });
};

const captureViewportCycle = async ({
  browser,
  ownerAuth,
  conversationId,
  viewport,
}) => {
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
  }, {
    accessToken: ownerAuth.token,
    user: ownerAuth.user,
  });

  const page = await context.newPage();
  const checks = [];

  try {
    await page.goto(`${APP_BASE_URL}/?conversationId=${conversationId}`, {
      waitUntil: "domcontentloaded",
    });

    await page.waitForSelector(".chat-shell-panel", {
      state: "visible",
      timeout: 20000,
    });

    const headerVisible = await page
      .locator(".chat-window-header-main")
      .isVisible()
      .catch(() => false);

    if (!headerVisible) {
      const firstCard = page.locator("[data-chat-card='true']").first();
      const canClickCard = await firstCard.isVisible().catch(() => false);
      if (canClickCard) {
        await firstCard.click();
        await sleep(150);
      }
    }

    await page.waitForSelector(".chat-window-header-main", {
      state: "visible",
      timeout: 12000,
    });

    const panelLocator = page.locator(".chat-shell-panel").first();

    for (const preset of panelPresets) {
      await applyPreset(page, preset);
      await panelLocator.waitFor({ state: "visible", timeout: 6000 });

      const screenshotName = `${viewport.label}--${preset}.png`;
      const screenshotPath = path.join(outDir, screenshotName);
      await panelLocator.screenshot({ path: screenshotPath });

      const metrics = await collectPresetMetrics(page);
      const pass = metrics.datasetPanelStyle === preset;

      checks.push({
        viewport: viewport.label,
        preset,
        pass,
        screenshot: screenshotName,
        metrics,
      });

      console.log(
        `${pass ? "PASS" : "FAIL"} | PANEL-PRESET-CYCLE | viewport=${viewport.label} preset=${preset} screenshot=${screenshotName}`,
      );
    }
  } finally {
    await context.close();
  }

  return checks;
};

const run = async () => {
  await ensureDir(outDir);

  const ownerAuth = await signupAndSignin(users.owner);
  const peerAuth = await signupAndSignin(users.peer);

  await befriendUsers({ owner: ownerAuth, peer: peerAuth });
  await seedConversation({ owner: ownerAuth, peer: peerAuth });

  const conversationId = await resolveDirectConversationId({
    ownerToken: ownerAuth.token,
    peerId: peerAuth.userId,
  });

  const browser = await chromium.launch({ headless: true });
  const allChecks = [];

  try {
    console.log("=== CHAT PANEL PRESET CYCLE SCREENSHOT QA ===");
    console.log(`base=${APP_BASE_URL} api=${API_BASE_URL}`);
    console.log(`outDir=${outDir}`);
    console.log(`presets=${panelPresets.join(",")}`);

    for (const viewport of viewports) {
      const checks = await captureViewportCycle({
        browser,
        ownerAuth,
        conversationId,
        viewport,
      });
      allChecks.push(...checks);
    }

    const failedChecks = allChecks.filter((item) => !item.pass);

    const summary = {
      outDir,
      totalChecks: allChecks.length,
      passedChecks: allChecks.length - failedChecks.length,
      failedChecks: failedChecks.length,
      viewports: viewports.map((viewport) => viewport.label),
      presets: panelPresets,
      checks: allChecks,
    };

    const summaryPath = path.join(outDir, "summary.json");
    await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

    console.log(`summary=${summaryPath}`);
    console.log(JSON.stringify(summary, null, 2));

    process.exitCode = failedChecks.length === 0 ? 0 : 1;
  } finally {
    await browser.close();
  }
};

try {
  await run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("FAIL | PANEL-PRESET-CYCLE-SMOKE |", message);
  process.exit(1);
}
