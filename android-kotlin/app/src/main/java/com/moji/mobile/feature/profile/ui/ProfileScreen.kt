package com.moji.mobile.feature.profile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.moji.mobile.core.model.User
import com.moji.mobile.ui.components.ShadcnOutlineButton
import com.moji.mobile.ui.components.ShadcnSectionCard
import androidx.compose.foundation.verticalScroll

@Composable
fun ProfileScreen(
    user: User?,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val displayName = user?.displayName?.ifBlank { user.username } ?: "Unknown"
    val username = user?.username?.ifBlank { "-" } ?: "-"
    val email = user?.email?.ifBlank { "No email" } ?: "No email"
    val phone = user?.phone?.ifBlank { "Not set" } ?: "Not set"
    val bio = user?.bio?.ifBlank { "No bio yet" } ?: "No bio yet"

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ShadcnSectionCard(
            modifier = Modifier.fillMaxWidth(),
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
            borderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.7f),
            elevation = 4.dp,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(198.dp)
                        .clip(MaterialTheme.shapes.large)
                        .background(
                            Brush.linearGradient(
                                colors = listOf(
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.84f),
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.72f),
                                    MaterialTheme.colorScheme.tertiary.copy(alpha = 0.72f),
                                ),
                            ),
                        ),
                ) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(top = 16.dp, end = 16.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.18f))
                            .padding(20.dp),
                    )

                    Box(
                        modifier = Modifier
                            .align(Alignment.CenterStart)
                            .padding(start = 28.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.14f))
                            .padding(26.dp),
                    )

                    Row(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(horizontal = 14.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.Bottom,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(74.dp)
                                .clip(CircleShape)
                                .border(
                                    width = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.9f),
                                    shape = CircleShape,
                                )
                                .background(MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.16f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (!user?.avatarUrl.isNullOrBlank()) {
                                AsyncImage(
                                    model = user?.avatarUrl,
                                    contentDescription = "Profile avatar",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .clip(CircleShape),
                                )
                            } else {
                                Text(
                                    text = displayName.take(1).ifBlank { "?" },
                                    style = MaterialTheme.typography.titleLarge,
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }

                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Text(
                                text = displayName,
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onPrimary,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = "@$username",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.9f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }

                        ProfileMetaPill(
                            text = if (user?.showOnlineStatus == true) "Status visible" else "Status hidden",
                            highlighted = user?.showOnlineStatus == true,
                        )
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ProfileMetaPill(text = "Your profile", highlighted = true)
                    ProfileMetaPill(text = "${if (user?.showOnlineStatus == true) "Realtime" else "Private"} mode")
                }
            }
        }

        ShadcnSectionCard(
            modifier = Modifier.fillMaxWidth(),
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.93f),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Account overview",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "Manage your account, notifications, and realtime behavior.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ProfileInfoPill(
                        label = "Username",
                        value = "@$username",
                        modifier = Modifier.weight(1f),
                    )
                    ProfileInfoPill(
                        label = "Phone",
                        value = phone,
                        modifier = Modifier.weight(1f),
                    )
                }

                ProfileInfoPill(
                    label = "Email",
                    value = email,
                    modifier = Modifier.fillMaxWidth(),
                )

                ProfileInfoPill(
                    label = "Bio",
                    value = bio,
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3,
                )
            }
        }

        NotificationPreferencesSection(modifier = Modifier.fillMaxWidth())

        ShadcnOutlineButton(
            text = "Sign out",
            onClick = onSignOut,
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(modifier = Modifier.height(10.dp))
    }
}

@Composable
private fun ProfileMetaPill(
    text: String,
    highlighted: Boolean = false,
) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(
                if (highlighted) {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
                } else {
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f)
                },
            )
            .border(
                width = 1.dp,
                color = if (highlighted) {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
                } else {
                    MaterialTheme.colorScheme.outline.copy(alpha = 0.45f)
                },
                shape = CircleShape,
            )
            .padding(horizontal = 10.dp, vertical = 5.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = if (highlighted) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun ProfileInfoPill(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    maxLines: Int = 1,
) {
    Column(
        modifier = modifier
            .clip(MaterialTheme.shapes.medium)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
            .border(
                width = 1.dp,
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f),
                shape = MaterialTheme.shapes.medium,
            )
            .padding(horizontal = 10.dp, vertical = 9.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Medium,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
