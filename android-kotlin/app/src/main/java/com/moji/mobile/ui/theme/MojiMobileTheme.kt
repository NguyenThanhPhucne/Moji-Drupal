package com.moji.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable

@Composable
fun MojiMobileTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) ShadcnDarkColors else ShadcnLightColors

    MaterialTheme(
        colorScheme = colors,
        typography = ShadcnTypography,
        shapes = ShadcnShapes,
        content = content,
    )
}
