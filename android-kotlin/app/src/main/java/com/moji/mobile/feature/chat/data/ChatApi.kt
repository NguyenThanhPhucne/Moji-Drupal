package com.moji.mobile.feature.chat.data

import com.moji.mobile.core.network.dto.ConversationsResponseDto
import com.moji.mobile.core.network.dto.DirectMessageRequestDto
import com.moji.mobile.core.network.dto.GroupMessageRequestDto
import com.moji.mobile.core.network.dto.MarkAsSeenResponseDto
import com.moji.mobile.core.network.dto.MessageDto
import com.moji.mobile.core.network.dto.MessagesResponseDto
import com.moji.mobile.core.network.dto.SendMessageResponseDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ChatApi {
    @GET("conversations")
    suspend fun fetchConversations(): ConversationsResponseDto

    @GET("conversations/{conversationId}/messages")
    suspend fun fetchMessages(
        @Path("conversationId") conversationId: String,
        @Query("limit") limit: Int = 50,
        @Query("cursor") cursor: String? = null,
    ): MessagesResponseDto

    @POST("messages/direct")
    suspend fun sendDirectMessage(@Body payload: DirectMessageRequestDto): SendMessageResponseDto

    @POST("messages/group")
    suspend fun sendGroupMessage(@Body payload: GroupMessageRequestDto): SendMessageResponseDto

    @PATCH("conversations/{conversationId}/seen")
    suspend fun markConversationSeen(
        @Path("conversationId") conversationId: String,
    ): MarkAsSeenResponseDto

    @POST("messages/{messageId}/read")
    suspend fun markMessageRead(
        @Path("messageId") messageId: String,
    ): MarkAsSeenResponseDto

    @POST("messages/{messageId}/react")
    suspend fun reactToMessage(
        @Path("messageId") messageId: String,
        @Body payload: ReactMessageRequestDto,
    ): MessageDto
}

data class ReactMessageRequestDto(
    val emoji: String,
)
