const base = "http://127.0.0.1:5001/api";
const now = Date.now();

const users = {
  a: {
    username: `smokea_${now}`.toLowerCase(),
    password: "P@ssw0rd123",
    email: `smokea_${now}@local.dev`,
    firstName: "Smoke",
    lastName: "Owner",
  },
  b: {
    username: `smokeb_${now}`.toLowerCase(),
    password: "P@ssw0rd123",
    email: `smokeb_${now}@local.dev`,
    firstName: "Smoke",
    lastName: "Guest",
  },
};

const results = [];

const record = (id, title, pass, detail) => {
  results.push({ id, title, pass, detail });
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

  return { status: res.status, ok: res.ok, json };
};

const signupAndSignin = async (u) => {
  const signup = await req("/auth/signup", { method: "POST", body: u });
  record("SETUP-SIGNUP", `Signup ${u.username}`, signup.status === 204, `status=${signup.status}`);

  const signin = await req("/auth/signin", {
    method: "POST",
    body: { username: u.username, password: u.password },
  });

  const pass = signin.status === 200 && !!signin?.json?.accessToken && !!signin?.json?.user?._id;
  record("SETUP-SIGNIN", `Signin ${u.username}`, pass, `status=${signin.status}`);

  if (!pass) {
    throw new Error(`Cannot sign in ${u.username}: ${signin.status} ${JSON.stringify(signin.json)}`);
  }

  return {
    token: signin.json.accessToken,
    userId: signin.json.user._id,
  };
};

const sumReaction = (summary = {}) =>
  Object.values(summary).reduce((acc, value) => acc + Number(value || 0), 0);

(async () => {
  try {
    const authA = await signupAndSignin(users.a);
    const authB = await signupAndSignin(users.b);

    const createA = await req("/social/posts", {
      method: "POST",
      token: authA.token,
      body: { caption: `Phase2 A ${now}` },
    });
    const postAId = createA?.json?.post?._id;
    record("A1", "Create post as owner", createA.status === 201 && !!postAId, `status=${createA.status}`);

    const bDeleteForbidden = await req(`/social/posts/${postAId}`, {
      method: "DELETE",
      token: authB.token,
    });
    record("A-N1", "Non-owner delete returns 403", bDeleteForbidden.status === 403, `status=${bDeleteForbidden.status}`);

    const invalidDelete = await req("/social/posts/not-an-objectid", {
      method: "DELETE",
      token: authA.token,
    });
    record("A-N2", "Invalid post id returns 400", invalidDelete.status === 400, `status=${invalidDelete.status}`);

    const ownerDelete = await req(`/social/posts/${postAId}`, {
      method: "DELETE",
      token: authA.token,
    });
    record("A2", "Owner delete returns 200", ownerDelete.status === 200 && ownerDelete?.json?.ok === true, `status=${ownerDelete.status}`);

    const deletedGet = await req(`/social/posts/${postAId}`, {
      method: "GET",
      token: authA.token,
    });
    record("A3", "Deleted post is not retrievable", deletedGet.status === 404, `status=${deletedGet.status}`);

    const deleteAgain = await req(`/social/posts/${postAId}`, {
      method: "DELETE",
      token: authA.token,
    });
    record("A-N3", "Delete already deleted post returns 404", deleteAgain.status === 404, `status=${deleteAgain.status}`);

    const createBPost = await req("/social/posts", {
      method: "POST",
      token: authA.token,
      body: { caption: `Phase2 B ${now}` },
    });
    const postBId = createBPost?.json?.post?._id;
    record("B1", "Create post for comment tree", createBPost.status === 201 && !!postBId, `status=${createBPost.status}`);

    const rootComment = await req(`/social/posts/${postBId}/comments`, {
      method: "POST",
      token: authA.token,
      body: { content: "Root comment" },
    });
    const rootId = rootComment?.json?.comment?._id;
    record("B2", "Create root comment", rootComment.status === 201 && !!rootId, `status=${rootComment.status}`);

    const replyComment = await req(`/social/posts/${postBId}/comments`, {
      method: "POST",
      token: authB.token,
      body: { content: "Reply comment", parentCommentId: rootId },
    });
    const replyId = replyComment?.json?.comment?._id;
    record("B3", "Create reply comment", replyComment.status === 201 && !!replyId, `status=${replyComment.status}`);

    const invalidParent = await req(`/social/posts/${postBId}/comments`, {
      method: "POST",
      token: authB.token,
      body: { content: "Bad parent", parentCommentId: "not-an-objectid" },
    });
    record("B-N1", "Invalid parentCommentId returns 400", invalidParent.status === 400, `status=${invalidParent.status}`);

    const createOtherPost = await req("/social/posts", {
      method: "POST",
      token: authA.token,
      body: { caption: `Phase2 B-other ${now}` },
    });
    const otherPostId = createOtherPost?.json?.post?._id;

    const wrongPathDelete = await req(`/social/posts/${otherPostId}/comments/${rootId}`, {
      method: "DELETE",
      token: authA.token,
    });
    record("B-N2", "Delete comment using different post path returns 404", wrongPathDelete.status === 404, `status=${wrongPathDelete.status}`);

    const bCannotDeleteRoot = await req(`/social/posts/${postBId}/comments/${rootId}`, {
      method: "DELETE",
      token: authB.token,
    });
    record("B-N3", "Unauthorized comment delete returns 403", bCannotDeleteRoot.status === 403, `status=${bCannotDeleteRoot.status}`);

    const ownerDeleteRoot = await req(`/social/posts/${postBId}/comments/${rootId}`, {
      method: "DELETE",
      token: authA.token,
    });
    const deletedCount = Number(ownerDeleteRoot?.json?.deletedCount || 0);
    record("B4", "Owner delete root subtree returns deletedCount >= 2", ownerDeleteRoot.status === 200 && deletedCount >= 2, `status=${ownerDeleteRoot.status}, deletedCount=${deletedCount}`);

    const afterDeleteComments = await req(`/social/posts/${postBId}/comments`, {
      method: "GET",
      token: authA.token,
    });
    const totalComments = Number(afterDeleteComments?.json?.pagination?.total || 0);
    record("B5", "Comments endpoint reflects subtree removal", afterDeleteComments.status === 200 && totalComments === 0, `status=${afterDeleteComments.status}, total=${totalComments}`);

    const postAfterCommentDelete = await req(`/social/posts/${postBId}`, {
      method: "GET",
      token: authA.token,
    });
    const postPayload = postAfterCommentDelete?.json?.post || {};
    const commentsCount = Number(
      postPayload.commentsCount ?? postPayload.commentCount ?? -1,
    );
    record(
      "B6",
      "Post commentsCount updated after subtree delete",
      postAfterCommentDelete.status === 200 && commentsCount === 0,
      `status=${postAfterCommentDelete.status}, commentsCount=${commentsCount}`,
    );

    const createC = await req("/social/posts", {
      method: "POST",
      token: authA.token,
      body: { caption: `Phase2 C ${now}` },
    });
    const postCId = createC?.json?.post?._id;
    record("C1", "Create post for reaction race", createC.status === 201 && !!postCId, `status=${createC.status}`);

    const reactionTypes = ["like", "love", "haha", "wow", "sad", "angry"];
    const parallelOps = Array.from({ length: 24 }, (_, idx) => {
      const reaction = reactionTypes[idx % reactionTypes.length];
      return req(`/social/posts/${postCId}/like`, {
        method: "POST",
        token: authA.token,
        body: { reaction },
      });
    });

    const raceResponses = await Promise.all(parallelOps);
    const no500 = raceResponses.every((r) => r.status < 500);
    record("C2", "Parallel reactions return without 5xx", no500, `statuses=${raceResponses.map((r) => r.status).join(",")}`);

    const finalPost = await req(`/social/posts/${postCId}`, {
      method: "GET",
      token: authA.token,
    });

    const likesCount = Number(finalPost?.json?.post?.likesCount || 0);
    const ownReaction = finalPost?.json?.post?.ownReaction || null;
    const reactionSummary = finalPost?.json?.post?.reactionSummary || {};
    const reactionTotal = sumReaction(reactionSummary);

    record(
      "C3",
      "likesCount remains bounded for single user",
      likesCount >= 0 && likesCount <= 1,
      `likesCount=${likesCount}`,
    );
    record("C4", "reactionSummary total equals likesCount", reactionTotal === likesCount, `reactionTotal=${reactionTotal}, likesCount=${likesCount}`);
    record(
      "C5",
      "ownReaction matches likes state",
      (likesCount === 0 && ownReaction === null) ||
        (likesCount === 1 && !!ownReaction && reactionTypes.includes(ownReaction)),
      `ownReaction=${ownReaction}, likesCount=${likesCount}`,
    );

    const passCount = results.filter((r) => r.pass).length;
    const failCount = results.length - passCount;

    console.log("=== PHASE 2 CHECKLIST A-C (API) ===");
    for (const r of results) {
      console.log(`${r.pass ? "PASS" : "FAIL"} | ${r.id} | ${r.title} | ${r.detail}`);
    }
    console.log("=== SUMMARY ===");
    console.log(JSON.stringify({ total: results.length, pass: passCount, fail: failCount }, null, 2));
  } catch (error) {
    console.error("Smoke runner failed:", error);
    process.exit(1);
  }
})();
