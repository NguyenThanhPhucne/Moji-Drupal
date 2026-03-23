const base =
  process.argv[2] || process.env.BASE_URL || "http://localhost:5001/api";
const username = "admin";
const oldPass = "Temp@123456";
const newPass = "Temp@123456_";

const postJson = async (url, body, token) => {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status: res.status, data };
};

const signinOld1 = await postJson(base + "/auth/signin", {
  username,
  password: oldPass,
});

if (signinOld1.status !== 200 || !signinOld1.data?.accessToken) {
  console.log(
    JSON.stringify(
      { ok: false, step: "signin_old_initial", result: signinOld1 },
      null,
      2,
    ),
  );
  process.exit(1);
}

const token1 = signinOld1.data.accessToken;
const changeToNew = await postJson(
  base + "/users/change-password",
  {
    currentPassword: oldPass,
    newPassword: newPass,
  },
  token1,
);

const signinOldAfterChange = await postJson(base + "/auth/signin", {
  username,
  password: oldPass,
});

const signinNew = await postJson(base + "/auth/signin", {
  username,
  password: newPass,
});

if (signinNew.status !== 200 || !signinNew.data?.accessToken) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        step: "signin_new_after_change",
        result: signinNew,
        changeToNew,
        signinOldAfterChange,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const token2 = signinNew.data.accessToken;
const changeBack = await postJson(
  base + "/users/change-password",
  {
    currentPassword: newPass,
    newPassword: oldPass,
  },
  token2,
);

const signinOldFinal = await postJson(base + "/auth/signin", {
  username,
  password: oldPass,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      changeToNew,
      signinOldAfterChange,
      signinNew: {
        status: signinNew.status,
        hasToken: Boolean(signinNew.data?.accessToken),
      },
      changeBack,
      signinOldFinal: {
        status: signinOldFinal.status,
        hasToken: Boolean(signinOldFinal.data?.accessToken),
      },
    },
    null,
    2,
  ),
);
