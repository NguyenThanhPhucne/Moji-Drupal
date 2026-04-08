const base = "http://127.0.0.1:5001/api";
const now = Date.now();

const users = {
  a: {
    username: `dqsa_${now}`,
    password: "P@ssw0rd123",
    email: `dqsa_${now}@local.dev`,
    firstName: "Direct",
    lastName: "A",
  },
  b: {
    username: `dqsb_${now}`,
    password: "P@ssw0rd123",
    email: `dqsb_${now}@local.dev`,
    firstName: "Direct",
    lastName: "B",
  },
};

const req = async (path, { method = "GET", token, body } = {}) => {
  const res = await fetch(`${base}${path}`, {
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

const signupSignin = async (u) => {
  const signup = await req("/auth/signup", { method: "POST", body: u });
  if (signup.status !== 204) {
    throw new Error(`signup ${u.username} failed: ${signup.status}`);
  }

  const signin = await req("/auth/signin", {
    method: "POST",
    body: { username: u.username, password: u.password },
  });

  if (signin.status !== 200 || !signin.json?.accessToken || !signin.json?.user?._id) {
    throw new Error(`signin ${u.username} failed: ${signin.status}`);
  }

  return { token: signin.json.accessToken, userId: signin.json.user._id };
};

const befriend = async (from, to) => {
  const send = await req("/friends/requests", {
    method: "POST",
    token: from.token,
    body: { to: to.userId, message: "quick smoke" },
  });

  if (send.status !== 201) {
    throw new Error(`send friend request failed: ${send.status}`);
  }

  const requests = await req("/friends/requests", { token: to.token });
  const target = (requests.json?.received || []).find(
    (item) => String(item.from?._id || "") === String(from.userId),
  );

  if (!target?._id) {
    throw new Error("incoming friend request not found");
  }

  const accept = await req(`/friends/requests/${target._id}/accept`, {
    method: "POST",
    token: to.token,
  });

  if (accept.status !== 200) {
    throw new Error(`accept friend request failed: ${accept.status}`);
  }
};

const createDirectConversation = async (from, toUserId) => {
  const create = await req("/conversations", {
    method: "POST",
    token: from.token,
    body: { type: "direct", name: "", memberIds: [toUserId] },
  });

  if (create.status !== 201 || !create.json?.conversation?._id) {
    throw new Error(`create direct conversation failed: ${create.status}`);
  }

  return create.json.conversation._id;
};

(async () => {
  const results = [];
  const log = (id, pass, detail) => {
    results.push({ id, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"} | ${id} | ${detail}`);
  };

  try {
    const a = await signupSignin(users.a);
    const b = await signupSignin(users.b);
    await befriend(a, b);

    const case1 = await req("/messages/direct", {
      method: "POST",
      token: a.token,
      body: {
        recipientId: b.userId,
        content: "quick case 1 without conversationId",
      },
    });

    const case1Pass = case1.status === 201 && !!case1.json?.message?._id;
    log("CASE-1", case1Pass, `status=${case1.status}`);

    const directConversationId = await createDirectConversation(a, b.userId);
    const case2 = await req("/messages/direct", {
      method: "POST",
      token: a.token,
      body: {
        recipientId: b.userId,
        conversationId: directConversationId,
        content: "quick case 2 with valid conversationId",
      },
    });

    const case2Pass =
      case2.status === 201 &&
      !!case2.json?.message?._id &&
      String(case2.json?.message?.conversationId || "") === String(directConversationId);
    log("CASE-2", case2Pass, `status=${case2.status}`);

    const passCount = results.filter((item) => item.pass).length;
    const failCount = results.length - passCount;
    console.log("SUMMARY", JSON.stringify({ total: results.length, pass: passCount, fail: failCount }));

    process.exitCode = failCount > 0 ? 1 : 0;
  } catch (error) {
    console.error("FAIL | DIRECT-QUICK-SMOKE |", error?.message || error);
    process.exitCode = 1;
  }
})();
