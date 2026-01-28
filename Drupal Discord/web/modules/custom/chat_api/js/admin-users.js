/**
 * @file
 * Admin JavaScript for User Management with AJAX - Vanilla JS (No jQuery)
 */

(function (Drupal) {
  "use strict";

  Drupal.behaviors.chatAdminUsers = {
    attach: function (context) {
      // Block user button handler with AJAX
      Array.from(context.querySelectorAll(".action-block")).forEach(
        function (btn) {
          if (!btn.hasAttribute("data-chat-block-processed")) {
            btn.setAttribute("data-chat-block-processed", "true");
            btn.addEventListener("click", function (e) {
              e.preventDefault();
              const userId = btn.getAttribute("data-uid");
              const row = btn.closest("tr");

              if (confirm("Are you sure you want to block this user?")) {
                btn.disabled = true;
                btn.classList.add("loading");

                fetch("/admin/chat/api/user/block", {
                  method: "POST",
                  headers: {
                    "X-CSRF-Token":
                      (window.drupalSettings &&
                        window.drupalSettings.csrf_token) ||
                      "",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ uid: userId }),
                })
                  .then(function (response) {
                    return response.json();
                  })
                  .then(function (data) {
                    if (data.success) {
                      Drupal.chatAdmin.showNotification(
                        data.message,
                        "success",
                      );

                      // Update button
                      btn.classList.remove(
                        "action-block",
                        "btn-danger",
                        "loading",
                      );
                      btn.classList.add("action-unblock", "btn-success");
                      btn.innerHTML = '<i class="fas fa-check"></i> Unblock';
                      btn.disabled = false;
                      btn.removeAttribute("data-chat-block-processed");
                      btn.setAttribute("data-chat-unblock-processed", "true");

                      // Update status badge
                      const badge = row.querySelector(".user-status");
                      if (badge) {
                        badge.classList.remove("badge-success");
                        badge.classList.add("badge-danger");
                        badge.textContent = "Blocked";
                      }

                      // Update row class
                      row.classList.remove("user-active");
                      row.classList.add("user-blocked");

                      // Re-attach handler
                      Drupal.chatAdmin.attachUnblockHandler(btn);
                      Drupal.chatAdmin.updateStatsCounter("Blocked", 1);
                      Drupal.chatAdmin.updateStatsCounter("Active", -1);
                    } else {
                      Drupal.chatAdmin.showNotification(
                        data.message || "Failed to block user",
                        "error",
                      );
                      btn.disabled = false;
                      btn.classList.remove("loading");
                    }
                  })
                  .catch(function (error) {
                    Drupal.chatAdmin.showNotification(
                      error.message || "An error occurred",
                      "error",
                    );
                    btn.disabled = false;
                    btn.classList.remove("loading");
                  });
              }
            });
          }
        },
      );

      // Unblock user button handler
      Drupal.chatAdmin.attachUnblockHandler(context);

      // User search filter
      var userSearchInput = context.querySelector("#userSearch");
      if (
        userSearchInput &&
        !userSearchInput.hasAttribute("data-chat-search-processed")
      ) {
        userSearchInput.setAttribute("data-chat-search-processed", "true");
        userSearchInput.addEventListener("input", function () {
          const searchTerm = this.value.toLowerCase();
          Array.from(context.querySelectorAll(".users-table tbody tr")).forEach(
            function (row) {
              const userName = row.querySelector(".user-name")
                ? row.querySelector(".user-name").textContent.toLowerCase()
                : "";
              const userEmail = row.cells[2]
                ? row.cells[2].textContent.toLowerCase()
                : "";

              if (
                userName.includes(searchTerm) ||
                userEmail.includes(searchTerm)
              ) {
                row.style.display = "";
              } else {
                row.style.display = "none";
              }
            },
          );
        });
      }

      // Status filter
      var statusFilter = context.querySelector("#statusFilter");
      if (
        statusFilter &&
        !statusFilter.hasAttribute("data-chat-status-filter-processed")
      ) {
        statusFilter.setAttribute("data-chat-status-filter-processed", "true");
        statusFilter.addEventListener("change", function () {
          const status = this.value;
          const rows = context.querySelectorAll(".users-table tbody tr");

          rows.forEach(function (row) {
            if (status === "") {
              row.style.display = "";
            } else if (
              status === "active" &&
              row.classList.contains("user-active")
            ) {
              row.style.display = "";
            } else if (
              status === "blocked" &&
              row.classList.contains("user-blocked")
            ) {
              row.style.display = "";
            } else if (status !== "") {
              row.style.display = "none";
            }
          });
        });
      }
    },
  };

  /**
   * Helper functions
   */
  Drupal.chatAdmin = Drupal.chatAdmin || {};

  /**
   * Attach unblock handler to button(s)
   */
  Drupal.chatAdmin.attachUnblockHandler = function (context) {
    var buttons = context.querySelectorAll
      ? context.querySelectorAll(".action-unblock")
      : context.classList && context.classList.contains("action-unblock")
        ? [context]
        : [];

    Array.from(buttons).forEach(function (btn) {
      if (!btn.hasAttribute("data-chat-unblock-processed")) {
        btn.setAttribute("data-chat-unblock-processed", "true");
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          const userId = btn.getAttribute("data-uid");
          const row = btn.closest("tr");

          if (confirm("Are you sure you want to unblock this user?")) {
            btn.disabled = true;
            btn.classList.add("loading");

            fetch("/admin/chat/api/user/unblock", {
              method: "POST",
              headers: {
                "X-CSRF-Token":
                  (window.drupalSettings && window.drupalSettings.csrf_token) ||
                  "",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ uid: userId }),
            })
              .then(function (response) {
                return response.json();
              })
              .then(function (data) {
                if (data.success) {
                  Drupal.chatAdmin.showNotification(data.message, "success");

                  // Update button
                  btn.classList.remove(
                    "action-unblock",
                    "btn-success",
                    "loading",
                  );
                  btn.classList.add("action-block", "btn-danger");
                  btn.innerHTML = '<i class="fas fa-ban"></i> Block';
                  btn.disabled = false;
                  btn.removeAttribute("data-chat-unblock-processed");
                  btn.setAttribute("data-chat-block-processed", "true");

                  // Update status badge
                  const badge = row.querySelector(".user-status");
                  if (badge) {
                    badge.classList.remove("badge-danger");
                    badge.classList.add("badge-success");
                    badge.textContent = "Active";
                  }

                  // Update row class
                  row.classList.remove("user-blocked");
                  row.classList.add("user-active");

                  // Re-attach block handler
                  Drupal.chatAdmin.attachBlockHandler(btn);
                  Drupal.chatAdmin.updateStatsCounter("Blocked", -1);
                  Drupal.chatAdmin.updateStatsCounter("Active", 1);
                } else {
                  Drupal.chatAdmin.showNotification(
                    data.message || "Failed to unblock user",
                    "error",
                  );
                  btn.disabled = false;
                  btn.classList.remove("loading");
                }
              })
              .catch(function (error) {
                Drupal.chatAdmin.showNotification(
                  error.message || "An error occurred",
                  "error",
                );
                btn.disabled = false;
                btn.classList.remove("loading");
              });
          }
        });
      }
    });
  };

  /**
   * Update stats counter on page
   */
  Drupal.chatAdmin.updateStatsCounter = function (type, delta) {
    var statBoxes = document.querySelectorAll(".stat-box");
    statBoxes.forEach(function (box) {
      if (box.textContent.includes(type)) {
        var numberEl = box.querySelector(".stat-number");
        if (numberEl) {
          var currentValue = parseInt(numberEl.textContent) || 0;
          var newValue = Math.max(0, currentValue + delta);
          numberEl.textContent = newValue;
        }
      }
    });
  };

  /**
   * Show notification toast
   */
  Drupal.chatAdmin.showNotification = function (message, type) {
    type = type || "info";

    // Remove existing notifications
    var existing = document.querySelectorAll(".chat-notification");
    existing.forEach(function (el) {
      el.remove();
    });

    // Create notification
    var notification = document.createElement("div");
    notification.className = "chat-notification notification-" + type;
    notification.innerHTML =
      '<div class="notification-content"><i class="fas ' +
      (type === "success" ? "fa-check-circle" : "fa-exclamation-circle") +
      '"></i><span>' +
      message +
      "</span></div>";
    document.body.appendChild(notification);

    // Animate in
    setTimeout(function () {
      notification.classList.add("show");
    }, 10);

    // Auto-hide
    setTimeout(function () {
      notification.remove();
    }, 3000);
  };

  /**
   * Attach block handler (helper for re-attaching after unblock)
   */
  Drupal.chatAdmin.attachBlockHandler = function (btn) {
    if (!btn.hasAttribute("data-chat-block-processed")) {
      btn.setAttribute("data-chat-block-processed", "true");
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        const userId = btn.getAttribute("data-uid");
        if (confirm("Are you sure you want to block this user?")) {
          Drupal.chatAdmin.blockUser(userId, btn);
        }
      });
    }
  };

  /**
   * Block user helper
   */
  Drupal.chatAdmin.blockUser = function (userId, btn) {
    btn.disabled = true;
    btn.classList.add("loading");
    const row = btn.closest("tr");

    fetch("/admin/chat/api/user/block", {
      method: "POST",
      headers: {
        "X-CSRF-Token":
          (window.drupalSettings && window.drupalSettings.csrf_token) || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uid: userId }),
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        if (data.success) {
          Drupal.chatAdmin.showNotification(data.message, "success");
          btn.classList.remove("action-block", "btn-danger", "loading");
          btn.classList.add("action-unblock", "btn-success");
          btn.innerHTML = '<i class="fas fa-check"></i> Unblock';
          btn.disabled = false;
          btn.removeAttribute("data-chat-block-processed");
          btn.setAttribute("data-chat-unblock-processed", "true");

          const badge = row.querySelector(".user-status");
          if (badge) {
            badge.classList.remove("badge-success");
            badge.classList.add("badge-danger");
            badge.textContent = "Blocked";
          }
          row.classList.remove("user-active");
          row.classList.add("user-blocked");

          Drupal.chatAdmin.attachUnblockHandler(btn);
          Drupal.chatAdmin.updateStatsCounter("Blocked", 1);
          Drupal.chatAdmin.updateStatsCounter("Active", -1);
        } else {
          Drupal.chatAdmin.showNotification(
            data.message || "Failed to block user",
            "error",
          );
          btn.disabled = false;
          btn.classList.remove("loading");
        }
      })
      .catch(function (error) {
        Drupal.chatAdmin.showNotification(
          error.message || "An error occurred",
          "error",
        );
        btn.disabled = false;
        btn.classList.remove("loading");
      });
  };
})(Drupal);
