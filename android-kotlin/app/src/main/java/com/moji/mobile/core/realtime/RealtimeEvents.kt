package com.moji.mobile.core.realtime

import com.moji.mobile.core.model.Conversation
import com.moji.mobile.core.model.Message
import com.moji.mobile.core.model.MessageReaction
import com.moji.mobile.core.model.SocialPost

data class SocialLikeUpdateEvent(
    val postId: String,
    val likesCount: Int,
)

data class SocialCommentAddedEvent(
    val postId: String,
    val commentId: String,
    val commentsCount: Int? = null,
)

data class SocialCommentDeletedEvent(
    val postId: String,
    val deletedCommentIds: List<String>,
    val commentsCount: Int? = null,
)

sealed interface ChatRealtimeEvent {
    data class MessageReceived(
        val message: Message,
        val conversation: Conversation? = null,
    ) : ChatRealtimeEvent

    data class MessageRead(
        val conversationId: String,
        val messageId: String,
        val readBy: List<String>,
    ) : ChatRealtimeEvent

    data class MessageReacted(
        val conversationId: String,
        val messageId: String,
        val reactions: List<MessageReaction>,
    ) : ChatRealtimeEvent

    data class ConversationSeenUpdated(
        val conversationId: String,
        val seenByIds: List<String>,
        val lastMessageId: String? = null,
        val lastMessageContent: String? = null,
        val lastMessageCreatedAt: String? = null,
    ) : ChatRealtimeEvent

    data class UserTyping(
        val conversationId: String,
        val userId: String,
        val displayName: String,
    ) : ChatRealtimeEvent

    data class UserStopTyping(
        val conversationId: String,
        val userId: String,
    ) : ChatRealtimeEvent

    data class ConversationAdded(val conversation: Conversation) : ChatRealtimeEvent
    data class ConversationUpdated(val conversation: Conversation) : ChatRealtimeEvent
    data class ConversationDeleted(val conversationId: String) : ChatRealtimeEvent
}

sealed interface SocialRealtimeEvent {
    data class PostCreated(val post: SocialPost) : SocialRealtimeEvent
    data class PostUpdated(val post: SocialPost) : SocialRealtimeEvent
    data class PostDeleted(val postId: String) : SocialRealtimeEvent
    data class LikeUpdated(val payload: SocialLikeUpdateEvent) : SocialRealtimeEvent
    data class CommentAdded(val payload: SocialCommentAddedEvent) : SocialRealtimeEvent
    data class CommentDeleted(val payload: SocialCommentDeletedEvent) : SocialRealtimeEvent
}

sealed interface NotificationRealtimeEvent {
    data class FriendRequestReceived(
        val message: String,
        val fromDisplayName: String?,
    ) : NotificationRealtimeEvent

    data class FriendRequestAccepted(
        val message: String,
        val fromDisplayName: String?,
    ) : NotificationRealtimeEvent

    data class SocialNotification(
        val notificationId: String? = null,
        val type: String,
        val message: String,
        val actorDisplayName: String?,
        val actorAvatarUrl: String? = null,
        val postId: String? = null,
        val conversationId: String? = null,
        val commentId: String? = null,
        val isRead: Boolean = false,
        val createdAt: String? = null,
    ) : NotificationRealtimeEvent
}
