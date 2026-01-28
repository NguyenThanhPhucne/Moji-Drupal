/**
 * @file
 * Admin JavaScript for Chat Administration UI - Vanilla JS (No jQuery .once())
 */

(function (Drupal) {
  "use strict";

  Drupal.behaviors.chatAdmin = {
    attach: function (context) {
      // Ban user button handler
      Array.from(context.querySelectorAll("#banUserBtn, .action-ban")).forEach(
        function (btn) {
          if (!btn.hasAttribute("data-chat-ban-processed")) {
            btn.setAttribute("data-chat-ban-processed", "true");
            btn.addEventListener("click", function (e) {
              e.preventDefault();
              const userId = btn.getAttribute("data-user-id");
              if (confirm("Are you sure you want to ban this user?")) {
                window.location.href = "/admin/chat/users/" + userId + "/ban";
              }
            });
          }
        },
      );

      // Unban user button handler
      Array.from(
        context.querySelectorAll("#unbanUserBtn, .action-unban"),
      ).forEach(function (btn) {
        if (!btn.hasAttribute("data-chat-unban-processed")) {
          btn.setAttribute("data-chat-unban-processed", "true");
          btn.addEventListener("click", function (e) {
            e.preventDefault();
            const userId = btn.getAttribute("data-user-id");
            if (confirm("Are you sure you want to unban this user?")) {
              window.location.href = "/admin/chat/users/" + userId + "/unban";
            }
          });
        }
      });

      // Delete conversation button handler
      Array.from(
        context.querySelectorAll("#deleteConversationBtn, .btn-delete"),
      ).forEach(function (btn) {
        if (!btn.hasAttribute("data-chat-delete-processed")) {
          btn.setAttribute("data-chat-delete-processed", "true");
          btn.addEventListener("click", function (e) {
            e.preventDefault();
            const conversationId = btn.getAttribute("data-conversation-id");
            if (
              confirm(
                "Are you sure you want to delete this conversation? This action cannot be undone.",
              )
            ) {
              console.log("Delete conversation:", conversationId);
              alert("TODO: Implement conversation deletion");
            }
          });
        }
      });

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

  // Helper namespace
  Drupal.chatAdmin = Drupal.chatAdmin || {};
})(Drupal);
