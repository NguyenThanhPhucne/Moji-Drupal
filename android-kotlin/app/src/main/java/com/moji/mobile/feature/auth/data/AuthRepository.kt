package com.moji.mobile.feature.auth.data

import com.moji.mobile.core.model.User
import com.moji.mobile.core.network.dto.SignInRequestDto
import com.moji.mobile.core.network.dto.SignUpRequestDto
import com.moji.mobile.core.network.dto.toDomain
import com.moji.mobile.core.session.SessionManager
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val authApi: AuthApi,
    private val sessionManager: SessionManager,
) {
    suspend fun signUp(
        username: String,
        password: String,
        email: String,
        firstName: String,
        lastName: String,
    ): Result<String> {
        return runCatching {
            val response = authApi.signUp(
                SignUpRequestDto(
                    username = username,
                    password = password,
                    email = email,
                    firstName = firstName,
                    lastName = lastName,
                ),
            )
            response.message ?: "Sign up completed"
        }
    }

    suspend fun signIn(username: String, password: String): Result<User> {
        return runCatching {
            val response = authApi.signIn(
                SignInRequestDto(
                    username = username,
                    password = password,
                ),
            )

            val token = response.accessToken
                ?: throw IllegalStateException("Missing access token from /auth/signin")

            val user = response.user?.toDomain() ?: authApi.fetchMe().user.toDomain()
            sessionManager.saveSession(token, user)
            user
        }
    }

    suspend fun restoreSessionIfPossible() {
        val current = sessionManager.session.value
        if (current.isAuthenticated) {
            return
        }

        val restored = runCatching {
            val refreshed = authApi.refresh()
            val me = authApi.fetchMe().user.toDomain()
            sessionManager.saveSession(refreshed.accessToken, me)
        }

        if (restored.isFailure) {
            sessionManager.clear()
        }
    }

    suspend fun signOut() {
        runCatching { authApi.signOut() }
        sessionManager.clear()
    }
}
