package com.moji.mobile.core.network

import com.moji.mobile.core.session.SessionManager
import javax.inject.Inject
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor @Inject constructor(
    private val sessionManager: SessionManager,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val currentToken = sessionManager.session.value.accessToken
        val request = if (currentToken.isNullOrBlank()) {
            chain.request()
        } else {
            chain.request()
                .newBuilder()
                .header("Authorization", "Bearer $currentToken")
                .build()
        }

        return chain.proceed(request)
    }
}
