package com.moji.mobile.feature.search.data

import com.google.gson.annotations.SerializedName
import retrofit2.http.GET
import retrofit2.http.Query

interface SearchApi {
    @GET("search/global")
    suspend fun globalSearch(@Query("q") query: String): GlobalSearchResponseDto
}

data class GlobalSearchResponseDto(
    val people: List<SearchPersonDto> = emptyList(),
    val groups: List<SearchGroupDto> = emptyList(),
    val messages: List<SearchMessageDto> = emptyList(),
    val posts: List<SearchPostDto> = emptyList(),
)

data class SearchPersonDto(
    @SerializedName("_id") val id: String,
    val displayName: String,
    val username: String,
)

data class SearchGroupDto(
    val conversationId: String,
    val name: String,
)

data class SearchMessageDto(
    val messageId: String,
    val conversationId: String,
    val content: String,
)

data class SearchPostDto(
    val postId: String,
    val caption: String,
)
