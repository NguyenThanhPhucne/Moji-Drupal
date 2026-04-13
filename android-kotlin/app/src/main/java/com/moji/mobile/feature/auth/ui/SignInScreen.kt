package com.moji.mobile.feature.auth.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.moji.mobile.ui.components.ShadcnInput
import com.moji.mobile.ui.components.ShadcnPrimaryButton
import com.moji.mobile.ui.components.ShadcnOutlineButton

@Composable
fun SignInScreen(
    onNavigateSignUp: () -> Unit,
    onSignInSuccess: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    AuthSceneLayout(
        heroTag = "Team Workspace",
        heroTitle = "Stay connected with cleaner chat and faster social updates.",
        heroSubtitle = "Realtime sync across conversations, notifications, and profile settings.",
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                text = "Welcome back",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Sign in to continue your conversations.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(modifier = Modifier.height(2.dp))

            ShadcnInput(
                value = username,
                onValueChange = {
                    username = it
                    viewModel.clearError()
                },
                label = "Username",
            )

            ShadcnInput(
                value = password,
                onValueChange = {
                    password = it
                    viewModel.clearError()
                },
                label = "Password",
                visualTransformation = PasswordVisualTransformation(),
            )

            if (uiState.error != null) {
                Text(
                    text = uiState.error ?: "",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            ShadcnPrimaryButton(
                text = if (uiState.loading) "Signing in..." else "Sign in",
                onClick = {
                    viewModel.signIn(
                        username = username.trim(),
                        password = password,
                        onSuccess = onSignInSuccess,
                    )
                },
                enabled = !uiState.loading && username.isNotBlank() && password.isNotBlank(),
            )

            if (uiState.loading) {
                CircularProgressIndicator(strokeWidth = 2.dp)
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.55f))

            ShadcnOutlineButton(
                text = "No account yet? Create one",
                onClick = onNavigateSignUp,
                enabled = !uiState.loading,
            )

            Text(
                text = "By continuing, you agree to our terms and privacy policy.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
