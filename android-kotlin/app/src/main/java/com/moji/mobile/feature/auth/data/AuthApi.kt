package com.moji.mobile.feature.auth.data

import com.moji.mobile.core.network.dto.ApiMessageDto
import com.moji.mobile.core.network.dto.MeResponseDto
import com.moji.mobile.core.network.dto.RefreshResponseDto
import com.moji.mobile.core.network.dto.SignInRequestDto
import com.moji.mobile.core.network.dto.SignInResponseDto
import com.moji.mobile.core.network.dto.SignUpRequestDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface AuthApi {
    @POST("auth/signup")
    suspend fun signUp(@Body payload: SignUpRequestDto): ApiMessageDto

    @POST("auth/signin")
    suspend fun signIn(@Body payload: SignInRequestDto): SignInResponseDto

    @POST("auth/signout")
    suspend fun signOut(): ApiMessageDto

    @POST("auth/refresh")
    suspend fun refresh(): RefreshResponseDto

    @GET("users/me")
    suspend fun fetchMe(): MeResponseDto
}
