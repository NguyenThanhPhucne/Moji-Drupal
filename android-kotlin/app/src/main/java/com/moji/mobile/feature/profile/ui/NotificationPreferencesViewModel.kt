package com.moji.mobile.feature.profile.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.moji.mobile.core.model.NotificationPreferences
import com.moji.mobile.core.model.NotificationPreferencesPatch
import com.moji.mobile.core.model.SocialNotificationPreferences
import com.moji.mobile.core.model.SocialNotificationPreferencesPatch
import com.moji.mobile.core.realtime.NotificationRealtimeEvent
import com.moji.mobile.core.realtime.SocketManager
import com.moji.mobile.core.session.SessionManager
import com.moji.mobile.feature.user.data.UserRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class NotificationPreferencesUiState(
    val saving: Boolean = false,
    val error: String? = null,
    val preferences: NotificationPreferences = NotificationPreferences(),
    val showOnlineStatus: Boolean = true,
    val activePreset: NotificationPresetKey? = NotificationPresetKey.Balanced,
    val recentRealtimeEvents: List<String> = emptyList(),
)

@HiltViewModel
class NotificationPreferencesViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val sessionManager: SessionManager,
    private val socketManager: SocketManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NotificationPreferencesUiState())
    val uiState: StateFlow<NotificationPreferencesUiState> = _uiState.asStateFlow()

    init {
        observeSession()
        observeRealtimeNotifications()
    }

    private fun observeSession() {
        viewModelScope.launch {
            sessionManager.session.collect { sessionState ->
                val user = sessionState.user ?: return@collect
                _uiState.update { current ->
                    current.copy(
                        preferences = user.notificationPreferences,
                        showOnlineStatus = user.showOnlineStatus,
                        activePreset = resolveActivePreset(user.notificationPreferences),
                    )
                }
            }
        }
    }

    private fun observeRealtimeNotifications() {
        viewModelScope.launch {
            socketManager.notificationEvents.collect { event ->
                val eventLabel = when (event) {
                    is NotificationRealtimeEvent.FriendRequestAccepted -> {
                        "Friend accepted: ${event.fromDisplayName ?: "Someone"}"
                    }
                    is NotificationRealtimeEvent.FriendRequestReceived -> {
                        "Friend request: ${event.fromDisplayName ?: "Someone"}"
                    }
                    is NotificationRealtimeEvent.SocialNotification -> {
                        "${event.type.ifBlank { "social" }}: ${event.actorDisplayName ?: "Someone"}"
                    }
                }

                _uiState.update { current ->
                    current.copy(
                        recentRealtimeEvents = listOf(eventLabel) +
                            current.recentRealtimeEvents.take(7),
                    )
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    fun applyPreset(presetKey: NotificationPresetKey) {
        val preset = NotificationPresets.firstOrNull { it.key == presetKey } ?: return
        val nextPreferences = NotificationPreferences(
            message = preset.delivery.first,
            sound = preset.delivery.second,
            desktop = preset.delivery.third,
            social = preset.social,
        )

        applyPreferencesUpdate(
            nextPreferences = nextPreferences,
            patch = buildPresetPatch(preset),
        )
    }

    fun updateDelivery(
        message: Boolean? = null,
        sound: Boolean? = null,
        desktop: Boolean? = null,
    ) {
        val current = _uiState.value.preferences
        val nextPreferences = current.copy(
            message = message ?: current.message,
            sound = sound ?: current.sound,
            desktop = desktop ?: current.desktop,
        )

        applyPreferencesUpdate(
            nextPreferences = nextPreferences,
            patch = NotificationPreferencesPatch(
                message = message,
                sound = sound,
                desktop = desktop,
            ),
        )
    }

    fun updateSocial(
        muted: Boolean? = null,
        follow: Boolean? = null,
        like: Boolean? = null,
        comment: Boolean? = null,
        friendAccepted: Boolean? = null,
        system: Boolean? = null,
        digestEnabled: Boolean? = null,
        digestWindowHours: Int? = null,
    ) {
        val currentSocial = _uiState.value.preferences.social
        val nextSocial = currentSocial.copy(
            muted = muted ?: currentSocial.muted,
            follow = follow ?: currentSocial.follow,
            like = like ?: currentSocial.like,
            comment = comment ?: currentSocial.comment,
            friendAccepted = friendAccepted ?: currentSocial.friendAccepted,
            system = system ?: currentSocial.system,
            digestEnabled = digestEnabled ?: currentSocial.digestEnabled,
            digestWindowHours = digestWindowHours ?: currentSocial.digestWindowHours,
        )

        applyPreferencesUpdate(
            nextPreferences = _uiState.value.preferences.copy(social = nextSocial),
            patch = NotificationPreferencesPatch(
                social = SocialNotificationPreferencesPatch(
                    muted = muted,
                    follow = follow,
                    like = like,
                    comment = comment,
                    friendAccepted = friendAccepted,
                    system = system,
                    digestEnabled = digestEnabled,
                    digestWindowHours = digestWindowHours,
                ),
            ),
        )
    }

    fun updateOnlineStatus(showOnlineStatus: Boolean) {
        val previous = _uiState.value.showOnlineStatus

        _uiState.update { it.copy(showOnlineStatus = showOnlineStatus, saving = true, error = null) }

        viewModelScope.launch {
            val result = userRepository.updateOnlineStatusVisibility(showOnlineStatus)
            result.onFailure { throwable ->
                _uiState.update {
                    it.copy(
                        showOnlineStatus = previous,
                        error = throwable.message ?: "Cannot update online status",
                    )
                }
            }
            _uiState.update { it.copy(saving = false) }
        }
    }

    private fun applyPreferencesUpdate(
        nextPreferences: NotificationPreferences,
        patch: NotificationPreferencesPatch,
    ) {
        val previous = _uiState.value.preferences

        _uiState.update {
            it.copy(
                preferences = nextPreferences,
                activePreset = resolveActivePreset(nextPreferences),
                saving = true,
                error = null,
            )
        }

        viewModelScope.launch {
            val result = userRepository.updateNotificationPreferences(patch)
            result.onFailure { throwable ->
                _uiState.update {
                    it.copy(
                        preferences = previous,
                        activePreset = resolveActivePreset(previous),
                        error = throwable.message ?: "Cannot update notification settings",
                    )
                }
            }
            _uiState.update { it.copy(saving = false) }
        }
    }
}
