package com.moji.mobile.core.network.dto

import com.google.gson.annotations.SerializedName
import com.moji.mobile.core.model.NotificationPreferences
import com.moji.mobile.core.model.SocialNotificationPreferences
import com.moji.mobile.core.model.User

data class SignUpRequestDto(
    val username: String,
    val password: String,
    val email: String,
    val firstName: String,
    val lastName: String,
)

data class SignInRequestDto(
    val username: String,
    val password: String,
)

data class ApiMessageDto(
    val message: String? = null,
)

data class RefreshResponseDto(
    val accessToken: String,
)

data class SignInResponseDto(
    val accessToken: String? = null,
    val user: UserDto? = null,
)

data class MeResponseDto(
    val user: UserDto,
)

data class UserDto(
    @SerializedName("_id") val id: String,
    val username: String,
    val email: String? = null,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val bio: String? = null,
    val phone: String? = null,
    val showOnlineStatus: Boolean? = null,
    val notificationPreferences: NotificationPreferencesDto? = null,
)

data class NotificationPreferencesDto(
    val message: Boolean? = null,
    val sound: Boolean? = null,
    val desktop: Boolean? = null,
    val social: SocialNotificationPreferencesDto? = null,
)

data class SocialNotificationPreferencesDto(
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

fun UserDto.toDomain(): User {
    val socialPrefs = notificationPreferences?.social

    return User(
        id = id,
        username = username,
        email = email.orEmpty(),
        displayName = displayName?.takeIf { it.isNotBlank() } ?: username,
        avatarUrl = avatarUrl,
        bio = bio,
        phone = phone,
        showOnlineStatus = showOnlineStatus ?: true,
        notificationPreferences = NotificationPreferences(
            message = notificationPreferences?.message ?: true,
            sound = notificationPreferences?.sound ?: true,
            desktop = notificationPreferences?.desktop ?: false,
            social = SocialNotificationPreferences(
                muted = socialPrefs?.muted ?: false,
                follow = socialPrefs?.follow ?: true,
                like = socialPrefs?.like ?: true,
                comment = socialPrefs?.comment ?: true,
                friendAccepted = socialPrefs?.friendAccepted ?: true,
                system = socialPrefs?.system ?: true,
                mutedUserIds = socialPrefs?.mutedUserIds ?: emptyList(),
                mutedConversationIds = socialPrefs?.mutedConversationIds ?: emptyList(),
                digestEnabled = socialPrefs?.digestEnabled ?: false,
                digestWindowHours = socialPrefs?.digestWindowHours ?: 6,
            ),
        ),
    )
}
