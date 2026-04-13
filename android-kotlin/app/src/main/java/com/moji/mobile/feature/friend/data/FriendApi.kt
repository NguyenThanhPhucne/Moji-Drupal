package com.moji.mobile.feature.friend.data

import com.google.gson.annotations.SerializedName
import com.moji.mobile.core.network.dto.ApiMessageDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface FriendApi {
    @GET("friends")
    suspend fun getFriends(): FriendsResponseDto

    @GET("friends/requests")
    suspend fun getFriendRequests(): FriendRequestsResponseDto

    @POST("friends/requests")
    suspend fun sendFriendRequest(@Body payload: SendFriendRequestDto): ApiMessageDto
}

data class FriendsResponseDto(
    val friends: List<FriendLiteDto> = emptyList(),
)

data class FriendRequestsResponseDto(
    val sent: List<FriendRequestDto> = emptyList(),
    val received: List<FriendRequestDto> = emptyList(),
)

data class SendFriendRequestDto(
    val to: String,
    val message: String? = null,
)

data class FriendLiteDto(
    @SerializedName("_id") val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
)

data class FriendRequestDto(
    @SerializedName("_id") val id: String,
    val message: String? = null,
)
