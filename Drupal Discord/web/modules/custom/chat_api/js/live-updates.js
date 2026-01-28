/**
 * @file
 * Live Updates for Admin Conversations
 *
 * Provides real-time updates for the conversations admin page
 * using polling to keep data fresh without page reload
 */

(function (Drupal, drupalSettings) {
  "use strict";

  Drupal.behaviors.chatAdminLiveUpdates = {
    attach: function (context, settings) {
      if (!settings.chatAdminLive) {
        console.warn(
          "[ChatAdminLiveUpdates] ⚠️ chatAdminLive settings not found",
        );
        return;
      }

      const config = settings.chatAdminLive;
      console.log("[ChatAdminLiveUpdates] ✅ Initialized with config:", config);

      // Log debug info from AdminController
      if (config.debug) {
        console.log(
          "[ChatAdminLiveUpdates] 📊 Initial data from AdminController:",
          {
            conversationsCount: config.debug.initialConversationsCount,
            participantsInFirst: config.debug.initialParticipantsInFirstConv,
            sampleParticipants: config.debug.sampleParticipants,
          },
        );
      }

      let updateTimeout;
      let isUpdating = false;

      /**
       * Fetch fresh data from MongoDB API
       */
      function fetchConversations() {
        if (isUpdating) return;
        isUpdating = true;

        console.log("[ChatAdminLiveUpdates] 📡 Fetching from:", config.apiUrl);
        fetch(config.apiUrl)
          .then((response) => {
            console.log(
              "[ChatAdminLiveUpdates] 📡 Response status:",
              response.status,
            );
            if (!response.ok) {
              throw new Error(`API Error: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            console.log("[ChatAdminLiveUpdates] 📊 Data received:", data);
            if (data.success) {
              console.log(
                "[ChatAdminLiveUpdates] ✅ Updating table with",
                data.data.length,
                "conversations",
              );
              updateConversationTable(data.data, data.stats);
              updateStats(data.stats);
              showUpdateNotification("✅ Data updated", "success");
            }
          })
          .catch((error) => {
            console.error(
              "[ChatAdminLiveUpdates] ❌ Error fetching data:",
              error,
            );
            showUpdateNotification("❌ Failed to update data", "error");
          })
          .finally(() => {
            isUpdating = false;
            scheduleNextUpdate();
          });
      }

      /**
       * Schedule next update
       */
      function scheduleNextUpdate() {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(fetchConversations, config.refreshInterval);
      }

      /**
       * Update conversation table rows
       */
      function updateConversationTable(conversations, stats) {
        const table = document.querySelector(".conversations-table tbody");
        if (!table) return;

        // Create a map of existing conversation rows
        const existingRows = {};
        table.querySelectorAll("tr").forEach((row) => {
          const id = row.getAttribute("data-id");
          if (id) {
            existingRows[id] = row;
          }
        });

        // Update or create rows
        conversations.forEach((conversation, index) => {
          const convoId = conversation._id;
          const existingRow = existingRows[convoId];

          const newRow = createConversationRow(conversation);

          if (existingRow) {
            // Check if data changed
            if (
              existingRow.getAttribute("data-count") !==
              conversation.messageCount
            ) {
              // Animate update
              existingRow.classList.add("updating");
              setTimeout(() => {
                existingRow.classList.remove("updating");
              }, 500);
            }
            existingRow.replaceWith(newRow);
          } else {
            // New conversation - add to top
            table.insertBefore(newRow, table.firstChild);
            newRow.classList.add("new-row");
          }

          delete existingRows[convoId];
        });

        // Remove conversations that no longer exist
        Object.values(existingRows).forEach((row) => {
          row.classList.add("removed");
          setTimeout(() => {
            row.remove();
          }, 300);
        });
      }

      /**
       * Create a conversation table row
       */
      function createConversationRow(conversation) {
        const row = document.createElement("tr");
        row.setAttribute("data-type", conversation.type);
        row.setAttribute("data-id", conversation._id);
        row.setAttribute("data-count", conversation.messageCount);
        row.className = "conversation-row";

        const participants = (conversation.participants || [])
          .map((p) => p.displayName)
          .join(", ");

        console.log(
          `[createConversationRow] Conversation ${conversation._id}:`,
          {
            participantCount: conversation.participantCount,
            participantsArray: conversation.participants,
            participantsCount: (conversation.participants || []).length,
          },
        );

        row.innerHTML = `
          <td class="conversation-id"><strong>#${conversation._id.substring(0, 8)}</strong></td>
          <td class="conversation-info">
            <div class="conversation-avatar">
              ${conversation.type === "group" ? '<i class="fas fa-users"></i>' : '<i class="fas fa-user-friends"></i>'}
            </div>
            <div class="conversation-details">
              <div class="conversation-name">
                ${
                  conversation.type === "group"
                    ? escapeHtml(conversation.name)
                    : (conversation.participants || [])
                        .map((p) => escapeHtml(p.displayName))
                        .join(" & ") || "Private Chat"
                }
              </div>
              <div class="conversation-meta" title="${(conversation.participants || []).map((p) => `${p.displayName} (Drupal ID: ${p.drupalId})`).join(", ")}">
                <i class="fas fa-hashtag"></i> ${conversation._id.substring(0, 8)}
                <span class="participants-list">
                  ${(conversation.participants || []).map((p) => `<span class="participant-badge" title="${p.displayName}">${escapeHtml(p.displayName.substring(0, 10))}</span>`).join("")}
                </span>
              </div>
            </div>
          </td>
          <td class="conversation-type">
            <span class="badge badge-${conversation.type}">
              ${conversation.type === "group" ? "Group" : "Direct"}
            </span>
          </td>
          <td class="participants-cell">
            <div class="participants-list">
              ${(conversation.participants || []).map((p) => `<span class="participant-badge" title="Drupal ID: ${p.drupalId}"><i class="fas fa-user-circle"></i> ${escapeHtml(p.displayName)}</span>`).join("")}
            </div>
          </td>
          <td class="last-message-cell">
            <small>
              ${
                conversation.lastMessage
                  ? escapeHtml(conversation.lastMessage.substring(0, 40)) +
                    (conversation.lastMessage.length > 40 ? "..." : "")
                  : '<span class="text-muted">No messages</span>'
              }
            </small>
          </td>
          <td class="message-count">
            <strong>${conversation.messageCount}</strong>
          </td>
          <td class="created-at">${formatDate(conversation.createdAt)}</td>
          <td class="last-activity">
            <span class="time-badge">${conversation.timeAgo}</span>
          </td>
          <td class="actions">
            <a href="/admin/chat/conversation/${conversation._id}" class="btn btn-sm btn-info">
              <i class="fas fa-eye"></i> View
            </a>
            <button class="btn btn-sm btn-danger delete-conversation" data-id="${conversation._id}">
              <i class="fas fa-trash"></i> Delete
            </button>
          </td>
        `;

        return row;
      }

      /**
       * Update statistics boxes
       */
      function updateStats(stats) {
        const statBoxes = document.querySelectorAll(".stat-box");

        statBoxes.forEach((box) => {
          const stat = box.querySelector(".stat-value");
          if (!stat) return;

          const type = stat.parentElement.textContent.toLowerCase();

          let value = "";
          if (type.includes("total") && !type.includes("message"))
            value = stats.totalConversations;
          else if (type.includes("private")) value = stats.privateConversations;
          else if (type.includes("group")) value = stats.groupConversations;
          else if (type.includes("active")) value = stats.activeTodayCount;
          else if (type.includes("message")) value = stats.totalMessages;

          if (value) {
            const oldValue = stat.textContent;
            if (oldValue !== value.toString()) {
              stat.classList.add("updating");
              stat.textContent = value;
              setTimeout(() => {
                stat.classList.remove("updating");
              }, 500);
            }
          }
        });
      }

      /**
       * Show update notification
       */
      function showUpdateNotification(message, type) {
        const notification = document.createElement("div");
        notification.className = `update-notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 12px 20px;
          background: ${type === "success" ? "#4CAF50" : "#f44336"};
          color: white;
          border-radius: 4px;
          z-index: 9999;
          font-size: 14px;
          animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
          notification.style.animation = "slideOut 0.3s ease-out forwards";
          setTimeout(() => {
            notification.remove();
          }, 300);
        }, 3000);
      }

      /**
       * Format date
       */
      function formatDate(dateString) {
        if (!dateString) return "Never";
        const date = new Date(dateString);
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year:
            date.getFullYear() !== new Date().getFullYear()
              ? "numeric"
              : undefined,
        });
      }

      /**
       * Escape HTML
       */
      function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
      }

      // Add CSS animations
      const style = document.createElement("style");
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }

        .conversation-row.updating {
          background-color: #fff3cd;
          transition: background-color 0.3s ease;
        }

        .conversation-row.new-row {
          animation: fadeIn 0.5s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .conversation-row.removed {
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .stat-value.updating {
          animation: pulse 0.5s ease;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
        }

        .badge-direct {
          background-color: #4CAF50;
          color: white;
        }

        .badge-group {
          background-color: #2196F3;
          color: white;
        }

        .time-badge {
          background-color: #f0f0f0;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          color: #666;
        }

        .btn-sm {
          padding: 4px 8px;
          font-size: 12px;
        }

        .conversation-details {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .conversation-name {
          font-weight: 600;
          color: #222;
          word-break: break-word;
        }

        .conversation-meta {
          font-size: 12px;
          color: #666;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .participants-list {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }

        .participant-badge {
          display: inline-block;
          background-color: #e8f5e9;
          color: #2e7d32;
          padding: 2px 6px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
          max-width: 120px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .participant-badge:hover {
          background-color: #c8e6c9;
          cursor: pointer;
        }

        .participants-cell {
          padding: 8px !important;
          min-width: 250px;
        }

        .participants-cell .participants-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .participants-cell .participant-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          max-width: 100%;
        }

        .last-message-cell {
          max-width: 300px;
          padding: 8px !important;
        }

        .last-message-cell small {
          color: #666;
          word-break: break-word;
        }


      `;
      document.head.appendChild(style);

      // Start live updates
      fetchConversations();

      // Cleanup on detach
      return function () {
        clearTimeout(updateTimeout);
      };
    },
  };
})(Drupal, drupalSettings);
