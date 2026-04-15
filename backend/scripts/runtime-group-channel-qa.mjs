const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5001/api";
const runTag = Date.now();

const users = {
  owner: {
    username: `qa_owner_${runTag}`,
    password: `Qa_${runTag}_Aa!`,
    email: `qa_owner_${runTag}@local.dev`,
    firstName: "Qa",
    lastName: "Owner",
  },
  admin: {
    username: `qa_admin_${runTag}`,
    password: `Qa_${runTag}_Aa!`,
    email: `qa_admin_${runTag}@local.dev`,
    firstName: "Qa",
    lastName: "Admin",
  },
  member: {
    username: `qa_member_${runTag}`,
    password: `Qa_${runTag}_Aa!`,
    email: `qa_member_${runTag}@local.dev`,
    firstName: "Qa",
    lastName: "Member",
  },
};

const results = [];

const record = (id, title, pass, detail) => {
  const item = { id, title, pass: Boolean(pass), detail: String(detail || "") };
  results.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} | ${id} | ${title} | ${item.detail}`);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readRetryAfterSeconds = ({ data, headers }) => {
  const fromBody = Number(data?.retryAfterSeconds);
  if (Number.isFinite(fromBody) && fromBody > 0) {
    return Math.max(1, Math.floor(fromBody));
  }

  const fromHeader = Number(headers?.get?.("retry-after") || 0);
  if (Number.isFinite(fromHeader) && fromHeader > 0) {
    return Math.max(1, Math.floor(fromHeader));
  }

  return 1;
};

const api = async (
  path,
  {
    method = "GET",
    token,
    body,
    retry429 = true,
    retriesLeft = 4,
  } = {},
) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (retry429 && response.status === 429 && retriesLeft > 0) {
    const retryAfterSeconds = readRetryAfterSeconds({ data, headers: response.headers });
    await wait((retryAfterSeconds + 0.1) * 1000);
    return api(path, {
      method,
      token,
      body,
      retry429,
      retriesLeft: retriesLeft - 1,
    });
  }

  return {
    status: response.status,
    ok: response.ok,
    data,
  };
};

const signupAndSignin = async (label, user) => {
  const signupResponse = await api("/auth/signup", {
    method: "POST",
    body: user,
    retry429: true,
  });

  record(
    `SETUP-SIGNUP-${label}`,
    `Signup ${label}`,
    signupResponse.status === 204,
    `status=${signupResponse.status}`,
  );

  const signinResponse = await api("/auth/signin", {
    method: "POST",
    body: {
      username: user.username,
      password: user.password,
    },
    retry429: true,
  });

  const signedIn =
    signinResponse.status === 200 &&
    Boolean(signinResponse.data?.accessToken) &&
    Boolean(signinResponse.data?.user?._id);

  record(
    `SETUP-SIGNIN-${label}`,
    `Signin ${label}`,
    signedIn,
    `status=${signinResponse.status}`,
  );

  if (!signedIn) {
    throw new Error(`Cannot sign in ${label}: ${signinResponse.status}`);
  }

  return {
    token: signinResponse.data.accessToken,
    userId: String(signinResponse.data.user._id),
  };
};

const befriend = async ({ fromToken, fromUserId, toToken, toUserId, label }) => {
  const requestResponse = await api("/friends/requests", {
    method: "POST",
    token: fromToken,
    body: {
      to: toUserId,
      message: `QA friend request ${runTag}`,
    },
  });

  record(
    `SETUP-FRIEND-REQ-${label}`,
    `Send friend request owner -> ${label}`,
    requestResponse.status === 201,
    `status=${requestResponse.status}`,
  );

  if (requestResponse.status !== 201) {
    throw new Error(`Cannot send friend request to ${label}: ${requestResponse.status}`);
  }

  const inbox = await api("/friends/requests", {
    method: "GET",
    token: toToken,
  });

  const received = Array.isArray(inbox.data?.received) ? inbox.data.received : [];
  const pending = received.find(
    (item) => String(item?.from?._id || "") === String(fromUserId),
  );

  if (!pending?._id) {
    throw new Error(`Cannot find friend request for ${label}`);
  }

  const accept = await api(`/friends/requests/${pending._id}/accept`, {
    method: "POST",
    token: toToken,
  });

  record(
    `SETUP-FRIEND-ACCEPT-${label}`,
    `${label} accepts friend request`,
    accept.status === 200,
    `status=${accept.status}`,
  );

  if (accept.status !== 200) {
    throw new Error(`Cannot accept friend request for ${label}: ${accept.status}`);
  }
};

const createGroupConversation = async ({ ownerToken, memberIds, name }) => {
  const createResponse = await api("/conversations", {
    method: "POST",
    token: ownerToken,
    body: {
      type: "group",
      name,
      memberIds,
    },
  });

  const conversationId = String(createResponse.data?.conversation?._id || "");

  return {
    response: createResponse,
    conversationId,
    conversation: createResponse.data?.conversation || null,
  };
};

const getConversationById = async ({ token, conversationId }) => {
  const response = await api("/conversations", {
    method: "GET",
    token,
  });

  if (!response.ok || !Array.isArray(response.data?.conversations)) {
    return {
      response,
      conversation: null,
    };
  }

  return {
    response,
    conversation:
      response.data.conversations.find(
        (conversation) => String(conversation?._id || "") === String(conversationId),
      ) || null,
  };
};

const getChannelUnreadCount = ({ conversation, userId, channelId }) => {
  return Number(
    conversation?.group?.channelUnreadCounts?.[String(userId)]?.[String(channelId)] || 0,
  );
};

const sumUnreadMap = (mapValue) => {
  if (!mapValue || typeof mapValue !== "object" || Array.isArray(mapValue)) {
    return 0;
  }

  return Object.values(mapValue).reduce((sum, count) => {
    const parsed = Number(count);
    return sum + (Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0);
  }, 0);
};

const getChannelByName = (conversation, channelName) => {
  const channels = Array.isArray(conversation?.group?.channels)
    ? conversation.group.channels
    : [];

  return channels.find((channel) => String(channel?.name || "") === String(channelName));
};

const getCategoryByName = (conversation, categoryName) => {
  const categories = Array.isArray(conversation?.group?.channelCategories)
    ? conversation.group.channelCategories
    : [];

  return categories.find(
    (category) => String(category?.name || "") === String(categoryName),
  );
};

const sendGroupMessage = async ({ token, conversationId, channelId, content }) => {
  return api("/messages/group", {
    method: "POST",
    token,
    body: {
      conversationId,
      groupChannelId: channelId,
      content,
    },
  });
};

const getChannelAnalyticsById = (analyticsPayload, channelId) => {
  const channels = Array.isArray(analyticsPayload?.channels) ? analyticsPayload.channels : [];
  return channels.find((channel) => String(channel?.channelId || "") === String(channelId)) || null;
};

const runPermissionMatrix = async ({ owner, admin, member, conversationId }) => {
  const promoteAdmin = await api(`/conversations/${conversationId}/admin-role`, {
    method: "PATCH",
    token: owner.token,
    body: {
      memberId: admin.userId,
      makeAdmin: true,
    },
  });

  record(
    "MATRIX-ADMIN-PROMOTE",
    "Promote admin user",
    promoteAdmin.status === 200,
    `status=${promoteAdmin.status}`,
  );

  const createOwnerOnlyChannel = await api(`/conversations/${conversationId}/channels`, {
    method: "POST",
    token: owner.token,
    body: {
      name: `owner-only-${runTag}`,
      description: "Owner-only posting",
      sendRoles: ["owner"],
    },
  });

  const ownerOnlyChannelId = String(createOwnerOnlyChannel.data?.channel?.channelId || "");
  record(
    "MATRIX-CHANNEL-CREATE",
    "Create owner-only channel",
    createOwnerOnlyChannel.status === 201 && Boolean(ownerOnlyChannelId),
    `status=${createOwnerOnlyChannel.status}, channelId=${ownerOnlyChannelId || "-"}`,
  );

  if (!ownerOnlyChannelId) {
    throw new Error("Cannot continue permission matrix without owner-only channel");
  }

  const ownerAllowed = await sendGroupMessage({
    token: owner.token,
    conversationId,
    channelId: ownerOnlyChannelId,
    content: "owner can post",
  });
  const adminDenied = await sendGroupMessage({
    token: admin.token,
    conversationId,
    channelId: ownerOnlyChannelId,
    content: "admin blocked on owner-only",
  });
  const memberDenied = await sendGroupMessage({
    token: member.token,
    conversationId,
    channelId: ownerOnlyChannelId,
    content: "member blocked on owner-only",
  });

  record(
    "MATRIX-OWNER-ONLY",
    "Role matrix on owner-only channel",
    ownerAllowed.status === 201 && adminDenied.status === 403 && memberDenied.status === 403,
    `owner=${ownerAllowed.status}, admin=${adminDenied.status}, member=${memberDenied.status}`,
  );

  const allowOwnerAdmin = await api(
    `/conversations/${conversationId}/channels/${ownerOnlyChannelId}`,
    {
      method: "PATCH",
      token: owner.token,
      body: {
        sendRoles: ["owner", "admin"],
      },
    },
  );

  record(
    "MATRIX-UPDATE-OWNER-ADMIN",
    "Update channel permissions to owner+admin",
    allowOwnerAdmin.status === 200,
    `status=${allowOwnerAdmin.status}`,
  );

  const ownerAllowed2 = await sendGroupMessage({
    token: owner.token,
    conversationId,
    channelId: ownerOnlyChannelId,
    content: "owner still can post",
  });
  const adminAllowed2 = await sendGroupMessage({
    token: admin.token,
    conversationId,
    channelId: ownerOnlyChannelId,
    content: "admin can post now",
  });
  const memberDenied2 = await sendGroupMessage({
    token: member.token,
    conversationId,
    channelId: ownerOnlyChannelId,
    content: "member still blocked",
  });

  record(
    "MATRIX-OWNER-ADMIN",
    "Role matrix on owner+admin channel",
    ownerAllowed2.status === 201 && adminAllowed2.status === 201 && memberDenied2.status === 403,
    `owner=${ownerAllowed2.status}, admin=${adminAllowed2.status}, member=${memberDenied2.status}`,
  );

  const allowAll = await api(`/conversations/${conversationId}/channels/${ownerOnlyChannelId}`, {
    method: "PATCH",
    token: owner.token,
    body: {
      sendRoles: ["owner", "admin", "member"],
    },
  });

  record(
    "MATRIX-UPDATE-ALL",
    "Update channel permissions to owner+admin+member",
    allowAll.status === 200,
    `status=${allowAll.status}`,
  );

  const memberAllowed = await sendGroupMessage({
    token: member.token,
    conversationId,
    channelId: ownerOnlyChannelId,
    content: "member can post now",
  });

  record(
    "MATRIX-ALL-ROLES",
    "Member can post when channel allows all roles",
    memberAllowed.status === 201,
    `member=${memberAllowed.status}`,
  );
};

const runCategoryChannelCrudFlow = async ({ owner, conversationId }) => {
  const createBacklog = await api(`/conversations/${conversationId}/channel-categories`, {
    method: "POST",
    token: owner.token,
    body: {
      name: `backlog-${runTag}`,
    },
  });
  const backlogId = String(createBacklog.data?.category?.categoryId || "");
  record(
    "FLOW-CAT-CREATE-1",
    "Create category backlog",
    createBacklog.status === 201 && Boolean(backlogId),
    `status=${createBacklog.status}, categoryId=${backlogId || "-"}`,
  );

  const createReleases = await api(`/conversations/${conversationId}/channel-categories`, {
    method: "POST",
    token: owner.token,
    body: {
      name: `releases-${runTag}`,
    },
  });
  const releasesId = String(createReleases.data?.category?.categoryId || "");
  record(
    "FLOW-CAT-CREATE-2",
    "Create category releases",
    createReleases.status === 201 && Boolean(releasesId),
    `status=${createReleases.status}, categoryId=${releasesId || "-"}`,
  );

  const createRoadmap = await api(`/conversations/${conversationId}/channels`, {
    method: "POST",
    token: owner.token,
    body: {
      name: `roadmap-${runTag}`,
      description: "Roadmap channel",
      categoryId: backlogId,
      sendRoles: ["owner", "admin", "member"],
    },
  });
  const roadmapChannelId = String(createRoadmap.data?.channel?.channelId || "");
  record(
    "FLOW-CHANNEL-CREATE-1",
    "Create channel roadmap",
    createRoadmap.status === 201 && Boolean(roadmapChannelId),
    `status=${createRoadmap.status}, channelId=${roadmapChannelId || "-"}`,
  );

  const createHotfix = await api(`/conversations/${conversationId}/channels`, {
    method: "POST",
    token: owner.token,
    body: {
      name: `hotfix-${runTag}`,
      description: "Hotfix channel",
      categoryId: releasesId,
      sendRoles: ["owner", "admin"],
    },
  });
  const hotfixChannelId = String(createHotfix.data?.channel?.channelId || "");
  record(
    "FLOW-CHANNEL-CREATE-2",
    "Create channel hotfix",
    createHotfix.status === 201 && Boolean(hotfixChannelId),
    `status=${createHotfix.status}, channelId=${hotfixChannelId || "-"}`,
  );

  const updateHotfix = await api(`/conversations/${conversationId}/channels/${hotfixChannelId}`, {
    method: "PATCH",
    token: owner.token,
    body: {
      name: `incident-${runTag}`,
      description: "Incident response channel",
      categoryId: releasesId,
      sendRoles: ["owner", "admin", "member"],
    },
  });

  record(
    "FLOW-CHANNEL-UPDATE",
    "Update channel name/description/category/permissions",
    updateHotfix.status === 200,
    `status=${updateHotfix.status}`,
  );

  const afterUpdateConversation = updateHotfix.data?.conversation || null;
  const channelsAfterUpdate = Array.isArray(afterUpdateConversation?.group?.channels)
    ? afterUpdateConversation.group.channels
    : [];

  const reorderedChannelIds = channelsAfterUpdate.map((channel) => String(channel.channelId));
  const hotfixIndex = reorderedChannelIds.indexOf(String(hotfixChannelId));

  if (hotfixIndex > 0) {
    reorderedChannelIds.splice(hotfixIndex, 1);
    reorderedChannelIds.unshift(String(hotfixChannelId));
  }

  const reorderChannelsResponse = await api(`/conversations/${conversationId}/channels/reorder`, {
    method: "PATCH",
    token: owner.token,
    body: {
      channelIds: reorderedChannelIds,
    },
  });

  const reorderedChannels = Array.isArray(reorderChannelsResponse.data?.conversation?.group?.channels)
    ? reorderChannelsResponse.data.conversation.group.channels
    : [];

  const reorderedSet = new Set(reorderedChannels.map((channel) => String(channel.channelId)));
  const requestedSet = new Set(reorderedChannelIds.map(String));
  const hasSameChannelSet =
    reorderedSet.size === requestedSet.size &&
    reorderedChannelIds.every((channelId) => reorderedSet.has(String(channelId)));

  record(
    "FLOW-CHANNEL-REORDER",
    "Reorder channels",
    reorderChannelsResponse.status === 200 && hasSameChannelSet,
    `status=${reorderChannelsResponse.status}, sameSet=${hasSameChannelSet}`,
  );

  const categoryState = await getConversationById({
    token: owner.token,
    conversationId,
  });

  const existingCategories = Array.isArray(categoryState.conversation?.group?.channelCategories)
    ? categoryState.conversation.group.channelCategories
    : [];

  const categoryOrder = existingCategories.map((category) => String(category.categoryId));
  const reversedCategoryOrder = [...categoryOrder].reverse();

  const reorderCategories = await api(
    `/conversations/${conversationId}/channel-categories/reorder`,
    {
      method: "PATCH",
      token: owner.token,
      body: {
        categoryIds: reversedCategoryOrder,
      },
    },
  );

  const reorderedCategories = Array.isArray(
    reorderCategories.data?.conversation?.group?.channelCategories,
  )
    ? reorderCategories.data.conversation.group.channelCategories
    : [];

  const isCategoryOrderAligned =
    reorderedCategories.length === reversedCategoryOrder.length &&
    reorderedCategories.every(
      (category, index) => String(category.categoryId) === String(reversedCategoryOrder[index]),
    );

  record(
    "FLOW-CATEGORY-REORDER",
    "Reorder categories",
    reorderCategories.status === 200 && isCategoryOrderAligned,
    `status=${reorderCategories.status}, aligned=${isCategoryOrderAligned}`,
  );

  const deleteRoadmap = await api(`/conversations/${conversationId}/channels/${roadmapChannelId}`, {
    method: "DELETE",
    token: owner.token,
  });

  record(
    "FLOW-CHANNEL-DELETE",
    "Delete non-default channel",
    deleteRoadmap.status === 200,
    `status=${deleteRoadmap.status}`,
  );

  const deleteReleases = await api(
    `/conversations/${conversationId}/channel-categories/${releasesId}`,
    {
      method: "DELETE",
      token: owner.token,
    },
  );

  const channelsAfterDeleteCategory = Array.isArray(
    deleteReleases.data?.conversation?.group?.channels,
  )
    ? deleteReleases.data.conversation.group.channels
    : [];

  const orphanedChannelAfterCategoryDelete = channelsAfterDeleteCategory.find(
    (channel) => String(channel.channelId) === String(hotfixChannelId),
  );

  const categoryCleared =
    String(orphanedChannelAfterCategoryDelete?.categoryId || "") === "";

  record(
    "FLOW-CATEGORY-DELETE",
    "Delete category and uncategorize linked channels",
    deleteReleases.status === 200 && categoryCleared,
    `status=${deleteReleases.status}, cleared=${categoryCleared}`,
  );
};

const runUnreadAndAnalyticsConcurrency = async ({ owner, admin, member }) => {
  const created = await createGroupConversation({
    ownerToken: owner.token,
    memberIds: [admin.userId, member.userId],
    name: `QA Concurrency ${runTag}`,
  });

  record(
    "CONC-GROUP-CREATE",
    "Create dedicated group for unread/analytics",
    created.response.status === 201 && Boolean(created.conversationId),
    `status=${created.response.status}, conversationId=${created.conversationId || "-"}`,
  );

  if (!created.conversationId) {
    throw new Error("Cannot continue concurrency section without group conversation");
  }

  const conversationId = created.conversationId;

  const promoteAdmin = await api(`/conversations/${conversationId}/admin-role`, {
    method: "PATCH",
    token: owner.token,
    body: {
      memberId: admin.userId,
      makeAdmin: true,
    },
  });

  record(
    "CONC-ADMIN-PROMOTE",
    "Promote admin user in concurrency group",
    promoteAdmin.status === 200,
    `status=${promoteAdmin.status}`,
  );

  const createMainChannel = await api(`/conversations/${conversationId}/channels`, {
    method: "POST",
    token: owner.token,
    body: {
      name: `qa-main-${runTag}`,
      sendRoles: ["owner", "admin", "member"],
    },
  });

  const mainChannelId = String(createMainChannel.data?.channel?.channelId || "");
  record(
    "CONC-CHANNEL-CREATE-MAIN",
    "Create qa-main channel",
    createMainChannel.status === 201 && Boolean(mainChannelId),
    `status=${createMainChannel.status}, channelId=${mainChannelId || "-"}`,
  );

  const createSideChannel = await api(`/conversations/${conversationId}/channels`, {
    method: "POST",
    token: owner.token,
    body: {
      name: `qa-side-${runTag}`,
      sendRoles: ["owner", "admin", "member"],
    },
  });

  const sideChannelId = String(createSideChannel.data?.channel?.channelId || "");
  record(
    "CONC-CHANNEL-CREATE-SIDE",
    "Create qa-side channel",
    createSideChannel.status === 201 && Boolean(sideChannelId),
    `status=${createSideChannel.status}, channelId=${sideChannelId || "-"}`,
  );

  const analyticsBefore = await api(
    `/conversations/${conversationId}/channel-analytics?days=7`,
    {
      method: "GET",
      token: owner.token,
    },
  );

  record(
    "CONC-ANALYTICS-BEFORE",
    "Fetch analytics baseline",
    analyticsBefore.status === 200,
    `status=${analyticsBefore.status}`,
  );

  const beforeMain = getChannelAnalyticsById(analyticsBefore.data?.analytics, mainChannelId);
  const beforeSide = getChannelAnalyticsById(analyticsBefore.data?.analytics, sideChannelId);

  const adminMainCount = 4;
  const memberMainCount = 5;
  const adminSideCount = 3;
  const memberSideCount = 2;

  const sendOps = [];

  for (let i = 0; i < adminMainCount; i += 1) {
    sendOps.push(
      sendGroupMessage({
        token: admin.token,
        conversationId,
        channelId: mainChannelId,
        content: `admin-main-${i + 1}-${runTag}`,
      }),
    );
  }

  for (let i = 0; i < memberMainCount; i += 1) {
    sendOps.push(
      sendGroupMessage({
        token: member.token,
        conversationId,
        channelId: mainChannelId,
        content: `member-main-${i + 1}-${runTag}`,
      }),
    );
  }

  for (let i = 0; i < adminSideCount; i += 1) {
    sendOps.push(
      sendGroupMessage({
        token: admin.token,
        conversationId,
        channelId: sideChannelId,
        content: `admin-side-${i + 1}-${runTag}`,
      }),
    );
  }

  for (let i = 0; i < memberSideCount; i += 1) {
    sendOps.push(
      sendGroupMessage({
        token: member.token,
        conversationId,
        channelId: sideChannelId,
        content: `member-side-${i + 1}-${runTag}`,
      }),
    );
  }

  const sendResults = await Promise.all(sendOps);
  const successfulSendCount = sendResults.filter((result) => result.status === 201).length;
  const failedSendStatuses = sendResults
    .filter((result) => result.status !== 201)
    .map((result) => result.status)
    .join(",");

  record(
    "CONC-SEND-MULTI-USER",
    "Concurrent send from admin/member across channels",
    successfulSendCount === sendOps.length,
    `success=${successfulSendCount}/${sendOps.length}, failedStatuses=${failedSendStatuses || "-"}`,
  );

  const analyticsAfter = await api(
    `/conversations/${conversationId}/channel-analytics?days=7`,
    {
      method: "GET",
      token: owner.token,
    },
  );

  record(
    "CONC-ANALYTICS-AFTER",
    "Fetch analytics after concurrent sends",
    analyticsAfter.status === 200,
    `status=${analyticsAfter.status}`,
  );

  const afterMain = getChannelAnalyticsById(analyticsAfter.data?.analytics, mainChannelId);
  const afterSide = getChannelAnalyticsById(analyticsAfter.data?.analytics, sideChannelId);

  const mainDelta = Number(afterMain?.currentMessages || 0) - Number(beforeMain?.currentMessages || 0);
  const sideDelta = Number(afterSide?.currentMessages || 0) - Number(beforeSide?.currentMessages || 0);

  const expectedMainDelta = adminMainCount + memberMainCount;
  const expectedSideDelta = adminSideCount + memberSideCount;

  record(
    "CONC-ANALYTICS-DELTA-MAIN",
    "Analytics delta matches concurrent main-channel volume",
    mainDelta === expectedMainDelta,
    `delta=${mainDelta}, expected=${expectedMainDelta}`,
  );

  record(
    "CONC-ANALYTICS-DELTA-SIDE",
    "Analytics delta matches concurrent side-channel volume",
    sideDelta === expectedSideDelta,
    `delta=${sideDelta}, expected=${expectedSideDelta}`,
  );

  record(
    "CONC-ANALYTICS-ACTIVE-SENDERS",
    "Analytics shows active senders on both channels",
    Number(afterMain?.currentActiveSenders || 0) >= 2 && Number(afterSide?.currentActiveSenders || 0) >= 2,
    `mainSenders=${afterMain?.currentActiveSenders || 0}, sideSenders=${afterSide?.currentActiveSenders || 0}`,
  );

  const ownerConversationState = await getConversationById({
    token: owner.token,
    conversationId,
  });

  const ownerMainUnread = getChannelUnreadCount({
    conversation: ownerConversationState.conversation,
    userId: owner.userId,
    channelId: mainChannelId,
  });
  const ownerSideUnread = getChannelUnreadCount({
    conversation: ownerConversationState.conversation,
    userId: owner.userId,
    channelId: sideChannelId,
  });

  record(
    "CONC-UNREAD-OWNER-PER-CHANNEL",
    "Owner unread map tracks each channel independently",
    ownerMainUnread === expectedMainDelta && ownerSideUnread === expectedSideDelta,
    `main=${ownerMainUnread}, side=${ownerSideUnread}, expectedMain=${expectedMainDelta}, expectedSide=${expectedSideDelta}`,
  );

  const markMainSeen = await api(`/conversations/${conversationId}/seen?channelId=${mainChannelId}`, {
    method: "PATCH",
    token: owner.token,
    body: {},
  });

  record(
    "CONC-SEEN-MAIN",
    "Mark as seen clears only main channel unread",
    markMainSeen.status === 200,
    `status=${markMainSeen.status}`,
  );

  const afterMainSeenState = await getConversationById({
    token: owner.token,
    conversationId,
  });

  const ownerMainAfterSeen = getChannelUnreadCount({
    conversation: afterMainSeenState.conversation,
    userId: owner.userId,
    channelId: mainChannelId,
  });
  const ownerSideAfterSeen = getChannelUnreadCount({
    conversation: afterMainSeenState.conversation,
    userId: owner.userId,
    channelId: sideChannelId,
  });

  record(
    "CONC-SEEN-MAIN-SCOPE",
    "Main-channel seen does not wipe side-channel unread",
    ownerMainAfterSeen === 0 && ownerSideAfterSeen === expectedSideDelta,
    `main=${ownerMainAfterSeen}, side=${ownerSideAfterSeen}`,
  );

  const markSideSeen = await api(`/conversations/${conversationId}/seen?channelId=${sideChannelId}`, {
    method: "PATCH",
    token: owner.token,
    body: {},
  });

  record(
    "CONC-SEEN-SIDE",
    "Mark as seen clears side channel unread",
    markSideSeen.status === 200,
    `status=${markSideSeen.status}`,
  );

  const afterAllSeenState = await getConversationById({
    token: owner.token,
    conversationId,
  });

  const ownerUnreadMapAfterAllSeen =
    afterAllSeenState.conversation?.group?.channelUnreadCounts?.[owner.userId] || {};
  const ownerTotalUnreadAfterAllSeen = Number(
    afterAllSeenState.conversation?.unreadCounts?.[owner.userId] || 0,
  );

  record(
    "CONC-SEEN-ALL-CLEARED",
    "Owner unread totals are fully cleared after seen on all active channels",
    sumUnreadMap(ownerUnreadMapAfterAllSeen) === 0 && ownerTotalUnreadAfterAllSeen === 0,
    `channelUnreadSum=${sumUnreadMap(ownerUnreadMapAfterAllSeen)}, totalUnread=${ownerTotalUnreadAfterAllSeen}`,
  );
};

const run = async () => {
  try {
    const owner = await signupAndSignin("OWNER", users.owner);
    const admin = await signupAndSignin("ADMIN", users.admin);
    const member = await signupAndSignin("MEMBER", users.member);

    await befriend({
      fromToken: owner.token,
      fromUserId: owner.userId,
      toToken: admin.token,
      toUserId: admin.userId,
      label: "ADMIN",
    });

    await befriend({
      fromToken: owner.token,
      fromUserId: owner.userId,
      toToken: member.token,
      toUserId: member.userId,
      label: "MEMBER",
    });

    const matrixGroup = await createGroupConversation({
      ownerToken: owner.token,
      memberIds: [admin.userId, member.userId],
      name: `QA Matrix ${runTag}`,
    });

    record(
      "MATRIX-GROUP-CREATE",
      "Create group for role-matrix and CRUD flow",
      matrixGroup.response.status === 201 && Boolean(matrixGroup.conversationId),
      `status=${matrixGroup.response.status}, conversationId=${matrixGroup.conversationId || "-"}`,
    );

    if (!matrixGroup.conversationId) {
      throw new Error("Cannot continue without matrix group");
    }

    await runPermissionMatrix({
      owner,
      admin,
      member,
      conversationId: matrixGroup.conversationId,
    });

    await runCategoryChannelCrudFlow({
      owner,
      conversationId: matrixGroup.conversationId,
    });

    await runUnreadAndAnalyticsConcurrency({
      owner,
      admin,
      member,
    });

    const passCount = results.filter((item) => item.pass).length;
    const failCount = results.length - passCount;

    console.log("\n=== RUNTIME QA SUMMARY ===");
    console.log(JSON.stringify({ total: results.length, pass: passCount, fail: failCount }, null, 2));

    if (failCount > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("RUNTIME QA ABORTED:", error?.message || error);
    process.exitCode = 1;
  }
};

await run();
