/**
 * Auto-refresh for user detail page - Kiểm tra dữ liệu real-time
 * Listens to socket events for friend request updates
 */
(function () {
  const pathParts = window.location.pathname.split("/");
  const uid = pathParts[4];

  if (!uid || isNaN(uid)) return;

  let lastRefresh = Date.now();
  const interval = 5000; // 5 giây

  // Function to refresh page with cache-busting
  function refreshPage(reason = "") {
    console.log("🔄 Refreshing page... (" + reason + ")");
    const url = window.location.href.split("?")[0];
    window.location.href = url + "?_t=" + Date.now();
  }

  // Auto-reload mỗi 5 giây
  setInterval(function () {
    if (Date.now() - lastRefresh >= interval) {
      lastRefresh = Date.now();
      refreshPage("auto-refresh timer");
    }
  }, interval);

  // Reload khi focus lại
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && Date.now() - lastRefresh > interval) {
      console.log("📱 Page focused, reloading...");
      lastRefresh = Date.now();
      setTimeout(() => refreshPage("focus regained"), 1000);
    }
  });

  // Connect to Socket.IO if available
  if (window.io) {
    try {
      const socket = window.io("ws://localhost:5001", {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      // Listen for friend request acceptance events
      socket.on("admin:friend-request-accepted", function (data) {
        console.log(
          "🔔 [Socket] Friend request accepted event received:",
          data,
        );
        console.log("   Current UID: " + uid);
        console.log("   Event toDrupalId: " + data.toDrupalId);

        // If this event affects the current user being viewed, refresh
        if (data.toDrupalId && data.toDrupalId == uid) {
          console.log("📢 [Socket] This affects current user! Refreshing...");
          lastRefresh = Date.now();
          setTimeout(() => refreshPage("socket event"), 500);
        }
      });

      socket.on("connect", function () {
        console.log("✅ [Socket] Connected to backend");
      });

      socket.on("disconnect", function () {
        console.log("❌ [Socket] Disconnected from backend");
      });
    } catch (error) {
      console.warn("⚠️ Socket.IO not available or failed to connect:", error);
    }
  }
})();
