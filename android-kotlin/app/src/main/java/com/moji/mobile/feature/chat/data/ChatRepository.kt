package com.moji.mobile.feature.chat.data

import com.moji.mobile.core.model.Conversation
import com.moji.mobile.core.model.Message
import com.moji.mobile.core.model.MessageReaction
import com.moji.mobile.core.network.dto.DirectMessageRequestDto
import com.moji.mobile.core.network.dto.GroupMessageRequestDto
import com.moji.mobile.core.network.dto.toDomain
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChatRepository @Inject constructor(
    private val chatApi: ChatApi,
) {
    suspend fun fetchConversations(): Result<List<Conversation>> {
        return runCatching {
            chatApi.fetchConversations().conversations.map { it.toDomain() }
        }
    }

    suspend fun fetchMessages(conversationId: String): Result<List<Message>> {
        return runCatching {
            chatApi.fetchMessages(conversationId = conversationId)
                .messages
                .map { it.toDomain(defaultConversationId = conversationId) }
        }
    }

    suspend fun sendDirectMessage(
        recipientId: String,
        content: String,
        conversationId: String? = null,
        replyTo: String? = null,
    ): Result<Message> {
        return runCatching {
            val response = chatApi.sendDirectMessage(
                DirectMessageRequestDto(
                    recipientId = recipientId,
                    content = content,
                    conversationId = conversationId,
                    replyTo = replyTo,
                ),
            )
            response.message.toDomain(defaultConversationId = conversationId.orEmpty())
        }
    }

    suspend fun sendGroupMessage(
        conversationId: String,
        content: String,
        replyTo: String? = null,
    ): Result<Message> {
        return runCatching {
            val response = chatApi.sendGroupMessage(
                GroupMessageRequestDto(
                    conversationId = conversationId,
                    content = content,
                    replyTo = replyTo,
                ),
            )
            response.message.toDomain(defaultConversationId = conversationId)
        }
    }

    suspend fun markConversationSeen(conversationId: String): Result<Unit> {
        return runCatching {
            chatApi.markConversationSeen(conversationId)
            Unit
        }
    }

    suspend fun markMessageRead(messageId: String): Result<Unit> {
        return runCatching {
            chatApi.markMessageRead(messageId)
            Unit
        }
    }

    suspend fun reactToMessage(messageId: String, emoji: String): Result<List<MessageReaction>> {
        return runCatching {
            chatApi.reactToMessage(
                messageId = messageId,
                payload = ReactMessageRequestDto(emoji = emoji),
            ).toDomain(defaultConversationId = "").reactions
        }
    }
}
