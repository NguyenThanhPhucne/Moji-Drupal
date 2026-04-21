import { chromium } from "playwright";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:5001/api";

const now = Date.now();
const TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD || `Rollback_${now}_Aa!`;

const users = {
  owner: {
    username: `rollback_owner_${now}`,
    password: TEST_PASSWORD,
    email: `rollback_owner_${now}@local.dev`,
    firstName: "Rollback",
    lastName: "Owner",
  },
  guest: {
    username: `rollback_guest_${now}`,
    password: TEST_PASSWORD,
    email: `rollback_guest_${now}@local.dev`,
    firstName: "Rollback",
    lastName: "Guest",
  },
};

const req = async (path, { method = "GET", token, body } = {}) => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  return { status: res.status, json };
};

const signupAndSignin = async (u) => {
  const signup = await req("/auth/signup", { method: "POST", body: u });
  if (signup.status !== 204) {
    throw new Error(`Signup failed for ${u.username}: ${signup.status}`);
  }

  const signin = await req("/auth/signin", {
    method: "POST",
    body: { username: u.username, password: u.password },
  });

  if (signin.status !== 200 || !signin?.json?.accessToken) {
    throw new Error(`Signin failed for ${u.username}: ${signin.status}`);
  }

  return signin.json;
};

const expectVisible = async (locator, message) => {
  const visible = await locator.isVisible();
  if (!visible) {
    throw new Error(message);
  }
};

const confirmDeleteIntent = async (page, preferredLabelRegex) => {
  const dialog = page.locator("[role='alertdialog']").last();
  await dialog.waitFor({ state: "visible", timeout: 12000 });

  const preferredActionButton = dialog.getByRole("button", {
    name: preferredLabelRegex,
  }).first();

  const hasPreferredAction = await preferredActionButton
    .isVisible()
    .catch(() => false);

  if (hasPreferredAction) {
    await preferredActionButton.click();
    return;
  }

  await dialog.getByRole("button", { name: /delete/i }).first().click();
};

const closeDeleteDialogIfOpen = async (page) => {
  const dialog = page.locator("[role='alertdialog']").last();
  const isVisible = await dialog.isVisible().catch(() => false);
  if (!isVisible) {
    return;
  }

  const cancelButton = dialog.getByRole("button", { name: /cancel/i }).first();
  const canCancel = await cancelButton.isVisible().catch(() => false);
  if (!canCancel) {
    return;
  }

  await cancelButton.click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
};

const signInPageSession = async ({ page, accessToken, user }) => {
  await page.goto(`${APP_BASE_URL}/signin`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.evaluate(({ fallbackAccessToken, fallbackUser }) => {
    globalThis.localStorage.setItem(
      "auth-storage",
      JSON.stringify({
        state: {
          user: fallbackUser || null,
          accessToken: fallbackAccessToken || null,
        },
        version: 0,
      }),
    );
  }, {
    fallbackAccessToken: accessToken || null,
    fallbackUser: user || null,
  });

  await page.goto(`${APP_BASE_URL}/`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page
    .waitForURL((url) => !url.pathname.includes("/signin"), {
      timeout: 9000,
    })
    .catch(() => undefined);

  if (new URL(page.url()).pathname.includes("/signin")) {
    throw new Error("Cannot leave /signin after auth-storage bootstrap");
  }
};

const run = async () => {
  const ownerAuth = await signupAndSignin(users.owner);
  const guestAuth = await signupAndSignin(users.guest);

  const postCaption = `ROLLBACK_POST_${now}`;
  const commentContent = `ROLLBACK_COMMENT_${now}`;

  const createPost = await req("/social/posts", {
    method: "POST",
    token: ownerAuth.accessToken,
    body: { caption: postCaption },
  });

  if (createPost.status !== 201 || !createPost?.json?.post?._id) {
    throw new Error(`Create post failed: ${createPost.status}`);
  }

  const postId = createPost.json.post._id;

  const createComment = await req(`/social/posts/${postId}/comments`, {
    method: "POST",
    token: guestAuth.accessToken,
    body: { content: commentContent },
  });

  if (createComment.status !== 201 || !createComment?.json?.comment?._id) {
    throw new Error(`Create comment failed: ${createComment.status}`);
  }

  const commentId = createComment.json.comment._id;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await signInPageSession({
      page,
      accessToken: ownerAuth.accessToken,
      user: ownerAuth.user,
    });

    await page.goto(`${APP_BASE_URL}/post/${postId}`, { waitUntil: "networkidle" });

    const card = page.locator("article", { hasText: postCaption }).first();
    await expectVisible(card, "Post card not visible before delete test");

    const commentButton = card.getByTestId("post-comment-button").first();
    const commentButtonVisible = await commentButton.isVisible().catch(() => false);
    if (commentButtonVisible) {
      await commentButton.click();
    } else {
      await card.getByRole("button", { name: /comment/i }).first().click();
    }

    const deleteCommentButton = card.getByTestId(`delete-comment-${commentId}`);
    await deleteCommentButton.waitFor({ state: "visible", timeout: 12000 });

    await page.route(`**/social/posts/${postId}`, async (route, request) => {
      if (request.method() === "DELETE") {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.route(`**/social/posts/${postId}/comments/${commentId}`, async (route, request) => {
      if (request.method() === "DELETE") {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await deleteCommentButton.click();
    await confirmDeleteIntent(page, /delete comment|delete/i);
    await page.waitForTimeout(800);

    await expectVisible(
      deleteCommentButton,
      "Comment rollback failed after delete API failure",
    );

    await closeDeleteDialogIfOpen(page);

    await card.getByTestId("delete-post-button").click();
    await confirmDeleteIntent(page, /delete post|delete/i);
    await page.waitForTimeout(800);

    await expectVisible(card, "Post rollback failed after delete API failure");
    await closeDeleteDialogIfOpen(page);

    console.log("PASS | D-post-rollback | Post still visible after forced delete failure");
    console.log("PASS | D-comment-rollback | Comment still visible after forced delete failure");
  } finally {
    await context.close();
    await browser.close();
  }
};

try {
  await run();
} catch (error) {
  console.error("FAIL | D-rollback-smoke |", error.message);
  process.exit(1);
}
