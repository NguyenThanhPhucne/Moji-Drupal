package com.moji.mobile.feature.chat.ui

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.gson.Gson
import com.moji.mobile.core.model.Conversation
import com.moji.mobile.core.model.User
import com.moji.mobile.core.network.dto.ConversationsResponseDto
import com.moji.mobile.core.network.dto.DirectMessageRequestDto
import com.moji.mobile.core.network.dto.GroupMessageRequestDto
import com.moji.mobile.core.network.dto.MarkAsSeenResponseDto
import com.moji.mobile.core.network.dto.MessageDto
import com.moji.mobile.core.network.dto.MessagesResponseDto
import com.moji.mobile.core.network.dto.SendMessageResponseDto
import com.moji.mobile.core.realtime.SocketManager
import com.moji.mobile.core.session.SessionManager
import com.moji.mobile.feature.chat.data.ChatApi
import com.moji.mobile.feature.chat.data.ChatRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ChatReadSeenDebounceInstrumentedTest {

    @Test
    fun readSeenQueue_behavesStable_underHighLatency3G() = runBlocking {
        val fakeChatApi = HighLatencyChatApi(
            networkDelayMs = 700L,
            unreadSenderId = "u-peer",
            conversationId = "c-qa-1",
        )
        val chatRepository = ChatRepository(fakeChatApi)

        val context = ApplicationProvider.getApplicationContext<Context>()
        val sessionManager = SessionManager(context, Gson())
        sessionManager.clear()
        sessionManager.saveSession(
            accessToken = "qa-token",
            user = User(
                id = "u-self",
                username = "qa-self",
                email = "qa-self@local.test",
                displayName = "QA Self",
            ),
        )

        val socketManager = SocketManager(Gson())
        val viewModel = ChatViewModel(chatRepository, sessionManager, socketManager)

        val conversation = Conversation(
            id = "c-qa-1",
            type = "direct",
            title = "Latency conversation",
            memberIds = listOf("u-self", "u-peer"),
            memberNames = listOf("QA Self", "Peer"),
            seenByIds = emptyList(),
            updatedAt = "2026-04-13T00:00:00Z",
        )

        // Burst load requests simulates weak network retries/user refresh under 3G latency.
        viewModel.selectConversation(conversation)
        delay(120)
        viewModel.loadMessages(conversation.id)
        delay(120)
        viewModel.loadMessages(conversation.id)

        withTimeout(9000L) {
            while (
                fakeChatApi.markMessageReadCalls.distinct().size < 3 ||
                    fakeChatApi.markConversationSeenCalls.isEmpty()
            ) {
                delay(100)
            }
        }

        assertEquals(setOf("m-1", "m-2", "m-3"), fakeChatApi.markMessageReadCalls.toSet())
        assertEquals(1, fakeChatApi.markConversationSeenCalls.size)
        assertEquals("c-qa-1", fakeChatApi.markConversationSeenCalls.single())
    }
}

private class HighLatencyChatApi(
    private val networkDelayMs: Long,
    private val unreadSenderId: String,
    private val conversationId: String,
) : ChatApi {
    val markMessageReadCalls = mutableListOf<String>()
    val markConversationSeenCalls = mutableListOf<String>()

    override suspend fun fetchConversations(): ConversationsResponseDto {
        return ConversationsResponseDto(conversations = emptyList())
    }

    override suspend fun fetchMessages(
        conversationId: String,
        limit: Int,
        cursor: String?,
    ): MessagesResponseDto {
        return MessagesResponseDto(
            messages = listOf(
                MessageDto(
                    id = "m-1",
                    conversationId = conversationId,
                    senderId = unreadSenderId,
                    senderDisplayName = "Peer",
                    content = "hello-1",
                    readBy = emptyList(),
                    createdAt = "2026-04-13T00:00:00Z",
                ),
                MessageDto(
                    id = "m-2",
                    conversationId = conversationId,
                    senderId = unreadSenderId,
                    senderDisplayName = "Peer",
                    content = "hello-2",
                    readBy = emptyList(),
                    createdAt = "2026-04-13T00:00:01Z",
                ),
                MessageDto(
                    id = "m-3",
                    conversationId = conversationId,
                    senderId = unreadSenderId,
                    senderDisplayName = "Peer",
                    content = "hello-3",
                    readBy = emptyList(),
                    createdAt = "2026-04-13T00:00:02Z",
                ),
            ),
            nextCursor = null,
        )
    }

    override suspend fun sendDirectMessage(payload: DirectMessageRequestDto): SendMessageResponseDto {
        return SendMessageResponseDto(
            message = MessageDto(
                id = "m-local-direct",
                conversationId = payload.conversationId ?: conversationId,
                senderId = "u-self",
                senderDisplayName = "QA Self",
                content = payload.content,
                readBy = listOf("u-self"),
                createdAt = "2026-04-13T00:00:10Z",
            ),
        )
    }

    override suspend fun sendGroupMessage(payload: GroupMessageRequestDto): SendMessageResponseDto {
        return SendMessageResponseDto(
            message = MessageDto(
                id = "m-local-group",
                conversationId = payload.conversationId,
                senderId = "u-self",
                senderDisplayName = "QA Self",
                content = payload.content,
                readBy = listOf("u-self"),
                createdAt = "2026-04-13T00:00:10Z",
            ),
        )
    }

    override suspend fun markConversationSeen(conversationId: String): MarkAsSeenResponseDto {
        delay(networkDelayMs)
        markConversationSeenCalls.add(conversationId)
        return MarkAsSeenResponseDto(message = "ok")
    }

    override suspend fun markMessageRead(messageId: String): MarkAsSeenResponseDto {
        delay(networkDelayMs)
        markMessageReadCalls.add(messageId)
        return MarkAsSeenResponseDto(message = "ok")
    }
}
