import { chromium } from "playwright";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:5001/api";
const runTag = Date.now();
const TEST_PASSWORD = `P@ssw0rd-${runTag}`;

const smokeUser = {
  username: `mini_cookie_diag_${runTag}`,
  password: TEST_PASSWORD,
  email: `mini_cookie_diag_${runTag}@local.dev`,
  firstName: "Mini",
  lastName: "Diag",
};

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

const run = async () => {
  const signup = await req("/auth/signup", {
    method: "POST",
    body: smokeUser,
  });

  if (signup.status !== 204) {
    throw new Error(`Signup failed: ${signup.status}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: {
      width: 1366,
      height: 768,
    },
  });

  try {
    const signInRes = await context.request.post(`${APP_BASE_URL}/api/node/auth/signin`, {
      data: {
        username: smokeUser.username,
        password: smokeUser.password,
      },
    });

    const signInJson = await signInRes.json().catch(() => null);

    console.log("[diag-cookie] signin-status", signInRes.status());
    console.log("[diag-cookie] signin-has-token", Boolean(signInJson?.accessToken));

    const cookieSnapshot = await context.cookies();
    console.log("[diag-cookie] cookie-count", cookieSnapshot.length);

    const page = await context.newPage();

    await page.addInitScript(({ user }) => {
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
      user: signInJson?.user || null,
    });

    await page.goto(`${APP_BASE_URL}/feed`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(2500);

    const result = await page.evaluate(() => ({
      path: globalThis.location.pathname,
      hasSocialShell: Boolean(document.querySelector(".social-page-shell")),
      hasSignInLabel: /welcome back/i.test(document.body.innerText || ""),
    }));

    console.log("[diag-cookie] result", JSON.stringify(result));
  } finally {
    await context.close();
    await browser.close();
  }
};

run().catch((error) => {
  console.error("mini-chat cookie auth diag failed", error);
  process.exitCode = 1;
});
