/**
 * File: user-detail-refresh.js
 * Purpose: Auto-refresh user detail data theo real-time
 * - Kiểm tra xem có dữ liệu mới từ backend không
 * - Nếu có, reload page hoặc update DOM
 */

(function () {
  "use strict";

  // Lấy UID từ URL path: /admin/chat/users/{uid}
  const pathParts = window.location.pathname.split("/");
  const uid = pathParts[4];

  if (!uid || isNaN(uid)) {
    console.warn("Could not determine UID from URL");
    return;
  }

  /**
   * Gọi API để lấy thông tin user chi tiết mới nhất
   */
  async function fetchUserDetailData() {
    try {
      // Gọi endpoint admin API để lấy JSON dữ liệu
      const response = await fetch(`/admin/api/user/${uid}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      if (!response.ok) {
        console.warn("API response not OK:", response.status);
        return null;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.warn("Error fetching user detail:", error);
      return null;
    }
  }

  /**
   * So sánh dữ liệu cũ và mới, nếu khác nhau thì reload page
   */
  async function checkForUpdates() {
    const newData = await fetchUserDetailData();

    if (!newData) {
      return; // API call failed
    }

    // Kiểm tra stats - nếu có pending_received khác, reload
    const oldStats = document.querySelector("[data-user-stats]");
    if (oldStats) {
      const oldPendingReceived = parseInt(
        oldStats.getAttribute("data-pending-received") || "0",
      );

      if (
        newData.stats &&
        newData.stats.pending_received !== oldPendingReceived
      ) {
        console.log("Detected change in pending_received, reloading page...");
        window.location.reload();
        return;
      }
    }

    // Kiểm tra friends count
    const oldFriendsCount = document.querySelector("[data-friends-count]");
    if (oldFriendsCount) {
      const oldCount = parseInt(
        oldFriendsCount.getAttribute("data-friends-count") || "0",
      );

      if (newData.stats && newData.stats.friends_count !== oldCount) {
        console.log("Detected change in friends_count, reloading page...");
        window.location.reload();
        return;
      }
    }
  }

  // Start auto-refresh: kiểm tra mỗi 5 giây
  setInterval(checkForUpdates, 5000);

  // Cũng kiểm tra khi page có focus trở lại
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      console.log("Page regained focus, checking for updates...");
      checkForUpdates();
    }
  });

  console.log("User detail auto-refresh initialized");
})();
