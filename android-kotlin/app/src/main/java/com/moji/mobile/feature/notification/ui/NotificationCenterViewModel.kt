package com.moji.mobile.feature.notification.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.moji.mobile.core.model.SocialNotificationItem
import com.moji.mobile.core.realtime.NotificationRealtimeEvent
import com.moji.mobile.core.realtime.SocketManager
import com.moji.mobile.feature.social.data.SocialRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class NotificationCenterUiState(
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val markingAll: Boolean = false,
    val error: String? = null,
    val unreadCount: Int = 0,
    val notifications: List<SocialNotificationItem> = emptyList(),
)

@HiltViewModel
class NotificationCenterViewModel @Inject constructor(
    private val socialRepository: SocialRepository,
    private val socketManager: SocketManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NotificationCenterUiState())
    val uiState: StateFlow<NotificationCenterUiState> = _uiState.asStateFlow()

    init {
        observeRealtimeNotifications()
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            val hasExisting = _uiState.value.notifications.isNotEmpty()
            _uiState.update {
                it.copy(
                    loading = !hasExisting,
                    refreshing = hasExisting,
                    error = null,
                )
            }

            val result = socialRepository.getNotifications(limit = 40)
            result
                .onSuccess { snapshot ->
                    _uiState.update {
                        it.copy(
                            loading = false,
                            refreshing = false,
                            notifications = snapshot.notifications,
                            unreadCount = snapshot.unreadCount,
                        )
                    }
                }
                .onFailure { throwable ->
                    _uiState.update {
                        it.copy(
                            loading = false,
                            refreshing = false,
                            error = throwable.message ?: "Cannot load notifications",
                        )
                    }
                }
        }
    }

    fun markNotificationRead(notificationId: String) {
        if (notificationId.isBlank()) {
            return
        }

        val previousState = _uiState.value
        val target = previousState.notifications.firstOrNull { it.id == notificationId } ?: return
        if (target.isRead) {
            return
        }

        _uiState.update { state ->
            state.copy(
                notifications = state.notifications.map { notification ->
                    if (notification.id == notificationId) {
                        notification.copy(isRead = true)
                    } else {
                        notification
                    }
                },
                unreadCount = (state.unreadCount - 1).coerceAtLeast(0),
            )
        }

        viewModelScope.launch {
            val result = socialRepository.markNotificationRead(notificationId)
            result
                .onSuccess { updated ->
                    if (updated == null) {
                        return@onSuccess
                    }
                    _uiState.update { state ->
                        state.copy(
                            notifications = state.notifications.map { notification ->
                                if (notification.id == notificationId) {
                                    updated
                                } else {
                                    notification
                                }
                            },
                        )
                    }
                }
                .onFailure { throwable ->
                    _uiState.value = previousState.copy(
                        error = throwable.message ?: "Cannot mark notification as read",
                    )
                }
        }
    }

    fun markAllRead() {
        if (_uiState.value.unreadCount == 0 || _uiState.value.markingAll) {
            return
        }

        val previousState = _uiState.value
        _uiState.update { state ->
            state.copy(
                markingAll = true,
                error = null,
                unreadCount = 0,
                notifications = state.notifications.map { it.copy(isRead = true) },
            )
        }

        viewModelScope.launch {
            val result = socialRepository.markAllNotificationsRead()
            result
                .onFailure { throwable ->
                    _uiState.value = previousState.copy(
                        error = throwable.message ?: "Cannot mark all notifications as read",
                    )
                }

            _uiState.update { state ->
                state.copy(markingAll = false)
            }
        }
    }

    private fun observeRealtimeNotifications() {
        viewModelScope.launch {
            socketManager.notificationEvents.collect { event ->
                when (event) {
                    is NotificationRealtimeEvent.SocialNotification -> {
                        val generatedId = event.notificationId
                            ?: "realtime-${System.currentTimeMillis()}-${event.type}"
                        upsertRealtimeNotification(
                            SocialNotificationItem(
                                id = generatedId,
                                type = event.type,
                                message = event.message,
                                actorDisplayName = event.actorDisplayName,
                                actorAvatarUrl = event.actorAvatarUrl,
                                postId = event.postId,
                                conversationId = event.conversationId,
                                commentId = event.commentId,
                                isRead = event.isRead,
                                createdAt = event.createdAt.orEmpty(),
                            ),
                        )
                    }

                    is NotificationRealtimeEvent.FriendRequestReceived -> {
                        upsertRealtimeNotification(
                            SocialNotificationItem(
                                id = "friend-request-${System.currentTimeMillis()}",
                                type = "friend_request",
                                message = event.message,
                                actorDisplayName = event.fromDisplayName,
                                isRead = false,
                                createdAt = "",
                            ),
                        )
                    }

                    is NotificationRealtimeEvent.FriendRequestAccepted -> {
                        upsertRealtimeNotification(
                            SocialNotificationItem(
                                id = "friend-accepted-${System.currentTimeMillis()}",
                                type = "friend_accepted",
                                message = event.message,
                                actorDisplayName = event.fromDisplayName,
                                isRead = false,
                                createdAt = "",
                            ),
                        )
                    }
                }
            }
        }
    }

    private fun upsertRealtimeNotification(notification: SocialNotificationItem) {
        _uiState.update { state ->
            val existingIndex = state.notifications.indexOfFirst { it.id == notification.id }
            val previousItem = if (existingIndex >= 0) state.notifications[existingIndex] else null
            val nextNotifications = if (existingIndex >= 0) {
                state.notifications.map {
                    if (it.id == notification.id) {
                        notification
                    } else {
                        it
                    }
                }
            } else {
                listOf(notification) + state.notifications
            }

            val shouldIncrementUnread = !notification.isRead &&
                (previousItem == null || previousItem.isRead)

            state.copy(
                notifications = nextNotifications,
                unreadCount = if (shouldIncrementUnread) {
                    state.unreadCount + 1
                } else {
                    state.unreadCount
                },
            )
        }
    }
}
