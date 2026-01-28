/**
 * @file
 * Admin JavaScript for User Management with AJAX
 */

(function ($, Drupal) {
  "use strict";

  Drupal.behaviors.chatAdminUsers = {
    attach: function (context, settings) {
      // Block user button handler with AJAX
      $(".action-block", context)
        .once("chat-admin-block")
        .on("click", function (e) {
          e.preventDefault();
          const $button = $(this);
          const userId = $button.data("uid");
          const $row = $button.closest("tr");

          if (confirm(Drupal.t("Are you sure you want to block this user?"))) {
            // Disable button during request
            $button.prop("disabled", true).addClass("loading");

            $.ajax({
              url: "/admin/chat/api/user/block",
              method: "POST",
              headers: {
                "X-CSRF-Token": drupalSettings.csrf_token || "",
              },
              contentType: "application/json",
              data: JSON.stringify({ uid: userId }),
              success: function (response) {
                if (response.success) {
                  // Show success message
                  Drupal.chatAdmin.showNotification(
                    response.message,
                    "success",
                  );

                  // Update UI: Change button to unblock
                  $button
                    .removeClass("action-block btn-danger loading")
                    .addClass("action-unblock btn-success")
                    .html('<i class="fas fa-check"></i> Unblock')
                    .data("uid", userId)
                    .off("click") // Remove old handler
                    .prop("disabled", false);

                  // Re-attach unblock handler to this specific button
                  Drupal.chatAdmin.attachUnblockHandler($button);

                  // Update status badge
                  const $statusBadge = $row.find(".user-status");
                  $statusBadge
                    .removeClass("badge-success")
                    .addClass("badge-danger")
                    .text("Blocked");

                  // Update row class
                  $row.removeClass("user-active").addClass("user-blocked");

                  // Update stats counter
                  Drupal.chatAdmin.updateStatsCounter("Blocked", 1);
                  Drupal.chatAdmin.updateStatsCounter("Active", -1);
                } else {
                  Drupal.chatAdmin.showNotification(
                    response.message || "Failed to block user",
                    "error",
                  );
                  $button.prop("disabled", false).removeClass("loading");
                }
              },
              error: function (xhr) {
                const errorMsg =
                  xhr.responseJSON?.message || "An error occurred";
                Drupal.chatAdmin.showNotification(errorMsg, "error");
                $button.prop("disabled", false).removeClass("loading");
              },
            });
          }
        });

      // Unblock user button handler with AJAX
      Drupal.chatAdmin.attachUnblockHandler($(".action-unblock", context));

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
    },
  };

  /**
   * Helper functions
   */
  Drupal.chatAdmin = Drupal.chatAdmin || {};

  /**
   * Attach unblock handler to button(s)
   */
  Drupal.chatAdmin.attachUnblockHandler = function ($buttons) {
    $buttons.once("chat-admin-unblock").on("click", function (e) {
      e.preventDefault();
      const $button = $(this);
      const userId = $button.data("uid");
      const $row = $button.closest("tr");

      if (confirm(Drupal.t("Are you sure you want to unblock this user?"))) {
        // Disable button during request
        $button.prop("disabled", true).addClass("loading");

        $.ajax({
          url: "/admin/chat/api/user/unblock",
          method: "POST",
          headers: {
            "X-CSRF-Token": drupalSettings.csrf_token || "",
          },
          contentType: "application/json",
          data: JSON.stringify({ uid: userId }),
          success: function (response) {
            if (response.success) {
              // Show success message
              Drupal.chatAdmin.showNotification(response.message, "success");

              // Update UI: Change button to block
              $button
                .removeClass("action-unblock btn-success loading")
                .addClass("action-block btn-danger")
                .html('<i class="fas fa-ban"></i> Block')
                .data("uid", userId)
                .off("click") // Remove old handler
                .prop("disabled", false);

              // Re-attach block handler - need to re-run behavior
              $button
                .removeClass("chat-admin-block-processed")
                .removeOnce("chat-admin-block");
              Drupal.behaviors.chatAdminUsers.attach($button.parent());

              // Update status badge
              const $statusBadge = $row.find(".user-status");
              $statusBadge
                .removeClass("badge-danger")
                .addClass("badge-success")
                .text("Active");

              // Update row class
              $row.removeClass("user-blocked").addClass("user-active");

              // Update stats counter
              Drupal.chatAdmin.updateStatsCounter("Blocked", -1);
              Drupal.chatAdmin.updateStatsCounter("Active", 1);
            } else {
              Drupal.chatAdmin.showNotification(
                response.message || "Failed to unblock user",
                "error",
              );
              $button.prop("disabled", false).removeClass("loading");
            }
          },
          error: function (xhr) {
            const errorMsg = xhr.responseJSON?.message || "An error occurred";
            Drupal.chatAdmin.showNotification(errorMsg, "error");
            $button.prop("disabled", false).removeClass("loading");
          },
        });
      }
    });
  };

  /**
   * Update stats counter on page
   */
  Drupal.chatAdmin.updateStatsCounter = function (type, delta) {
    // Find stat box that contains the type text
    const $statBoxes = $(".stat-box");
    $statBoxes.each(function () {
      const $box = $(this);
      if ($box.text().includes(type)) {
        const $number = $box.find(".stat-number");
        const currentValue = parseInt($number.text()) || 0;
        const newValue = Math.max(0, currentValue + delta);
        $number.text(newValue);
      }
    });
  };

  /**
   * Show notification toast
   */
  Drupal.chatAdmin.showNotification = function (message, type = "info") {
    // Remove any existing notifications
    $(".chat-notification").remove();

    // Create notification element
    const $notification = $('<div class="chat-notification"></div>')
      .addClass(`notification-${type}`)
      .html(
        `
      <div class="notification-content">
        <i class="fas ${type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}"></i>
        <span>${message}</span>
      </div>
    `,
      )
      .appendTo("body");

    // Animate in
    setTimeout(() => {
      $notification.addClass("show");
    }, 10);

    // Auto-hide after 3 seconds
    setTimeout(() => {
      $notification.removeClass("show");
      setTimeout(() => {
        $notification.remove();
      }, 300);
    }, 3000);
  };
})(jQuery, Drupal);
