package com.moji.mobile.feature.social.data

import com.moji.mobile.core.model.SocialPost
import com.moji.mobile.core.model.SocialNotificationItem
import com.moji.mobile.core.network.dto.toDomain
import javax.inject.Inject
import javax.inject.Singleton

data class SocialNotificationsSnapshot(
    val notifications: List<SocialNotificationItem>,
    val unreadCount: Int,
)

@Singleton
class SocialRepository @Inject constructor(
    private val socialApi: SocialApi,
) {
    suspend fun getHomeFeed(): Result<List<SocialPost>> {
        return runCatching {
            socialApi.getHomeFeed().posts.map { it.toDomain() }
        }
    }

    suspend fun getExploreFeed(): Result<List<SocialPost>> {
        return runCatching {
            socialApi.getExploreFeed().posts.map { it.toDomain() }
        }
    }

    suspend fun getNotifications(limit: Int = 30): Result<SocialNotificationsSnapshot> {
        return runCatching {
            val response = socialApi.getNotifications(limit = limit)
            SocialNotificationsSnapshot(
                notifications = response.notifications.map { it.toDomain() },
                unreadCount = response.unreadCount ?: 0,
            )
        }
    }

    suspend fun markNotificationRead(notificationId: String): Result<SocialNotificationItem?> {
        return runCatching {
            socialApi.markNotificationRead(notificationId).notification?.toDomain()
        }
    }

    suspend fun markAllNotificationsRead(): Result<Unit> {
        return runCatching {
            socialApi.markAllNotificationsRead()
            Unit
        }
    }
}
