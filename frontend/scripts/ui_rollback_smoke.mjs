import { chromium } from "playwright";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://127.0.0.1:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:5001/api";
const TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD || "P@ssw0rd123";

const now = Date.now();

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

    await page.goto(`${APP_BASE_URL}/signin`, { waitUntil: "networkidle" });

    const uiSignInOk = await page.evaluate(async ({ username, password }) => {
      const { useAuthStore } = await import("/src/stores/useAuthStore.ts");
      return useAuthStore.getState().signIn(username, password);
    }, {
      username: users.owner.username,
      password: users.owner.password,
    });

    if (!uiSignInOk) {
      const diagnostic = await page.evaluate(async ({ username, password }) => {
        try {
          const response = await fetch("/api/node/auth/signin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          let payload = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }
          return {
            ok: response.ok,
            status: response.status,
            payload,
          };
        } catch (error) {
          return {
            ok: false,
            status: 0,
            payload: { message: String(error?.message || error) },
          };
        }
      }, {
        username: users.owner.username,
        password: users.owner.password,
      });

      throw new Error(
        `UI signIn via store returned false (diagnostic status=${diagnostic.status}, message=${diagnostic?.payload?.message || "n/a"})`,
      );
    }

    await page.goto(`${APP_BASE_URL}/post/${postId}`, { waitUntil: "networkidle" });

    const card = page.locator("article", { hasText: postCaption }).first();
    await expectVisible(card, "Post card not visible before delete test");

    await card.getByRole("button", { name: /Binh luan/i }).first().click();
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

    await card.getByTestId("delete-post-button").click();
    await page.waitForTimeout(800);

    await expectVisible(card, "Post rollback failed after delete API failure");

    await deleteCommentButton.click();
    await page.waitForTimeout(800);

    await expectVisible(
      deleteCommentButton,
      "Comment rollback failed after delete API failure",
    );

    console.log("PASS | D-post-rollback | Post still visible after forced delete failure");
    console.log("PASS | D-comment-rollback | Comment still visible after forced delete failure");
  } finally {
    await context.close();
    await browser.close();
  }
};

run().catch((error) => {
  console.error("FAIL | D-rollback-smoke |", error.message);
  process.exit(1);
});
