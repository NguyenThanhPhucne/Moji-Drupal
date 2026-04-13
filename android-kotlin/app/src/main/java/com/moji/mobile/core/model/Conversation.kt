package com.moji.mobile.core.model

data class Conversation(
    val id: String,
    val type: String,
    val title: String,
    val memberIds: List<String> = emptyList(),
    val memberNames: List<String> = emptyList(),
    val lastMessageId: String? = null,
    val lastMessage: String? = null,
    val seenByIds: List<String> = emptyList(),
    val updatedAt: String? = null,
)
