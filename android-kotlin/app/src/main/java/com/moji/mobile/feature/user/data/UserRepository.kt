package com.moji.mobile.feature.user.data

import com.moji.mobile.core.model.NotificationPreferencesPatch
import com.moji.mobile.core.model.SocialNotificationPreferencesPatch
import com.moji.mobile.core.model.User
import com.moji.mobile.core.network.dto.toDomain
import com.moji.mobile.core.session.SessionManager
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UserRepository @Inject constructor(
    private val userApi: UserApi,
    private val sessionManager: SessionManager,
) {
    suspend fun updateNotificationPreferences(
        payload: NotificationPreferencesPatch,
    ): Result<User> {
        return runCatching {
            val response = userApi.updateNotificationPreferences(payload.toDto())
            val nextUser = response.user?.toDomain()
                ?: throw IllegalStateException("Missing user in notification preference response")
            sessionManager.updateUser(nextUser)
            nextUser
        }
    }

    suspend fun updateOnlineStatusVisibility(showOnlineStatus: Boolean): Result<User> {
        return runCatching {
            val response = userApi.updateOnlineStatusVisibility(
                OnlineStatusVisibilityRequestDto(showOnlineStatus = showOnlineStatus),
            )
            val nextUser = response.user?.toDomain()
                ?: throw IllegalStateException("Missing user in online status response")
            sessionManager.updateUser(nextUser)
            nextUser
        }
    }
}

private fun NotificationPreferencesPatch.toDto(): NotificationPreferencesPatchRequestDto {
    return NotificationPreferencesPatchRequestDto(
        message = message,
        sound = sound,
        desktop = desktop,
        social = social?.toDto(),
    )
}

private fun SocialNotificationPreferencesPatch.toDto(): SocialNotificationPreferencesPatchDto {
    return SocialNotificationPreferencesPatchDto(
        muted = muted,
        follow = follow,
        like = like,
        comment = comment,
        friendAccepted = friendAccepted,
        system = system,
        mutedUserIds = mutedUserIds,
        mutedConversationIds = mutedConversationIds,
        digestEnabled = digestEnabled,
        digestWindowHours = digestWindowHours,
    )
}
