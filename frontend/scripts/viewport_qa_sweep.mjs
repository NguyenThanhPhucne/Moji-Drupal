import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const outDir = path.resolve(
  process.env.QA_OUT_DIR || "qa-artifacts/viewport-sweep-20260418",
);
const apiPrefix = "/api/node";

const parseViewportList = (value) => {
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 280 && item <= 1920);
};

const viewports = (() => {
  const parsed = parseViewportList(process.env.QA_VIEWPORTS || "360,390,430,768");
  return parsed.length > 0 ? parsed : [360, 390, 430, 768];
})();
const routes = [
  { key: "explore", path: "/explore" },
  { key: "profile", path: "/profile" },
  { key: "settings", path: "/settings/notifications" },
];

const pagination = {
  page: 1,
  limit: 15,
  total: 2,
  totalPages: 1,
  hasNextPage: false,
};

const qaUser = {
  _id: "qa-user-1",
  username: "qa_user",
  displayName: "QA User",
  avatarUrl: null,
  email: "qa@example.com",
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

const samplePosts = [
  {
    _id: "post-qa-1",
    authorId: {
      _id: "user-2",
      displayName: "Lea Nguyen",
      username: "lea",
      avatarUrl: null,
    },
    caption:
      "Shipping a cleaner mobile timeline today. Density and interaction rhythm feel significantly better after trimming noisy motion.",
    mediaUrls: ["https://picsum.photos/seed/moji-qa-1/960/640"],
    tags: ["design", "mobile", "ux"],
    privacy: "public",
    likesCount: 17,
    commentsCount: 6,
    isLiked: false,
    ownReaction: null,
    reactionSummary: {
      like: 10,
      love: 4,
      haha: 1,
      wow: 2,
      sad: 0,
      angry: 0,
    },
    visibleReactors: [],
    createdAt: "2026-04-18T07:40:00.000Z",
    updatedAt: "2026-04-18T07:40:00.000Z",
  },
  {
    _id: "post-qa-2",
    authorId: {
      _id: "user-3",
      displayName: "Minh Tran",
      username: "minh",
      avatarUrl: null,
    },
    caption:
      "Profile layout now keeps hierarchy stable from 360px to tablet. Next up is final polishing for notification presets.",
    mediaUrls: [],
    tags: ["profile", "qa"],
    privacy: "public",
    likesCount: 9,
    commentsCount: 3,
    isLiked: false,
    ownReaction: null,
    reactionSummary: {
      like: 7,
      love: 1,
      haha: 0,
      wow: 1,
      sad: 0,
      angry: 0,
    },
    visibleReactors: [],
    createdAt: "2026-04-18T06:12:00.000Z",
    updatedAt: "2026-04-18T06:12:00.000Z",
  },
];

const sampleProfile = {
  _id: qaUser._id,
  displayName: qaUser.displayName,
  username: qaUser.username,
  avatarUrl: qaUser.avatarUrl,
  bio: "Product-focused engineer tuning social UX across mobile and desktop.",
  createdAt: "2024-01-01T00:00:00.000Z",
  followerCount: 52,
  followingCount: 34,
  friendCount: 12,
  friendsPreview: [
    {
      _id: "user-2",
      displayName: "Lea Nguyen",
      username: "lea",
      avatarUrl: null,
    },
    {
      _id: "user-3",
      displayName: "Minh Tran",
      username: "minh",
      avatarUrl: null,
    },
  ],
  postCount: samplePosts.length,
  isFollowing: false,
  isFriend: true,
  canViewProfile: true,
};

const sampleNotifications = [
  {
    _id: "notif-1",
    recipientId: qaUser._id,
    actorId: {
      _id: "user-2",
      displayName: "Lea Nguyen",
      username: "lea",
      avatarUrl: null,
    },
    type: "mention",
    message: "mentioned you in a post update",
    isRead: false,
    createdAt: "2026-04-18T08:00:00.000Z",
    postId: "post-qa-1",
    conversationId: null,
    commentId: null,
  },
  {
    _id: "notif-2",
    recipientId: qaUser._id,
    actorId: {
      _id: "user-3",
      displayName: "Minh Tran",
      username: "minh",
      avatarUrl: null,
    },
    type: "like",
    message: "reacted to your post",
    isRead: true,
    createdAt: "2026-04-18T06:30:00.000Z",
    postId: "post-qa-2",
    conversationId: null,
    commentId: null,
  },
];

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const respondJson = async (route, payload, status = 200) => {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
};

const addApiMocks = async (context) => {
  await context.route("**/api/node/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const endpoint = url.pathname.startsWith(apiPrefix)
      ? url.pathname.slice(apiPrefix.length)
      : url.pathname;

    if (endpoint === "/auth/refresh") {
      await respondJson(route, { accessToken: "qa-token" });
      return;
    }

    if (endpoint === "/users/me") {
      await respondJson(route, { user: qaUser });
      return;
    }

    if (endpoint === "/conversations") {
      await respondJson(route, { conversations: [] });
      return;
    }

    if (endpoint === "/friends/requests") {
      await respondJson(route, { sent: [], received: [] });
      return;
    }

    if (endpoint === "/friends") {
      await respondJson(route, { friends: [] });
      return;
    }

    if (endpoint.startsWith("/bookmarks")) {
      await respondJson(route, {
        bookmarks: [],
        pagination: {
          page: 1,
          limit: 30,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
        },
      });
      return;
    }

    if (endpoint === "/social/feed/home" || endpoint === "/social/feed/explore") {
      await respondJson(route, {
        posts: samplePosts,
        pagination,
      });
      return;
    }

    if (/^\/social\/profiles\/[^/]+$/.test(endpoint)) {
      await respondJson(route, { profile: sampleProfile });
      return;
    }

    if (/^\/social\/profiles\/[^/]+\/posts$/.test(endpoint)) {
      await respondJson(route, {
        posts: samplePosts,
        pagination,
      });
      return;
    }

    if (endpoint === "/social/notifications") {
      await respondJson(route, {
        notifications: sampleNotifications,
        unreadCount: sampleNotifications.filter((item) => !item.isRead).length,
        pagination: {
          page: 1,
          limit: 20,
          total: sampleNotifications.length,
          totalPages: 1,
          hasNextPage: false,
        },
      });
      return;
    }

    if (/^\/social\/notifications\/[^/]+\/read$/.test(endpoint)) {
      await respondJson(route, { notification: sampleNotifications[0] });
      return;
    }

    if (endpoint === "/social/notifications/read-all") {
      await respondJson(route, { ok: true });
      return;
    }

    if (/^\/social\/posts\/[^/]+\/comments$/.test(endpoint)) {
      await respondJson(route, { comments: [], pagination });
      return;
    }

    if (/^\/social\/posts\/[^/]+\/engagement$/.test(endpoint)) {
      await respondJson(route, {
        likers: [],
        commenters: [],
        reactionBreakdown: {
          like: 0,
          love: 0,
          haha: 0,
          wow: 0,
          sad: 0,
          angry: 0,
        },
        recentComments: [],
      });
      return;
    }

    if (/^\/social\/posts\/[^/]+\/like$/.test(endpoint)) {
      const postId = endpoint.split("/")[3];
      await respondJson(route, {
        liked: true,
        ownReaction: "like",
        likesCount: 1,
        reactionSummary: {
          like: 1,
          love: 0,
          haha: 0,
          wow: 0,
          sad: 0,
          angry: 0,
        },
        postId,
      });
      return;
    }

    if (endpoint === "/auth/signout") {
      await respondJson(route, { ok: true });
      return;
    }

    await respondJson(route, { ok: true });
  });
};

const collectLayoutMetrics = async (page) => {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const doc = document.documentElement;
    const body = document.body;
    const hasOverflow = doc.scrollWidth > vw + 1;

    const offenders = [];
    const nodes = Array.from(document.querySelectorAll("body *"));

    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }

      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") {
        continue;
      }

      const rect = node.getBoundingClientRect();
      if (!Number.isFinite(rect.right) || !Number.isFinite(rect.left)) {
        continue;
      }

      const overflowRight = rect.right - vw;
      const overflowLeft = 0 - rect.left;

      if (overflowRight > 1 || overflowLeft > 1) {
        offenders.push({
          tag: node.tagName.toLowerCase(),
          className: String(node.className || "").trim().replace(/\s+/g, "."),
          overflowRight: Number(overflowRight.toFixed(2)),
          overflowLeft: Number(overflowLeft.toFixed(2)),
          width: Number(rect.width.toFixed(2)),
        });
      }
    }

    offenders.sort(
      (a, b) =>
        b.overflowRight + b.overflowLeft - (a.overflowRight + a.overflowLeft),
    );

    return {
      viewportWidth: vw,
      scrollWidth: doc.scrollWidth,
      bodyHeight: body.scrollHeight,
      hasHorizontalOverflow: hasOverflow,
      offenderCount: offenders.length,
      topOffenders: offenders.slice(0, 8),
    };
  });
};

const run = async () => {
  await ensureDir(outDir);

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const width of viewports) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 2,
      isMobile: width < 768,
      hasTouch: width < 768,
    });

    await addApiMocks(context);

    const page = await context.newPage();
    await page.goto(`${baseUrl}/signin`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(160);

    for (const route of routes) {
      await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1400);

      const metrics = await collectLayoutMetrics(page);
      const screenshot = `${route.key}-${width}.png`;
      const currentPath = await page.evaluate(() => window.location.pathname);
      await page.screenshot({
        path: path.join(outDir, screenshot),
        fullPage: true,
      });

      results.push({
        route: route.path,
        key: route.key,
        width,
        screenshot,
        currentPath,
        ...metrics,
      });
    }

    await context.close();
  }

  await browser.close();

  await fs.writeFile(
    path.join(outDir, "metrics.json"),
    JSON.stringify(results, null, 2),
    "utf8",
  );

  console.log(`Saved ${results.length} cases to ${outDir}`);
  for (const item of results) {
    console.log(
      `${item.key}@${item.width}: overflow=${item.hasHorizontalOverflow} scroll=${item.scrollWidth} offenders=${item.offenderCount}`,
    );
  }
};

run().catch((error) => {
  console.error("viewport_qa_sweep failed", error);
  process.exitCode = 1;
});
