package com.moji.mobile.ui.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

private val Sky600 = Color(0xFF1E88E5)
private val Sky500 = Color(0xFF2196F3)
private val Sky300 = Color(0xFF76BDF8)
private val Teal500 = Color(0xFF14B8A6)

private val Slate950 = Color(0xFF111827)
private val Slate900 = Color(0xFF1F2937)
private val Slate800 = Color(0xFF263245)
private val Slate700 = Color(0xFF334155)
private val Slate600 = Color(0xFF5B6B82)

private val BlueGray100 = Color(0xFFEAF1FB)
private val BlueGray50 = Color(0xFFF5F9FF)
private val White = Color(0xFFFFFFFF)

val ChatSentBubbleLight = Sky500
val ChatSentBubbleDark = Color(0xFF52AFFF)
val ChatReceivedBubbleLight = BlueGray100
val ChatReceivedBubbleDark = Slate700

val ShadcnLightColors = lightColorScheme(
    primary = Sky500,
    onPrimary = White,
    secondary = Sky300,
    onSecondary = Slate900,
    tertiary = Teal500,
    onTertiary = White,
    background = BlueGray50,
    onBackground = Slate950,
    surface = White,
    onSurface = Slate900,
    surfaceVariant = BlueGray100,
    onSurfaceVariant = Slate600,
    outline = Color(0xFFC9D8EE),
)

val ShadcnDarkColors = darkColorScheme(
    primary = ChatSentBubbleDark,
    onPrimary = Slate950,
    secondary = Sky300,
    onSecondary = Slate950,
    tertiary = Color(0xFF2DD4BF),
    onTertiary = Slate950,
    background = Slate950,
    onBackground = White,
    surface = Slate900,
    onSurface = White,
    surfaceVariant = Slate800,
    onSurfaceVariant = Color(0xFFB8C4D9),
    outline = Color(0xFF3A4A62),
    outlineVariant = Color(0xFF2B384C),
)
