package com.moji.mobile.feature.social.data

import com.moji.mobile.core.network.dto.FeedResponseDto
import com.moji.mobile.core.network.dto.MarkNotificationReadResponseDto
import com.moji.mobile.core.network.dto.SocialNotificationsResponseDto
import com.moji.mobile.core.network.dto.SocialOkResponseDto
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query

interface SocialApi {
    @GET("social/feed/home")
    suspend fun getHomeFeed(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 15,
    ): FeedResponseDto

    @GET("social/feed/explore")
    suspend fun getExploreFeed(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 15,
    ): FeedResponseDto

    @GET("social/notifications")
    suspend fun getNotifications(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
    ): SocialNotificationsResponseDto

    @PATCH("social/notifications/{notificationId}/read")
    suspend fun markNotificationRead(
        @Path("notificationId") notificationId: String,
    ): MarkNotificationReadResponseDto

    @PATCH("social/notifications/read-all")
    suspend fun markAllNotificationsRead(): SocialOkResponseDto
}
