package com.moji.mobile.core.realtime

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.google.gson.reflect.TypeToken
import com.moji.mobile.BuildConfig
import com.moji.mobile.core.model.Conversation
import com.moji.mobile.core.model.Message
import com.moji.mobile.core.model.MessageReaction
import com.moji.mobile.core.model.SocialPost
import com.moji.mobile.core.network.dto.MessageDto
import com.moji.mobile.core.network.dto.MessageReactionDto
import com.moji.mobile.core.network.dto.SocialPostDto
import com.moji.mobile.core.network.dto.toDomain
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.engineio.client.transports.Polling
import io.socket.engineio.client.transports.WebSocket
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow

private data class SocketActorDto(
    @SerializedName("_id") val id: String? = null,
    val displayName: String? = null,
    val avatarUrl: String? = null,
)

private data class SocketSocialNotificationDto(
    @SerializedName("_id") val id: String? = null,
    val type: String? = null,
    val message: String? = null,
    val actorId: SocketActorDto? = null,
    val postId: String? = null,
    val conversationId: String? = null,
    val commentId: String? = null,
    val isRead: Boolean? = null,
    val createdAt: String? = null,
)

private data class SocialNotificationPayload(
    val notification: SocketSocialNotificationDto? = null,
)

private data class FriendRequestReceivedPayload(
    val message: String? = null,
    val request: SocketFriendRequestDto? = null,
)

private data class SocketFriendRequestDto(
    val from: SocketActorDto? = null,
)

private data class FriendRequestAcceptedPayload(
    val message: String? = null,
    val from: SocketActorDto? = null,
)

private data class SocketConversationGroupDto(
    val name: String? = null,
)

private data class SocketConversationLastMessageSenderDto(
    @SerializedName("_id") val id: String? = null,
    val displayName: String? = null,
)

private data class SocketConversationLastMessageDto(
    @SerializedName("_id") val id: String? = null,
    val content: String? = null,
    val createdAt: String? = null,
    val sender: SocketConversationLastMessageSenderDto? = null,
)

private data class SocketConversationDto(
    @SerializedName("_id") val id: String? = null,
    val type: String? = null,
    val group: SocketConversationGroupDto? = null,
    val lastMessage: SocketConversationLastMessageDto? = null,
    val seenBy: List<Any>? = null,
    val updatedAt: String? = null,
)

private data class MessageReadPayload(
    val conversationId: String? = null,
    val messageId: String? = null,
    val readBy: List<Any>? = null,
)

private data class MessageReactedPayload(
    val conversationId: String? = null,
    val messageId: String? = null,
    val reactions: List<MessageReactionDto>? = null,
)

private data class SocketReadConversationDto(
    @SerializedName("_id") val id: String? = null,
    val seenBy: List<Any>? = null,
)

private data class SocketReadLastMessageDto(
    @SerializedName("_id") val id: String? = null,
    val content: String? = null,
    val createdAt: String? = null,
)

private data class ReadMessagePayload(
    val conversation: SocketReadConversationDto? = null,
    val lastMessage: SocketReadLastMessageDto? = null,
)

private data class UserTypingPayload(
    val conversationId: String? = null,
    val userId: String? = null,
    val displayName: String? = null,
)

private data class UserStopTypingPayload(
    val conversationId: String? = null,
    val userId: String? = null,
)

private data class NewMessagePayload(
    val message: MessageDto? = null,
    val conversation: SocketConversationDto? = null,
)

private data class SocialPostPayload(
    val post: SocialPostDto? = null,
)

private data class SocialPostDeletedPayload(
    val postId: String? = null,
)

private data class SocialPostLikeUpdatedPayload(
    val postId: String? = null,
    val likesCount: Int? = null,
)

private data class SocialPostCommentAddedPayload(
    val postId: String? = null,
    val commentsCount: Int? = null,
    val comment: SocketCommentDto? = null,
)

private data class SocketCommentDto(
    @SerializedName("_id") val id: String? = null,
)

private data class SocialPostCommentDeletedPayload(
    val postId: String? = null,
    val commentId: String? = null,
    val deletedCommentIds: List<String>? = null,
    val commentsCount: Int? = null,
)

private data class GroupConversationUpdatedPayload(
    val conversation: SocketConversationDto? = null,
)

private data class ConversationDeletedPayload(
    val conversationId: String? = null,
)

private fun Any?.toNormalizedIdOrNull(): String? {
    return when (this) {
        is String -> this
        is Number -> this.toString()
        is Map<*, *> -> this["_id"]?.toString()
        else -> null
    }?.trim()?.takeIf { it.isNotBlank() }
}

private fun List<Any>?.toNormalizedIdList(): List<String> {
    return this.orEmpty().mapNotNull { item ->
        item.toNormalizedIdOrNull()
    }
}

private fun MessageReactionDto.toDomainOrNull(): MessageReaction? {
    val normalizedUserId = userId.toNormalizedIdOrNull() ?: return null
    val normalizedEmoji = emoji?.trim()?.takeIf { it.isNotBlank() } ?: return null

    return MessageReaction(
        userId = normalizedUserId,
        emoji = normalizedEmoji,
    )
}

private fun SocketConversationDto.toDomain(): Conversation {
    return Conversation(
        id = id.orEmpty(),
        type = type ?: "direct",
        title = group?.name?.takeIf { it.isNotBlank() } ?: "Conversation",
        memberIds = emptyList(),
        memberNames = emptyList(),
        lastMessageId = lastMessage?.id,
        lastMessage = lastMessage?.content,
        seenByIds = seenBy.toNormalizedIdList(),
        updatedAt = updatedAt,
    )
}

@Singleton
class SocketManager @Inject constructor(
    private val gson: Gson,
) {
    private var socket: Socket? = null

    private val _onlineUserIds = MutableStateFlow<List<String>>(emptyList())
    val onlineUserIds: StateFlow<List<String>> = _onlineUserIds.asStateFlow()

    private val _chatEvents = MutableSharedFlow<ChatRealtimeEvent>(extraBufferCapacity = 64)
    val chatEvents: SharedFlow<ChatRealtimeEvent> = _chatEvents.asSharedFlow()

    private val _socialEvents = MutableSharedFlow<SocialRealtimeEvent>(extraBufferCapacity = 64)
    val socialEvents: SharedFlow<SocialRealtimeEvent> = _socialEvents.asSharedFlow()

    private val _notificationEvents =
        MutableSharedFlow<NotificationRealtimeEvent>(extraBufferCapacity = 64)
    val notificationEvents: SharedFlow<NotificationRealtimeEvent> =
        _notificationEvents.asSharedFlow()

    fun connect(accessToken: String) {
        if (accessToken.isBlank()) {
            return
        }

        val existingSocket = socket
        if (existingSocket != null && existingSocket.connected()) {
            return
        }

        disconnect()

        val options = IO.Options.builder()
            .setAuth(mapOf("token" to accessToken))
            .setPath("/socket.io")
            .setTransports(arrayOf(WebSocket.NAME, Polling.NAME))
            .setReconnection(true)
            .setReconnectionAttempts(Int.MAX_VALUE)
            .setReconnectionDelay(1000)
            .setReconnectionDelayMax(5000)
            .setTimeout(20_000)
            .build()

        val newSocket = IO.socket(resolveSocketBaseUrl(), options)
        socket = newSocket
        bindSocketListeners(newSocket)
        newSocket.connect()
    }

    fun disconnect() {
        socket?.off()
        socket?.disconnect()
        socket = null
        _onlineUserIds.value = emptyList()
    }

    fun joinConversationRoom(conversationId: String) {
        if (conversationId.isBlank()) {
            return
        }
        socket?.emit("join-conversation", conversationId)
    }

    fun emitTyping(conversationId: String) {
        if (conversationId.isBlank()) {
            return
        }
        socket?.emit("typing", conversationId)
    }

    fun emitStopTyping(conversationId: String) {
        if (conversationId.isBlank()) {
            return
        }
        socket?.emit("stop_typing", conversationId)
    }

    private fun bindSocketListeners(newSocket: Socket) {
        newSocket.on("online-users") { args ->
            val nextIds = decodeStringList(args)
            _onlineUserIds.value = nextIds
        }

        newSocket.on("new-message") { args ->
            val payload = decodePayload<NewMessagePayload>(args) ?: return@on
            val messageDto = payload.message ?: return@on

            val message = messageDto.toDomain(
                defaultConversationId = messageDto.conversationId.orEmpty(),
            )

            val conversation = payload.conversation
                ?.takeIf { !it.id.isNullOrBlank() }
                ?.toDomain()

            _chatEvents.tryEmit(
                ChatRealtimeEvent.MessageReceived(
                    message = message,
                    conversation = conversation,
                ),
            )
        }

        newSocket.on("message-read") { args ->
            val payload = decodePayload<MessageReadPayload>(args) ?: return@on
            val conversationId = payload.conversationId.orEmpty().trim()
            val messageId = payload.messageId.orEmpty().trim()
            if (conversationId.isEmpty() || messageId.isEmpty()) {
                return@on
            }

            _chatEvents.tryEmit(
                ChatRealtimeEvent.MessageRead(
                    conversationId = conversationId,
                    messageId = messageId,
                    readBy = payload.readBy.toNormalizedIdList(),
                ),
            )
        }

        newSocket.on("message-reacted") { args ->
            val payload = decodePayload<MessageReactedPayload>(args) ?: return@on
            val conversationId = payload.conversationId.orEmpty().trim()
            val messageId = payload.messageId.orEmpty().trim()
            if (conversationId.isEmpty() || messageId.isEmpty()) {
                return@on
            }

            _chatEvents.tryEmit(
                ChatRealtimeEvent.MessageReacted(
                    conversationId = conversationId,
                    messageId = messageId,
                    reactions = payload.reactions.orEmpty().mapNotNull { it.toDomainOrNull() },
                ),
            )
        }

        newSocket.on("read-message") { args ->
            val payload = decodePayload<ReadMessagePayload>(args) ?: return@on
            val conversation = payload.conversation ?: return@on
            val conversationId = conversation.id.orEmpty().trim()
            if (conversationId.isEmpty()) {
                return@on
            }

            _chatEvents.tryEmit(
                ChatRealtimeEvent.ConversationSeenUpdated(
                    conversationId = conversationId,
                    seenByIds = conversation.seenBy.toNormalizedIdList(),
                    lastMessageId = payload.lastMessage?.id,
                    lastMessageContent = payload.lastMessage?.content,
                    lastMessageCreatedAt = payload.lastMessage?.createdAt,
                ),
            )
        }

        newSocket.on("user-typing") { args ->
            val payload = decodePayload<UserTypingPayload>(args) ?: return@on
            val conversationId = payload.conversationId.orEmpty().trim()
            val userId = payload.userId.orEmpty().trim()
            if (conversationId.isEmpty() || userId.isEmpty()) {
                return@on
            }

            _chatEvents.tryEmit(
                ChatRealtimeEvent.UserTyping(
                    conversationId = conversationId,
                    userId = userId,
                    displayName = payload.displayName?.takeIf { it.isNotBlank() } ?: "Someone",
                ),
            )
        }

        newSocket.on("user-stop_typing") { args ->
            val payload = decodePayload<UserStopTypingPayload>(args) ?: return@on
            val conversationId = payload.conversationId.orEmpty().trim()
            val userId = payload.userId.orEmpty().trim()
            if (conversationId.isEmpty() || userId.isEmpty()) {
                return@on
            }

            _chatEvents.tryEmit(
                ChatRealtimeEvent.UserStopTyping(
                    conversationId = conversationId,
                    userId = userId,
                ),
            )
        }

        newSocket.on("new-group") { args ->
            val conversation = decodePayload<SocketConversationDto>(args)
                ?.takeIf { !it.id.isNullOrBlank() }
                ?.toDomain()
                ?: return@on
            joinConversationRoom(conversation.id)
            _chatEvents.tryEmit(ChatRealtimeEvent.ConversationAdded(conversation))
        }

        newSocket.on("new-conversation") { args ->
            val conversation = decodePayload<SocketConversationDto>(args)
                ?.takeIf { !it.id.isNullOrBlank() }
                ?.toDomain()
                ?: return@on
            joinConversationRoom(conversation.id)
            _chatEvents.tryEmit(ChatRealtimeEvent.ConversationAdded(conversation))
        }

        newSocket.on("group-conversation-updated") { args ->
            val payload = decodePayload<GroupConversationUpdatedPayload>(args)
            val conversation = payload?.conversation
                ?.takeIf { !it.id.isNullOrBlank() }
                ?.toDomain()
                ?: return@on
            _chatEvents.tryEmit(ChatRealtimeEvent.ConversationUpdated(conversation))
        }

        newSocket.on("conversation-deleted") { args ->
            val payload = decodePayload<ConversationDeletedPayload>(args) ?: return@on
            val conversationId = payload.conversationId.orEmpty().trim()
            if (conversationId.isEmpty()) {
                return@on
            }
            _chatEvents.tryEmit(ChatRealtimeEvent.ConversationDeleted(conversationId))
        }

        newSocket.on("social-post-created") { args ->
            val payload = decodePayload<SocialPostPayload>(args) ?: return@on
            val post = payload.post?.toDomain() ?: return@on
            _socialEvents.tryEmit(SocialRealtimeEvent.PostCreated(post))
        }

        newSocket.on("social-post-updated") { args ->
            val payload = decodePayload<SocialPostPayload>(args) ?: return@on
            val post = payload.post?.toDomain() ?: return@on
            _socialEvents.tryEmit(SocialRealtimeEvent.PostUpdated(post))
        }

        newSocket.on("social-post-deleted") { args ->
            val payload = decodePayload<SocialPostDeletedPayload>(args) ?: return@on
            val postId = payload.postId.orEmpty().trim()
            if (postId.isEmpty()) {
                return@on
            }
            _socialEvents.tryEmit(SocialRealtimeEvent.PostDeleted(postId))
        }

        newSocket.on("social-post-like-updated") { args ->
            val payload = decodePayload<SocialPostLikeUpdatedPayload>(args) ?: return@on
            val postId = payload.postId.orEmpty().trim()
            val likesCount = payload.likesCount
            if (postId.isEmpty() || likesCount == null) {
                return@on
            }
            _socialEvents.tryEmit(
                SocialRealtimeEvent.LikeUpdated(
                    SocialLikeUpdateEvent(
                        postId = postId,
                        likesCount = likesCount,
                    ),
                ),
            )
        }

        newSocket.on("social-post-comment-added") { args ->
            val payload = decodePayload<SocialPostCommentAddedPayload>(args) ?: return@on
            val postId = payload.postId.orEmpty().trim()
            val commentId = payload.comment?.id.orEmpty().trim()
            if (postId.isEmpty() || commentId.isEmpty()) {
                return@on
            }
            _socialEvents.tryEmit(
                SocialRealtimeEvent.CommentAdded(
                    SocialCommentAddedEvent(
                        postId = postId,
                        commentId = commentId,
                        commentsCount = payload.commentsCount,
                    ),
                ),
            )
        }

        newSocket.on("social-post-comment-deleted") { args ->
            val payload = decodePayload<SocialPostCommentDeletedPayload>(args) ?: return@on
            val postId = payload.postId.orEmpty().trim()
            if (postId.isEmpty()) {
                return@on
            }
            val deletedCommentIds = when {
                !payload.deletedCommentIds.isNullOrEmpty() -> payload.deletedCommentIds
                !payload.commentId.isNullOrBlank() -> listOf(payload.commentId)
                else -> emptyList()
            }.map(String::trim).filter(String::isNotBlank)

            if (deletedCommentIds.isEmpty()) {
                return@on
            }

            _socialEvents.tryEmit(
                SocialRealtimeEvent.CommentDeleted(
                    SocialCommentDeletedEvent(
                        postId = postId,
                        deletedCommentIds = deletedCommentIds,
                        commentsCount = payload.commentsCount,
                    ),
                ),
            )
        }

        newSocket.on("friend-request-received") { args ->
            val payload = decodePayload<FriendRequestReceivedPayload>(args) ?: return@on
            _notificationEvents.tryEmit(
                NotificationRealtimeEvent.FriendRequestReceived(
                    message = payload.message ?: "New friend request",
                    fromDisplayName = payload.request?.from?.displayName,
                ),
            )
        }

        newSocket.on("friend-request-accepted") { args ->
            val payload = decodePayload<FriendRequestAcceptedPayload>(args) ?: return@on
            _notificationEvents.tryEmit(
                NotificationRealtimeEvent.FriendRequestAccepted(
                    message = payload.message ?: "Friend request accepted",
                    fromDisplayName = payload.from?.displayName,
                ),
            )
        }

        newSocket.on("social-notification") { args ->
            val payload = decodePayload<SocialNotificationPayload>(args) ?: return@on
            val notification = payload.notification ?: return@on
            _notificationEvents.tryEmit(
                NotificationRealtimeEvent.SocialNotification(
                    notificationId = notification.id,
                    type = notification.type.orEmpty(),
                    message = notification.message ?: "New social activity",
                    actorDisplayName = notification.actorId?.displayName,
                    actorAvatarUrl = notification.actorId?.avatarUrl,
                    postId = notification.postId,
                    conversationId = notification.conversationId,
                    commentId = notification.commentId,
                    isRead = notification.isRead ?: false,
                    createdAt = notification.createdAt,
                ),
            )
        }
    }

    private inline fun <reified T> decodePayload(args: Array<out Any>): T? {
        val rawPayload = args.firstOrNull() ?: return null
        return runCatching {
            gson.fromJson(rawPayload.toString(), T::class.java)
        }.getOrNull()
    }

    private fun decodeStringList(args: Array<out Any>): List<String> {
        val rawPayload = args.firstOrNull() ?: return emptyList()
        val listType = object : TypeToken<List<String>>() {}.type
        return runCatching {
            gson.fromJson<List<String>>(rawPayload.toString(), listType)
        }.getOrElse { emptyList() }.map(String::trim).filter(String::isNotBlank)
    }

    private fun resolveSocketBaseUrl(): String {
        val raw = BuildConfig.API_BASE_URL.trim()
        val uri = runCatching { URI(raw) }.getOrNull()
        if (uri == null || uri.host.isNullOrBlank()) {
            return raw
        }

        val portSection = if (uri.port == -1) "" else ":${uri.port}"
        return "${uri.scheme}://${uri.host}$portSection"
    }
}
