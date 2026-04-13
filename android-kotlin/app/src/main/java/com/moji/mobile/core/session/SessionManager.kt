package com.moji.mobile.core.session

import android.content.Context
import com.google.gson.Gson
import com.moji.mobile.core.model.User
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private const val PREFS_NAME = "moji_mobile_session"
private const val KEY_ACCESS_TOKEN = "access_token"
private const val KEY_USER_JSON = "user_json"

data class SessionState(
    val accessToken: String? = null,
    val user: User? = null,
) {
    val isAuthenticated: Boolean
        get() = !accessToken.isNullOrBlank() && user != null
}

@Singleton
class SessionManager @Inject constructor(
    @ApplicationContext context: Context,
    private val gson: Gson,
) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _session = MutableStateFlow(readSession())
    val session: StateFlow<SessionState> = _session.asStateFlow()

    fun saveSession(accessToken: String, user: User) {
        val newState = SessionState(accessToken = accessToken, user = user)
        persist(newState)
        _session.value = newState
    }

    fun updateToken(accessToken: String) {
        val newState = _session.value.copy(accessToken = accessToken)
        persist(newState)
        _session.value = newState
    }

    fun updateUser(user: User) {
        val newState = _session.value.copy(user = user)
        persist(newState)
        _session.value = newState
    }

    fun clear() {
        prefs.edit().clear().apply()
        _session.value = SessionState()
    }

    private fun readSession(): SessionState {
        val token = prefs.getString(KEY_ACCESS_TOKEN, null)
        val userJson = prefs.getString(KEY_USER_JSON, null)
        val user = userJson?.let {
            runCatching { gson.fromJson(it, User::class.java) }.getOrNull()
        }
        return SessionState(accessToken = token, user = user)
    }

    private fun persist(state: SessionState) {
        val userJson = state.user?.let(gson::toJson)
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, state.accessToken)
            .putString(KEY_USER_JSON, userJson)
            .apply()
    }
}
