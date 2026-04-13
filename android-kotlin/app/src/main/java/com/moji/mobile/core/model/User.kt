package com.moji.mobile.core.model

data class SocialNotificationPreferences(
    val muted: Boolean = false,
    val follow: Boolean = true,
    val like: Boolean = true,
    val comment: Boolean = true,
    val friendAccepted: Boolean = true,
    val system: Boolean = true,
    val mutedUserIds: List<String> = emptyList(),
    val mutedConversationIds: List<String> = emptyList(),
    val digestEnabled: Boolean = false,
    val digestWindowHours: Int = 6,
)

data class NotificationPreferences(
    val message: Boolean = true,
    val sound: Boolean = true,
    val desktop: Boolean = false,
    val social: SocialNotificationPreferences = SocialNotificationPreferences(),
)

data class SocialNotificationPreferencesPatch(
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

data class NotificationPreferencesPatch(
    val message: Boolean? = null,
    val sound: Boolean? = null,
    val desktop: Boolean? = null,
    val social: SocialNotificationPreferencesPatch? = null,
)

data class User(
    val id: String,
    val username: String,
    val email: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val bio: String? = null,
    val phone: String? = null,
    val showOnlineStatus: Boolean = true,
    val notificationPreferences: NotificationPreferences = NotificationPreferences(),
)
