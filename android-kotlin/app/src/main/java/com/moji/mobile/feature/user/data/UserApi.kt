package com.moji.mobile.feature.user.data

import com.moji.mobile.core.network.dto.UserDto
import retrofit2.http.Body
import retrofit2.http.PATCH

data class SocialNotificationPreferencesPatchDto(
    val muted: Boolean? = null,
    val follow: Boolean? = null,
    val like: Boolean? = null,
    val comment: Boolean? = null,
    val friendAccepted: Boolean? = null,
    val system: Boolean? = null,
    val mutedUserIds: List<String>? = null,
    val mutedConversationIds: List<String>? = null,
    val digestEnabled: Boolean? = null,
    val digestWindowHours: Int? = null,
)

data class NotificationPreferencesPatchRequestDto(
    val message: Boolean? = null,
    val sound: Boolean? = null,
    val desktop: Boolean? = null,
    val social: SocialNotificationPreferencesPatchDto? = null,
)

data class OnlineStatusVisibilityRequestDto(
    val showOnlineStatus: Boolean,
)

data class UserMutationResponseDto(
    val message: String? = null,
    val user: UserDto? = null,
)

interface UserApi {
    @PATCH("users/notification-preferences")
    suspend fun updateNotificationPreferences(
        @Body payload: NotificationPreferencesPatchRequestDto,
    ): UserMutationResponseDto

    @PATCH("users/online-status-visibility")
    suspend fun updateOnlineStatusVisibility(
        @Body payload: OnlineStatusVisibilityRequestDto,
    ): UserMutationResponseDto
}
