package com.moji.mobile.core.model

data class AudioMeta(
    val durationSeconds: Int? = null,
    val mimeType: String? = null,
    val sizeBytes: Long? = null,
)

data class MessageReplyPreview(
    val id: String,
    val content: String,
    val senderId: String,
    val senderDisplayName: String? = null,
)

data class MessageReaction(
    val userId: String,
    val emoji: String,
)

data class Message(
    val id: String,
    val conversationId: String,
    val senderId: String,
    val senderDisplayName: String,
    val content: String,
    val imageUrl: String? = null,
    val audioUrl: String? = null,  // ✨ For voice memos
    val audioMeta: AudioMeta? = null,  // ✨ Voice memo metadata (duration, mimeType, sizeBytes)
    val replyTo: MessageReplyPreview? = null,
    val reactions: List<MessageReaction> = emptyList(),
    val readBy: List<String> = emptyList(),
    val createdAt: String,
    val isDeleted: Boolean = false,
    val editedAt: String? = null,
    val threadRootId: String? = null,  // ✨ For thread replies
    val replyToId: String? = null,  // ✨ For thread replies (message being replied to)
    val deliveryState: String? = null,  // ✨ uploading|sending|queued|failed
    val deliveryError: String? = null,  // ✨ Error message for failed delivery
    val deliveryAttemptCount: Int = 0,  // ✨ Retry attempt count for offline queue
)
