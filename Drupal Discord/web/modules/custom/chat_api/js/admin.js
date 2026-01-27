/**
 * @file
 * Admin JavaScript for Chat Administration UI
 */

(function ($, Drupal) {
  "use strict";

  Drupal.behaviors.chatAdmin = {
    attach: function (context, settings) {
      // Ban user button handler
      $("#banUserBtn, .action-ban", context)
        .once("chat-admin-ban")
        .on("click", function (e) {
          e.preventDefault();
          const userId = $(this).data("user-id");

          if (confirm(Drupal.t("Are you sure you want to ban this user?"))) {
            // TODO: Use AJAX instead of direct redirect
            window.location.href = `/admin/chat/users/${userId}/ban`;
          }
        });

      // Unban user button handler
      $("#unbanUserBtn, .action-unban", context)
        .once("chat-admin-unban")
        .on("click", function (e) {
          e.preventDefault();
          const userId = $(this).data("user-id");

          if (confirm(Drupal.t("Are you sure you want to unban this user?"))) {
            // TODO: Use AJAX instead of direct redirect
            window.location.href = `/admin/chat/users/${userId}/unban`;
          }
        });

      // Delete conversation button handler
      $("#deleteConversationBtn, .btn-delete", context)
        .once("chat-admin-delete-conv")
        .on("click", function (e) {
          e.preventDefault();
          const conversationId = $(this).data("conversation-id");

          if (
            confirm(
              Drupal.t(
                "Are you sure you want to delete this conversation? This action cannot be undone.",
              ),
            )
          ) {
            // TODO: Implement conversation deletion via AJAX
            console.log("Delete conversation:", conversationId);
            alert("TODO: Implement conversation deletion");
          }
        });

      // User search filter
      $("#userSearch", context)
        .once("chat-admin-search")
        .on("input", function () {
          const searchTerm = $(this).val().toLowerCase();
          $(".users-table tbody tr").each(function () {
            const userName = $(this).find(".user-name").text().toLowerCase();
            const userEmail = $(this)
              .find("td:nth-child(3)")
              .text()
              .toLowerCase();

            if (
              userName.includes(searchTerm) ||
              userEmail.includes(searchTerm)
            ) {
              $(this).show();
            } else {
              $(this).hide();
            }
          });
        });

      // Status filter
      $("#statusFilter", context)
        .once("chat-admin-status-filter")
        .on("change", function () {
          const status = $(this).val();

          if (status === "") {
            $(".users-table tbody tr").show();
          } else if (status === "active") {
            $(".users-table tbody tr.user-active").show();
            $(".users-table tbody tr.user-blocked").hide();
          } else if (status === "blocked") {
            $(".users-table tbody tr.user-blocked").show();
            $(".users-table tbody tr.user-active").hide();
          }
        });

      // TODO: Add real-time statistics updates
      // TODO: Add AJAX handlers for all actions
      // TODO: Add form validation
      // TODO: Add success/error message handling
    },
  };

  /**
   * TODO: Fetch statistics from admin API
   */
  Drupal.chatAdmin = Drupal.chatAdmin || {};

  Drupal.chatAdmin.fetchStats = function () {
    $.ajax({
      url: "/admin/chat/api/stats",
      method: "GET",
      success: function (data) {
        console.log("Statistics:", data);
        // TODO: Update dashboard with real-time data
      },
      error: function (error) {
        console.error("Error fetching stats:", error);
      },
    });
  };

  /**
   * TODO: Fetch conversations from Node.js backend
   */
  Drupal.chatAdmin.fetchConversations = function () {
    // TODO: Implement fetching conversations from Node.js
    console.log("TODO: Fetch conversations from Node.js backend");
  };
})(jQuery, Drupal);
