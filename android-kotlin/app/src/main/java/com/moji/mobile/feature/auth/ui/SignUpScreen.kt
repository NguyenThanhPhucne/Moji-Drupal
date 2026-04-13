package com.moji.mobile.feature.auth.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
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
import com.moji.mobile.ui.components.ShadcnOutlineButton
import com.moji.mobile.ui.components.ShadcnPrimaryButton

@Composable
fun SignUpScreen(
    onNavigateSignIn: () -> Unit,
    onSignUpSuccess: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }

    AuthSceneLayout(
        heroTag = "Professional Chat",
        heroTitle = "Build your workspace in minutes and keep everything in one inbox.",
        heroSubtitle = "Fast onboarding with the same backend flow as your web app.",
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                text = "Create account",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Use the same backend auth flow as the web app.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(modifier = Modifier.height(2.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ShadcnInput(
                    value = lastName,
                    onValueChange = {
                        lastName = it
                        viewModel.clearError()
                    },
                    label = "Last name",
                    modifier = Modifier.weight(1f),
                )

                ShadcnInput(
                    value = firstName,
                    onValueChange = {
                        firstName = it
                        viewModel.clearError()
                    },
                    label = "First name",
                    modifier = Modifier.weight(1f),
                )
            }

            ShadcnInput(
                value = username,
                onValueChange = {
                    username = it
                    viewModel.clearError()
                },
                label = "Username",
            )

            ShadcnInput(
                value = email,
                onValueChange = {
                    email = it
                    viewModel.clearError()
                },
                label = "Email",
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
                text = if (uiState.loading) "Creating account..." else "Create account",
                onClick = {
                    viewModel.signUp(
                        username = username.trim(),
                        password = password,
                        email = email.trim(),
                        firstName = firstName.trim(),
                        lastName = lastName.trim(),
                        onSuccess = onSignUpSuccess,
                    )
                },
                enabled =
                    !uiState.loading &&
                        username.isNotBlank() &&
                        email.isNotBlank() &&
                        firstName.isNotBlank() &&
                        lastName.isNotBlank() &&
                        password.isNotBlank(),
            )

            if (uiState.loading) {
                CircularProgressIndicator(strokeWidth = 2.dp)
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.55f))

            ShadcnOutlineButton(
                text = "Already have an account? Sign in",
                onClick = onNavigateSignIn,
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
