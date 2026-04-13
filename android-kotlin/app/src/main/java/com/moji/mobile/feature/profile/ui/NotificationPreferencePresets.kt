package com.moji.mobile.feature.profile.ui

import com.moji.mobile.core.model.NotificationPreferences
import com.moji.mobile.core.model.NotificationPreferencesPatch
import com.moji.mobile.core.model.SocialNotificationPreferences
import com.moji.mobile.core.model.SocialNotificationPreferencesPatch

enum class NotificationPresetKey {
    Focus,
    Balanced,
    Everything,
}

data class NotificationPreset(
    val key: NotificationPresetKey,
    val title: String,
    val subtitle: String,
    val delivery: Triple<Boolean, Boolean, Boolean>,
    val social: SocialNotificationPreferences,
)

val NotificationPresets = listOf(
    NotificationPreset(
        key = NotificationPresetKey.Focus,
        title = "Focus",
        subtitle = "Essential notifications only",
        delivery = Triple(true, false, false),
        social = SocialNotificationPreferences(
            muted = true,
            follow = false,
            like = false,
            comment = false,
            friendAccepted = false,
            system = true,
            digestEnabled = true,
            digestWindowHours = 12,
        ),
    ),
    NotificationPreset(
        key = NotificationPresetKey.Balanced,
        title = "Balanced",
        subtitle = "Recommended daily setup",
        delivery = Triple(true, true, false),
        social = SocialNotificationPreferences(
            muted = false,
            follow = true,
            like = true,
            comment = true,
            friendAccepted = true,
            system = true,
            digestEnabled = false,
            digestWindowHours = 6,
        ),
    ),
    NotificationPreset(
        key = NotificationPresetKey.Everything,
        title = "Everything",
        subtitle = "All alerts in realtime",
        delivery = Triple(true, true, true),
        social = SocialNotificationPreferences(
            muted = false,
            follow = true,
            like = true,
            comment = true,
            friendAccepted = true,
            system = true,
            digestEnabled = false,
            digestWindowHours = 3,
        ),
    ),
)

fun buildPresetPatch(preset: NotificationPreset): NotificationPreferencesPatch {
    return NotificationPreferencesPatch(
        message = preset.delivery.first,
        sound = preset.delivery.second,
        desktop = preset.delivery.third,
        social = SocialNotificationPreferencesPatch(
            muted = preset.social.muted,
            follow = preset.social.follow,
            like = preset.social.like,
            comment = preset.social.comment,
            friendAccepted = preset.social.friendAccepted,
            system = preset.social.system,
            digestEnabled = preset.social.digestEnabled,
            digestWindowHours = preset.social.digestWindowHours,
        ),
    )
}

fun resolveActivePreset(preferences: NotificationPreferences): NotificationPresetKey? {
    val social = preferences.social

    return NotificationPresets.firstOrNull { preset ->
        preferences.message == preset.delivery.first &&
            preferences.sound == preset.delivery.second &&
            preferences.desktop == preset.delivery.third &&
            social.muted == preset.social.muted &&
            social.follow == preset.social.follow &&
            social.like == preset.social.like &&
            social.comment == preset.social.comment &&
            social.friendAccepted == preset.social.friendAccepted &&
            social.system == preset.social.system &&
            social.digestEnabled == preset.social.digestEnabled &&
            social.digestWindowHours == preset.social.digestWindowHours
    }?.key
}
