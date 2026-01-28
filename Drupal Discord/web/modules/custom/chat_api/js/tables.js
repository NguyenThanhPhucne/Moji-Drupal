/**
 * @file
 * Table enhancements for admin interface - Vanilla JS
 */

(function (Drupal) {
  "use strict";

  Drupal.behaviors.chatAdminTables = {
    attach: function (context) {
      // Table sorting functionality
      Array.from(context.querySelectorAll(".admin-table th")).forEach(
        function (header) {
          if (!header.hasAttribute("data-chat-table-sort-processed")) {
            header.setAttribute("data-chat-table-sort-processed", "true");
            header.style.cursor = "pointer";
            header.addEventListener("click", function () {
              console.log("TODO: Implement table sorting");
            });
          }
        },
      );

      // TODO: Add row selection
      // TODO: Add bulk actions
      // TODO: Add pagination enhancements
    },
  };
})(Drupal);
