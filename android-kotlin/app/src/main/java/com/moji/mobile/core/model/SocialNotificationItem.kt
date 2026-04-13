package com.moji.mobile.core.model

data class SocialNotificationItem(
    val id: String,
    val type: String,
    val message: String,
    val actorId: String? = null,
    val actorDisplayName: String? = null,
    val actorAvatarUrl: String? = null,
    val postId: String? = null,
    val conversationId: String? = null,
    val commentId: String? = null,
    val isRead: Boolean = false,
    val createdAt: String = "",
)
