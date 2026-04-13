package com.moji.mobile.core.model

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
    val replyTo: MessageReplyPreview? = null,
    val reactions: List<MessageReaction> = emptyList(),
    val readBy: List<String> = emptyList(),
    val createdAt: String,
    val isDeleted: Boolean = false,
    val editedAt: String? = null,
)
