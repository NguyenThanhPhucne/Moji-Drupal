package com.moji.mobile.core.network.dto

import com.google.gson.annotations.SerializedName
import com.moji.mobile.core.model.Conversation
import com.moji.mobile.core.model.Message
import com.moji.mobile.core.model.MessageReaction
import com.moji.mobile.core.model.MessageReplyPreview

data class ConversationsResponseDto(
    val conversations: List<ConversationDto> = emptyList(),
)

data class ConversationDto(
    @SerializedName("_id") val id: String,
    val type: String? = null,
    val group: GroupDto? = null,
    val participants: List<ParticipantDto>? = null,
    val lastMessage: LastMessageDto? = null,
    val seenBy: List<Any>? = null,
    val updatedAt: String? = null,
)

data class GroupDto(
    val name: String? = null,
)

data class ParticipantDto(
    @SerializedName("_id") val id: String? = null,
    val displayName: String? = null,
)

data class LastMessageDto(
    @SerializedName("_id") val id: String? = null,
    val content: String? = null,
)

private fun Any.toIdStringOrNull(): String? {
    return when (this) {
        is String -> this
        is Number -> toString()
        is Map<*, *> -> this["_id"]?.toString()
        else -> null
    }?.trim()?.takeIf { it.isNotBlank() }
}

fun ConversationDto.toDomain(): Conversation {
    val safeParticipants = participants.orEmpty()
    val groupTitle = group?.name?.takeIf { it.isNotBlank() }
    val directTitle = safeParticipants
        .mapNotNull { it.displayName }
        .firstOrNull()
        ?: "Direct chat"
    val seenByIds = seenBy.orEmpty().mapNotNull { it.toIdStringOrNull() }

    return Conversation(
        id = id,
        type = type ?: "direct",
        title = groupTitle ?: directTitle,
        memberIds = safeParticipants.mapNotNull { it.id },
        memberNames = safeParticipants.mapNotNull { it.displayName },
        lastMessageId = lastMessage?.id,
        lastMessage = lastMessage?.content,
        seenByIds = seenByIds,
        updatedAt = updatedAt,
    )
}

data class MessagesResponseDto(
    val messages: List<MessageDto> = emptyList(),
    val nextCursor: String? = null,
)

data class MessageDto(
    @SerializedName("_id") val id: String,
    val conversationId: String? = null,
    val senderId: String? = null,
    val senderDisplayName: String? = null,
    val content: String? = null,
    @SerializedName("imgUrl") val imageUrl: String? = null,
    val replyTo: Any? = null,
    val reactions: List<MessageReactionDto>? = null,
    val isDeleted: Boolean? = null,
    val editedAt: String? = null,
    val readBy: List<Any>? = null,
    val createdAt: String? = null,
)

data class MessageReactionDto(
    val userId: Any? = null,
    val emoji: String? = null,
)

private fun MessageReactionDto.toDomainOrNull(): MessageReaction? {
    val normalizedUserId = userId?.toIdStringOrNull() ?: return null
    val normalizedEmoji = emoji?.trim()?.takeIf { it.isNotBlank() } ?: return null
    return MessageReaction(
        userId = normalizedUserId,
        emoji = normalizedEmoji,
    )
}

private fun Any?.toReplyPreviewOrNull(): MessageReplyPreview? {
    return when (this) {
        null -> null
        is String -> {
            val normalizedId = this.trim()
            if (normalizedId.isBlank()) {
                null
            } else {
                MessageReplyPreview(
                    id = normalizedId,
                    content = "",
                    senderId = "",
                    senderDisplayName = null,
                )
            }
        }
        is Map<*, *> -> {
            val normalizedId = this["_id"]?.toString()?.trim().orEmpty()
            if (normalizedId.isBlank()) {
                null
            } else {
                val senderNode = this["sender"] as? Map<*, *>
                MessageReplyPreview(
                    id = normalizedId,
                    content = this["content"]?.toString()?.trim().orEmpty(),
                    senderId = this["senderId"]?.toIdStringOrNull()
                        ?: senderNode?.get("_id")?.toIdStringOrNull()
                        ?: "",
                    senderDisplayName = this["senderDisplayName"]?.toString()?.trim()
                        ?.takeIf { it.isNotBlank() }
                        ?: senderNode?.get("displayName")?.toString()?.trim()
                            ?.takeIf { it.isNotBlank() },
                )
            }
        }
        else -> null
    }
}

fun MessageDto.toDomain(defaultConversationId: String): Message {
    return Message(
        id = id,
        conversationId = conversationId ?: defaultConversationId,
        senderId = senderId.orEmpty(),
        senderDisplayName = senderDisplayName ?: "Unknown",
        content = content.orEmpty(),
        imageUrl = imageUrl,
        replyTo = replyTo.toReplyPreviewOrNull(),
        reactions = reactions.orEmpty().mapNotNull { it.toDomainOrNull() },
        readBy = readBy.orEmpty().mapNotNull { it.toIdStringOrNull() },
        createdAt = createdAt.orEmpty(),
        isDeleted = isDeleted ?: false,
        editedAt = editedAt,
    )
}

data class SendMessageResponseDto(
    val message: MessageDto,
)

data class DirectMessageRequestDto(
    val recipientId: String,
    val content: String,
    val imgUrl: String? = null,
    val conversationId: String? = null,
    val replyTo: String? = null,
)

data class GroupMessageRequestDto(
    val conversationId: String,
    val content: String,
    val imgUrl: String? = null,
    val replyTo: String? = null,
)

data class MarkAsSeenResponseDto(
    val message: String? = null,
)
