/**
 * @file
 * Table enhancements for admin interface
 */

(function ($, Drupal) {
  "use strict";

  Drupal.behaviors.chatAdminTables = {
    attach: function (context, settings) {
      // TODO: Add table sorting functionality
      $(".admin-table th", context)
        .once("chat-table-sort")
        .on("click", function () {
          console.log("TODO: Implement table sorting");
        });

      // TODO: Add row selection
      // TODO: Add bulk actions
      // TODO: Add pagination enhancements
    },
  };
})(jQuery, Drupal);
