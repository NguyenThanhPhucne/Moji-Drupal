package com.moji.mobile.core.model

data class SocialPost(
    val id: String,
    val authorId: String,
    val authorName: String,
    val authorAvatarUrl: String? = null,
    val caption: String,
    val mediaUrls: List<String> = emptyList(),
    val likesCount: Int = 0,
    val commentsCount: Int = 0,
    val createdAt: String,
)
