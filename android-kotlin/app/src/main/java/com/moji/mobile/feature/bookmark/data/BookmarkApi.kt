package com.moji.mobile.feature.bookmark.data

import com.google.gson.annotations.SerializedName
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface BookmarkApi {
    @POST("bookmarks/{messageId}/toggle")
    suspend fun toggleBookmark(@Path("messageId") messageId: String): ToggleBookmarkResponseDto

    @GET("bookmarks")
    suspend fun getBookmarks(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 30,
    ): BookmarkListResponseDto
}

data class ToggleBookmarkResponseDto(
    val bookmarked: Boolean,
    val messageId: String,
)

data class BookmarkListResponseDto(
    val bookmarks: List<BookmarkDto> = emptyList(),
)

data class BookmarkDto(
    @SerializedName("_id") val id: String,
    val createdAt: String,
)
