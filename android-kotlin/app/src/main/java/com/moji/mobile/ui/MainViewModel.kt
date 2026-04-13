package com.moji.mobile.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.moji.mobile.core.realtime.SocketManager
import com.moji.mobile.core.session.SessionManager
import com.moji.mobile.core.session.SessionState
import com.moji.mobile.feature.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@HiltViewModel
class MainViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val sessionManager: SessionManager,
    private val socketManager: SocketManager,
) : ViewModel() {
    val session: StateFlow<SessionState> = sessionManager.session

    private val _bootstrapping = MutableStateFlow(true)
    val bootstrapping: StateFlow<Boolean> = _bootstrapping.asStateFlow()

    init {
        viewModelScope.launch {
            session.collectLatest { currentSession ->
                val token = currentSession.accessToken
                if (currentSession.isAuthenticated && !token.isNullOrBlank()) {
                    socketManager.connect(token)
                } else {
                    socketManager.disconnect()
                }
            }
        }

        viewModelScope.launch {
            authRepository.restoreSessionIfPossible()
            _bootstrapping.value = false
        }
    }

    fun signOut(onDone: () -> Unit) {
        viewModelScope.launch {
            socketManager.disconnect()
            authRepository.signOut()
            onDone()
        }
    }
}
