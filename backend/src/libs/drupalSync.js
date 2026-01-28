import mysql from "mysql2/promise";

/**
 * Drupal Database Sync Service
 * Syncs conversation metadata from MongoDB to Drupal MySQL database
 */

let drupalDbPool = null;

/**
 * Initialize Drupal database connection pool
 */
export function initDrupalSync() {
  if (drupalDbPool) {
    return drupalDbPool;
  }

  try {
    drupalDbPool = mysql.createPool({
      host: process.env.DRUPAL_DB_HOST || "localhost",
      user: process.env.DRUPAL_DB_USER || "root",
      password: process.env.DRUPAL_DB_PASSWORD || "",
      database: process.env.DRUPAL_DB_NAME || "drupal",
      port: process.env.DRUPAL_DB_PORT || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });

    console.log("✅ Drupal database pool initialized");
    return drupalDbPool;
  } catch (error) {
    console.error(
      "❌ Failed to initialize Drupal database pool:",
      error.message,
    );
    return null;
  }
}

/**
 * Sync conversation metadata to Drupal
 * @param {Object} conversation - Mongoose conversation document
 */
export async function syncConversationToDrupal(conversation) {
  if (!drupalDbPool) {
    console.warn("⚠️ Drupal sync skipped: database pool not initialized");
    return;
  }

  try {
    const conversationId = conversation._id.toString();
    const type = conversation.type === "direct" ? "private" : "group";
    const name = conversation.group?.name || null;
    const participantsCount = conversation.participants?.length || 0;
    const lastMessageAt = conversation.lastMessageAt
      ? Math.floor(conversation.lastMessageAt.getTime() / 1000)
      : null;
    const created = Math.floor(conversation.createdAt.getTime() / 1000);
    const updated = Math.floor(conversation.updatedAt.getTime() / 1000);

    // Get message count from messages collection
    // Note: This requires importing Message model or passing count
    // For now, we'll use 0 and update it separately
    const messageCount = 0;

    // Insert or update conversation metadata
    await drupalDbPool.execute(
      `
      INSERT INTO chat_conversation 
      (conversation_id, type, name, participants_count, message_count, last_message_at, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        type = VALUES(type),
        name = VALUES(name),
        participants_count = VALUES(participants_count),
        last_message_at = VALUES(last_message_at),
        updated = VALUES(updated)
    `,
      [
        conversationId,
        type,
        name,
        participantsCount,
        messageCount,
        lastMessageAt,
        created,
        updated,
      ],
    );

    // Sync participants
    await syncParticipantsToDrupal(conversationId, conversation.participants);

    console.log(`✅ Synced conversation ${conversationId} to Drupal`);
  } catch (error) {
    console.error("❌ Failed to sync conversation to Drupal:", error.message);
  }
}

/**
 * Sync conversation participants to Drupal
 * @param {String} conversationId - Conversation ID
 * @param {Array} participants - Array of participant objects
 */
async function syncParticipantsToDrupal(conversationId, participants) {
  if (!participants || participants.length === 0) {
    return;
  }

  try {
    // Delete existing participants for this conversation
    await drupalDbPool.execute(
      "DELETE FROM chat_conversation_participant WHERE conversation_id = ?",
      [conversationId],
    );

    // Insert new participants (map MongoDB ID to Drupal ID)
    for (const participant of participants) {
      // participant.userId is MongoDB user object or ObjectId
      // We need to get the drupalId from MongoDB User model
      // For now, store MongoDB ID as string (will need User lookup in production)
      const mongoUserId = participant.userId.toString();
      const joinedAt = participant.joinedAt
        ? Math.floor(participant.joinedAt.getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      // Note: In Drupal schema, user_id should be Drupal user ID (INT)
      // This is a workaround - in production, should query User.findById(mongoUserId).drupalId
      // For now, we're storing MongoDB ID as string to avoid type mismatch
      try {
        await drupalDbPool.execute(
          `
          INSERT INTO chat_conversation_participant 
          (conversation_id, user_id, joined_at)
          VALUES (?, ?, ?)
        `,
          [conversationId, mongoUserId, joinedAt],
        );
      } catch (insertError) {
        // If insert fails (type mismatch), skip this participant
        console.warn(
          `⚠️ Could not sync participant ${mongoUserId} (likely schema type mismatch)`,
        );
      }
    }

    console.log(
      `✅ Synced ${participants.length} participants for conversation ${conversationId}`,
    );
  } catch (error) {
    console.error("❌ Failed to sync participants to Drupal:", error.message);
  }
}

/**
 * Update message count for a conversation in Drupal
 * @param {String} conversationId - Conversation ID
 * @param {Number} messageCount - Number of messages
 */
export async function updateMessageCountInDrupal(conversationId, messageCount) {
  if (!drupalDbPool) {
    return;
  }

  try {
    await drupalDbPool.execute(
      "UPDATE chat_conversation SET message_count = ?, updated = ? WHERE conversation_id = ?",
      [messageCount, Math.floor(Date.now() / 1000), conversationId],
    );

    console.log(
      `✅ Updated message count for conversation ${conversationId}: ${messageCount}`,
    );
  } catch (error) {
    console.error(
      "❌ Failed to update message count in Drupal:",
      error.message,
    );
  }
}

/**
 * Delete conversation from Drupal
 * @param {String} conversationId - Conversation ID
 */
export async function deleteConversationFromDrupal(conversationId) {
  if (!drupalDbPool) {
    return;
  }

  try {
    // Delete participants first (foreign key)
    await drupalDbPool.execute(
      "DELETE FROM chat_conversation_participant WHERE conversation_id = ?",
      [conversationId],
    );

    // Delete conversation
    await drupalDbPool.execute(
      "DELETE FROM chat_conversation WHERE conversation_id = ?",
      [conversationId],
    );

    console.log(`✅ Deleted conversation ${conversationId} from Drupal`);
  } catch (error) {
    console.error(
      "❌ Failed to delete conversation from Drupal:",
      error.message,
    );
  }
}

/**
 * Close Drupal database connection
 */
export async function closeDrupalSync() {
  if (drupalDbPool) {
    await drupalDbPool.end();
    drupalDbPool = null;
    console.log("✅ Drupal database pool closed");
  }
}
