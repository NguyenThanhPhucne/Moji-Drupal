package com.moji.mobile.feature.auth.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.moji.mobile.feature.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AuthUiState(
    val loading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    fun signIn(username: String, password: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            val result = authRepository.signIn(username, password)
            result
                .onSuccess { onSuccess() }
                .onFailure { throwable ->
                    _uiState.update {
                        it.copy(error = throwable.message ?: "Sign in failed")
                    }
                }
            _uiState.update { it.copy(loading = false) }
        }
    }

    fun signUp(
        username: String,
        password: String,
        email: String,
        firstName: String,
        lastName: String,
        onSuccess: () -> Unit,
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            val result = authRepository.signUp(
                username = username,
                password = password,
                email = email,
                firstName = firstName,
                lastName = lastName,
            )
            result
                .onSuccess { onSuccess() }
                .onFailure { throwable ->
                    _uiState.update {
                        it.copy(error = throwable.message ?: "Sign up failed")
                    }
                }
            _uiState.update { it.copy(loading = false) }
        }
    }
}
