/**
 * @file
 * Professional listing page interactions
 * AJAX, filtering, sorting, real-time data updates
 */

(function (Drupal, drupalSettings) {
  "use strict";

  Drupal.behaviors.chatListingEnhancements = {
    attach: function (context) {
      // Initialize on page load
      if (context === document) {
        this.initializeSortable();
        this.initializeSearch();
        this.initializeStatusFilter();
      }
    },

    /**
     * Initialize sorting functionality on table headers
     */
    initializeSortable: function () {
      const headers = document.querySelectorAll(".chat-table th");

      headers.forEach((header, index) => {
        if (index === headers.length - 1) return; // Skip action column

        header.style.cursor = "pointer";
        header.addEventListener("click", () => {
          this.sortTable(index);
        });
      });
    },

    /**
     * Sort table by column
     */
    sortTable: function (columnIndex) {
      const table = document.querySelector(".chat-table");
      const rows = Array.from(table.querySelectorAll("tbody tr"));

      rows.sort((a, b) => {
        const aValue = a.cells[columnIndex].textContent.trim();
        const bValue = b.cells[columnIndex].textContent.trim();

        // Try numeric comparison first
        const aNum = parseFloat(aValue);
        const bNum = parseFloat(bValue);

        if (!isNaN(aNum) && !isNaN(bNum)) {
          return aNum - bNum;
        }

        // Fall back to string comparison
        return aValue.localeCompare(bValue);
      });

      const tbody = table.querySelector("tbody");
      rows.forEach((row) => tbody.appendChild(row));
    },

    /**
     * Initialize search functionality
     */
    initializeSearch: function () {
      const searchInputs = document.querySelectorAll("[data-search]");

      searchInputs.forEach((input) => {
        input.addEventListener("input", (e) => {
          const query = e.target.value.toLowerCase();
          this.filterTable(query);
        });
      });
    },

    /**
     * Filter table rows based on search query
     */
    filterTable: function (query) {
      const rows = document.querySelectorAll(".chat-table tbody tr");
      let visibleCount = 0;

      rows.forEach((row) => {
        const text = row.textContent.toLowerCase();
        const isVisible = text.includes(query);

        row.style.display = isVisible ? "" : "none";
        if (isVisible) visibleCount++;
      });

      // Show/hide empty state
      this.updateEmptyState(visibleCount);
    },

    /**
     * Initialize status filter
     */
    initializeStatusFilter: function () {
      const filterButtons = document.querySelectorAll("[data-filter-status]");

      filterButtons.forEach((button) => {
        button.addEventListener("click", (e) => {
          e.preventDefault();
          const status = button.dataset.filterStatus;
          this.filterByStatus(status);
        });
      });
    },

    /**
     * Filter table by status
     */
    filterByStatus: function (status) {
      const rows = document.querySelectorAll(".chat-table tbody tr");
      let visibleCount = 0;

      rows.forEach((row) => {
        const rowStatus = row.dataset.userStatus || "";
        const isVisible = status === "all" || rowStatus === status;

        row.style.display = isVisible ? "" : "none";
        if (isVisible) visibleCount++;
      });

      this.updateEmptyState(visibleCount);
    },

    /**
     * Update empty state visibility
     */
    updateEmptyState: function (visibleCount) {
      const emptyState = document.querySelector(".empty-state");
      if (emptyState) {
        emptyState.style.display = visibleCount === 0 ? "block" : "none";
      }
    },
  };

  /**
   * AJAX: Block/Unblock User
   */
  Drupal.behaviors.blockUnblockUser = {
    attach: function (context) {
      const blockButtons = context.querySelectorAll("[data-block-user]");
      const unblockButtons = context.querySelectorAll("[data-unblock-user]");

      blockButtons.forEach((button) => {
        button.addEventListener("click", (e) => {
          e.preventDefault();
          const uid = button.dataset.blockUser;
          this.blockUser(uid, button);
        });
      });

      unblockButtons.forEach((button) => {
        button.addEventListener("click", (e) => {
          e.preventDefault();
          const uid = button.dataset.unblockUser;
          this.unblockUser(uid, button);
        });
      });
    },

    /**
     * Block user via AJAX
     */
    blockUser: function (uid, button) {
      if (!confirm("Bạn có chắc chắn muốn khóa người dùng này?")) {
        return;
      }

      button.disabled = true;
      button.classList.add("is-loading");

      fetch(`/admin/chat/api/user/block`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token":
            document.querySelector('[name="csrf_token"]')?.value || "",
        },
        body: JSON.stringify({ uid: parseInt(uid) }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            this.updateUserRow(uid, "blocked");
            this.showNotification("Khóa người dùng thành công", "success");
          } else {
            this.showNotification(
              data.message || "Lỗi khi khóa người dùng",
              "error",
            );
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          this.showNotification("Lỗi khi gửi yêu cầu", "error");
        })
        .finally(() => {
          button.disabled = false;
          button.classList.remove("is-loading");
        });
    },

    /**
     * Unblock user via AJAX
     */
    unblockUser: function (uid, button) {
      if (!confirm("Bạn có chắc chắn muốn mở khóa người dùng này?")) {
        return;
      }

      button.disabled = true;
      button.classList.add("is-loading");

      fetch(`/admin/chat/api/user/unblock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token":
            document.querySelector('[name="csrf_token"]')?.value || "",
        },
        body: JSON.stringify({ uid: parseInt(uid) }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            this.updateUserRow(uid, "active");
            this.showNotification("Mở khóa người dùng thành công", "success");
          } else {
            this.showNotification(
              data.message || "Lỗi khi mở khóa người dùng",
              "error",
            );
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          this.showNotification("Lỗi khi gửi yêu cầu", "error");
        })
        .finally(() => {
          button.disabled = false;
          button.classList.remove("is-loading");
        });
    },

    /**
     * Update user row after status change
     */
    updateUserRow: function (uid, newStatus) {
      const row = document.querySelector(`[data-user-uid="${uid}"]`);
      if (!row) return;

      // Update row class
      row.classList.remove("user-active", "user-blocked");
      row.classList.add(`user-${newStatus}`);

      // Update status badge
      const statusCell = row.querySelector("[data-status-badge]");
      if (statusCell) {
        if (newStatus === "active") {
          statusCell.innerHTML =
            '<span class="badge badge-success">Hoạt động</span>';
        } else {
          statusCell.innerHTML =
            '<span class="badge badge-danger">Đã khóa</span>';
        }
      }

      // Update buttons
      const blockButton = row.querySelector("[data-block-user]");
      const unblockButton = row.querySelector("[data-unblock-user]");

      if (newStatus === "active") {
        blockButton?.style.display !== "none" &&
          (blockButton.style.display = "");
        unblockButton && (unblockButton.style.display = "none");
      } else {
        blockButton && (blockButton.style.display = "none");
        unblockButton?.style.display !== "inline-flex" &&
          (unblockButton.style.display = "inline-flex");
      }

      // Update stats if available
      this.updateStatistics(newStatus);
    },

    /**
     * Update statistics counters
     */
    updateStatistics: function (newStatus) {
      const activeBox = document.querySelector("[data-stat-active]");
      const blockedBox = document.querySelector("[data-stat-blocked]");

      if (newStatus === "active" && blockedBox && activeBox) {
        const activeValue = parseInt(activeBox.textContent) || 0;
        const blockedValue = parseInt(blockedBox.textContent) || 0;

        activeBox.textContent = activeValue + 1;
        blockedBox.textContent = Math.max(0, blockedValue - 1);
      } else if (newStatus === "blocked" && activeBox && blockedBox) {
        const activeValue = parseInt(activeBox.textContent) || 0;
        const blockedValue = parseInt(blockedBox.textContent) || 0;

        activeBox.textContent = Math.max(0, activeValue - 1);
        blockedBox.textContent = blockedValue + 1;
      }
    },

    /**
     * Show notification toast
     */
    showNotification: function (message, type) {
      const toast = document.createElement("div");
      toast.className = `notification notification-${type}`;
      toast.innerHTML = `
        <div class="notification-content">
          ${type === "success" ? '<span class="notification-icon">✓</span>' : ""}
          ${type === "error" ? '<span class="notification-icon">!</span>' : ""}
          <span class="notification-text">${message}</span>
        </div>
      `;

      document.body.appendChild(toast);

      // Slide in animation
      setTimeout(() => toast.classList.add("notification-show"), 10);

      // Auto remove after 3 seconds
      setTimeout(() => {
        toast.classList.remove("notification-show");
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    },
  };

  /**
   * Real-time data refresh
   */
  Drupal.behaviors.realtimeDataRefresh = {
    attach: function (context) {
      // Optional: Auto-refresh data every 30 seconds
      if (drupalSettings.chatListing?.autoRefresh) {
        setInterval(() => {
          this.refreshUserData();
        }, 30000);
      }
    },

    /**
     * Refresh user statistics
     */
    refreshUserData: function () {
      // This would call an AJAX endpoint to get updated user stats
      // Example: /admin/chat/api/stats
      console.log("Refreshing user data...");
    },
  };
})(Drupal, drupalSettings);
