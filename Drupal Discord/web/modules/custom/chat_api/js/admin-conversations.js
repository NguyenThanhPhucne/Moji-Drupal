/**
 * @file
 * Admin Conversations Management JavaScript
 * Handles search, filter, and delete functionality
 */

(function () {
  const DEBUG_MODE = false;

  function log(msg, data = null) {
    if (DEBUG_MODE) {
      console.log(`[AdminConversations] ${msg}`, data || "");
    }
  }

  // Initialize on document ready
  document.addEventListener("DOMContentLoaded", function () {
    log("✅ Admin Conversations initialized");

    // Get all DOM elements
    const searchInput = document.getElementById("conversationSearch");
    const typeFilter = document.getElementById("typeFilter");
    const conversationRows = document.querySelectorAll(
      "tbody tr.conversation-row",
    );

    log(`Found ${conversationRows.length} conversation rows`);

    // Search functionality
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        const searchTerm = this.value.toLowerCase();
        log(`🔍 Search term: ${searchTerm}`);

        conversationRows.forEach((row) => {
          const conversationName = row.querySelector(".conversation-name");
          const conversationId = row.querySelector(".conversation-id");

          const nameText = conversationName
            ? conversationName.textContent.toLowerCase()
            : "";
          const idText = conversationId
            ? conversationId.textContent.toLowerCase()
            : "";

          const matches =
            nameText.includes(searchTerm) || idText.includes(searchTerm);
          row.style.display = matches ? "" : "none";
        });
      });
    }

    // Type filter functionality
    if (typeFilter) {
      typeFilter.addEventListener("change", function () {
        const filterValue = this.value;
        log(`📋 Filter by type: ${filterValue}`);

        conversationRows.forEach((row) => {
          const type = row.getAttribute("data-type");
          const matches = filterValue === "all" || type === filterValue;
          row.style.display = matches ? "" : "none";
        });
      });
    }

    // Delete button handlers
    const deleteButtons = document.querySelectorAll(".action-delete");
    log(`Found ${deleteButtons.length} delete buttons`);

    deleteButtons.forEach((button) => {
      button.addEventListener("click", function (e) {
        e.preventDefault();

        const conversationId = this.getAttribute("data-conversation-id");
        const row = this.closest("tr");
        const conversationName =
          row.querySelector(".conversation-name")?.textContent ||
          "this conversation";

        log(`🗑️ Delete conversation: ${conversationId}`);

        if (
          confirm(
            `{{ 'Are you sure you want to delete'|t }} "${conversationName}"? {{ 'This action cannot be undone.'|t }}`,
          )
        ) {
          deleteConversation(conversationId, row);
        }
      });
    });

    // View link handlers - just for logging
    const viewLinks = document.querySelectorAll(".btn-view");
    log(`Found ${viewLinks.length} view links`);

    viewLinks.forEach((link) => {
      link.addEventListener("click", function () {
        const conversationId = this.href.split("/").pop();
        log(`👁️ View conversation: ${conversationId}`);
      });
    });
  });

  /**
   * Delete conversation via Drupal route and remove from table
   */
  function deleteConversation(conversationId, rowElement) {
    // Use Drupal proxy endpoint
    const drupalDeleteUrl = `/admin/chat/api/conversations/${conversationId}/delete`;

    log(`🔄 Deleting conversation via proxy: ${drupalDeleteUrl}`);

    // Show loading state
    const button = rowElement.querySelector(".action-delete");
    const originalHTML = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    button.disabled = true;

    fetch(drupalDeleteUrl, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          log(`✅ Conversation deleted successfully`);

          // Show success message
          showNotification(
            `{{ 'Conversation deleted successfully'|t }}`,
            "success",
          );

          // Fade out and remove row
          rowElement.style.transition = "opacity 0.3s ease";
          rowElement.style.opacity = "0";

          setTimeout(() => {
            rowElement.remove();
            log("Row removed from table");

            // Update row count in table header if needed
            const tableBody = rowElement.parentElement;
            const remainingRows = tableBody.querySelectorAll(
              "tr.conversation-row",
            ).length;
            log(`Remaining conversations: ${remainingRows}`);

            if (remainingRows === 0) {
              // Show empty state message
              const table = tableBody.closest("table");
              const container = table.closest(".table-responsive");
              if (container) {
                container.innerHTML =
                  '<div class="empty-state"><i class="fas fa-inbox"></i><p>{{ "No conversations found"|t }}</p></div>';
              }
            }
          }, 300);
        } else {
          log(`❌ Failed to delete: ${data.message}`);
          showNotification(
            `{{ 'Failed to delete: '|t }}${data.message || '{{ "Unknown error"|t }}'}`,
            "error",
          );

          // Restore button
          button.innerHTML = originalHTML;
          button.disabled = false;
        }
      })
      .catch((error) => {
        log(`❌ Error: ${error.message}`);
        showNotification(
          `{{ 'Error deleting conversation: '|t }}${error.message}`,
          "error",
        );

        // Restore button
        button.innerHTML = originalHTML;
        button.disabled = false;
      });
  }

  /**
   * Show notification message
   */
  function showNotification(message, type = "info") {
    // Use Drupal message system if available
    if (window.drupalCreateNotification) {
      window.drupalCreateNotification(message, type);
    } else {
      // Fallback to simple alert
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }
})();
