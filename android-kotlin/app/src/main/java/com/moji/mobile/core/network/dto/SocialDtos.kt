package com.moji.mobile.core.network.dto

import com.google.gson.annotations.SerializedName
import com.moji.mobile.core.model.SocialPost
import com.moji.mobile.core.model.SocialNotificationItem

data class FeedResponseDto(
    val posts: List<SocialPostDto> = emptyList(),
)

data class SocialPostDto(
    @SerializedName("_id") val id: String,
    val authorId: SocialUserLiteDto? = null,
    val caption: String? = null,
    val mediaUrls: List<String>? = null,
    val likesCount: Int? = null,
    val commentsCount: Int? = null,
    val createdAt: String? = null,
)

data class SocialUserLiteDto(
    @SerializedName("_id") val id: String,
    val displayName: String? = null,
    val avatarUrl: String? = null,
)

fun SocialPostDto.toDomain(): SocialPost {
    return SocialPost(
        id = id,
        authorId = authorId?.id.orEmpty(),
        authorName = authorId?.displayName ?: "Unknown",
        authorAvatarUrl = authorId?.avatarUrl,
        caption = caption.orEmpty(),
        mediaUrls = mediaUrls.orEmpty(),
        likesCount = likesCount ?: 0,
        commentsCount = commentsCount ?: 0,
        createdAt = createdAt.orEmpty(),
    )
}

data class SocialNotificationsResponseDto(
    val notifications: List<SocialNotificationDto> = emptyList(),
    val unreadCount: Int? = null,
)

data class SocialNotificationDto(
    @SerializedName("_id") val id: String,
    val type: String? = null,
    val message: String? = null,
    val actorId: SocialUserLiteDto? = null,
    val postId: String? = null,
    val conversationId: String? = null,
    val commentId: String? = null,
    val isRead: Boolean? = null,
    val createdAt: String? = null,
)

data class MarkNotificationReadResponseDto(
    val notification: SocialNotificationDto? = null,
)

data class SocialOkResponseDto(
    val ok: Boolean? = null,
)

fun SocialNotificationDto.toDomain(): SocialNotificationItem {
    val actorName = actorId?.displayName?.takeIf { it.isNotBlank() }

    return SocialNotificationItem(
        id = id,
        type = type.orEmpty(),
        message = message?.takeIf { it.isNotBlank() } ?: "New social activity",
        actorId = actorId?.id,
        actorDisplayName = actorName,
        actorAvatarUrl = actorId?.avatarUrl,
        postId = postId,
        conversationId = conversationId,
        commentId = commentId,
        isRead = isRead ?: false,
        createdAt = createdAt.orEmpty(),
    )
}
