package com.moji.mobile.feature.notification.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.PersonAddAlt1
import androidx.compose.material.icons.rounded.PeopleAlt
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.moji.mobile.core.model.SocialNotificationItem
import com.moji.mobile.ui.components.ShadcnOutlineButton
import com.moji.mobile.ui.components.ShadcnSectionCard
import java.time.Duration
import java.time.Instant

private enum class NotificationBodyState {
    Loading,
    Empty,
    Content,
}

@Composable
fun NotificationCenterScreen(
    modifier: Modifier = Modifier,
    viewModel: NotificationCenterViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val showLoadingSkeleton = uiState.loading && uiState.notifications.isEmpty()
    val bodyState = when {
        showLoadingSkeleton -> NotificationBodyState.Loading
        !uiState.loading && uiState.notifications.isEmpty() -> NotificationBodyState.Empty
        else -> NotificationBodyState.Content
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 2.dp),
    ) {
        ShadcnSectionCard(
            modifier = Modifier.fillMaxWidth(),
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Notification Center",
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    text = "Detailed social events and realtime updates",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ShadcnOutlineButton(
                        text = if (uiState.refreshing) "Refreshing..." else "Refresh",
                        onClick = viewModel::refresh,
                        enabled = !uiState.refreshing && !uiState.markingAll,
                        modifier = Modifier.weight(1f),
                    )
                    ShadcnOutlineButton(
                        text = if (uiState.markingAll) "Updating..." else "Mark all read",
                        onClick = viewModel::markAllRead,
                        enabled = uiState.unreadCount > 0 && !uiState.refreshing && !uiState.markingAll,
                        modifier = Modifier.weight(1f),
                    )
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(
                                if (uiState.unreadCount > 0) {
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                                },
                            )
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                    ) {
                        Text(
                            text = "${uiState.unreadCount} unread",
                            style = MaterialTheme.typography.labelMedium,
                            color = if (uiState.unreadCount > 0) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            fontWeight = FontWeight.SemiBold,
                        )
                    }

                    if (uiState.loading) {
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f))
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                        ) {
                            Text(
                                text = "Syncing...",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        if (uiState.error != null) {
            Text(
                text = uiState.error ?: "",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        Crossfade(
            targetState = bodyState,
            modifier = Modifier.fillMaxSize(),
            label = "notificationBodyCrossfade",
        ) { state ->
            when (state) {
                NotificationBodyState.Loading -> {
                    NotificationSkeletonList(modifier = Modifier.fillMaxSize())
                }

                NotificationBodyState.Empty -> {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.Top,
                    ) {
                        NotificationEmptyState(modifier = Modifier.fillMaxWidth())
                    }
                }

                NotificationBodyState.Content -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(uiState.notifications, key = { it.id }) { notification ->
                            NotificationCard(
                                notification = notification,
                                onMarkRead = viewModel::markNotificationRead,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationCard(
    notification: SocialNotificationItem,
    onMarkRead: (String) -> Unit,
) {
    val isUnread = !notification.isRead
    val typeAppearance = notificationTypeAppearance(notification.type)
    val interactionSource = remember(notification.id) { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val cardScale by animateFloatAsState(
        targetValue = if (isPressed) 0.992f else 1f,
        animationSpec = tween(durationMillis = 120),
        label = "notificationCardPress",
    )

    ShadcnSectionCard(
        modifier = Modifier
            .fillMaxWidth()
            .graphicsLayer {
                scaleX = cardScale
                scaleY = cardScale
            }
            .clickable(
                interactionSource = interactionSource,
                indication = null,
            ) {
                if (isUnread) {
                    onMarkRead(notification.id)
                }
            },
        containerColor = if (isUnread) {
            MaterialTheme.colorScheme.primary.copy(alpha = 0.08f)
        } else {
            MaterialTheme.colorScheme.surface
        },
        borderColor = if (isUnread) {
            MaterialTheme.colorScheme.primary.copy(alpha = 0.38f)
        } else {
            MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)
        },
        elevation = if (isUnread) 3.dp else 1.dp,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .size(26.dp)
                            .clip(CircleShape)
                            .background(typeAppearance.bgColor),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = typeAppearance.icon,
                            contentDescription = null,
                            tint = typeAppearance.iconColor,
                            modifier = Modifier.size(14.dp),
                        )
                    }

                    if (isUnread) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primary),
                        )
                    }
                    Text(
                        text = notification.actorDisplayName ?: "Someone",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                TypePill(
                    text = typeAppearance.label,
                    icon = typeAppearance.icon,
                    iconTint = typeAppearance.iconColor,
                )
            }

            Text(
                text = notification.message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = formatNotificationTime(notification.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                if (isUnread) {
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f))
                            .clickable { onMarkRead(notification.id) }
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                    ) {
                        Text(
                            text = "Mark read",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationEmptyState(modifier: Modifier = Modifier) {
    ShadcnSectionCard(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
        borderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.64f),
        elevation = 2.dp,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f))
                    .border(
                        width = 1.dp,
                        color = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f),
                        shape = CircleShape,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Notifications,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp),
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = "No notifications yet",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "Social and friend updates will appear here in realtime.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun NotificationSkeletonList(modifier: Modifier = Modifier) {
    val shimmerTransition = rememberInfiniteTransition(label = "notificationShimmer")
    val translateX by shimmerTransition.animateFloat(
        initialValue = -260f,
        targetValue = 900f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1250, easing = LinearEasing),
        ),
        label = "notificationShimmerTranslate",
    )

    val shimmerBrush = Brush.linearGradient(
        colors = listOf(
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.58f),
            MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.58f),
        ),
        start = Offset(translateX, 0f),
        end = Offset(translateX + 250f, 220f),
    )

    LazyColumn(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(7) { index ->
            ShadcnSectionCard(
                modifier = Modifier.fillMaxWidth(),
                containerColor = MaterialTheme.colorScheme.surface,
                borderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f),
                elevation = 1.dp,
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(26.dp)
                                    .clip(CircleShape)
                                    .background(shimmerBrush),
                            )
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(0.38f)
                                    .height(12.dp)
                                    .clip(MaterialTheme.shapes.small)
                                    .background(shimmerBrush),
                            )
                        }
                        Box(
                            modifier = Modifier
                                .size(width = 62.dp, height = 18.dp)
                                .clip(CircleShape)
                                .background(shimmerBrush),
                        )
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth(if (index % 2 == 0) 0.86f else 0.72f)
                            .height(12.dp)
                            .clip(MaterialTheme.shapes.small)
                            .background(shimmerBrush),
                    )

                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.32f)
                            .height(10.dp)
                            .clip(MaterialTheme.shapes.small)
                            .background(shimmerBrush),
                    )
                }
            }
        }
    }
}

@Composable
private fun TypePill(
    text: String,
    icon: ImageVector,
    iconTint: Color,
) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(12.dp),
            )
            Text(
                text = text,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

private data class NotificationTypeAppearance(
    val label: String,
    val icon: ImageVector,
    val bgColor: Color,
    val iconColor: Color,
)

@Composable
private fun notificationTypeAppearance(rawType: String): NotificationTypeAppearance {
    val normalized = rawType.trim().lowercase()
    return when {
        normalized.contains("friend") && normalized.contains("accept") -> NotificationTypeAppearance(
            label = "Friend accepted",
            icon = Icons.Rounded.PeopleAlt,
            bgColor = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.16f),
            iconColor = MaterialTheme.colorScheme.tertiary,
        )
        normalized.contains("friend") || normalized.contains("follow") -> NotificationTypeAppearance(
            label = "Friend request",
            icon = Icons.Rounded.PersonAddAlt1,
            bgColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
            iconColor = MaterialTheme.colorScheme.primary,
        )
        normalized.contains("comment") -> NotificationTypeAppearance(
            label = "Comment",
            icon = Icons.Rounded.ChatBubbleOutline,
            bgColor = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.16f),
            iconColor = MaterialTheme.colorScheme.tertiary,
        )
        normalized.contains("like") -> NotificationTypeAppearance(
            label = "Like",
            icon = Icons.Rounded.FavoriteBorder,
            bgColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
            iconColor = MaterialTheme.colorScheme.primary,
        )
        else -> NotificationTypeAppearance(
            label = formatNotificationType(rawType),
            icon = Icons.Rounded.Notifications,
            bgColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f),
            iconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun formatNotificationType(rawType: String): String {
    val normalized = rawType
        .trim()
        .ifBlank { "social" }
        .replace("_", " ")
    return normalized.replaceFirstChar { char ->
        if (char.isLowerCase()) {
            char.titlecase()
        } else {
            char.toString()
        }
    }
}

private fun formatNotificationTime(rawTime: String): String {
    val trimmed = rawTime.trim()
    if (trimmed.isBlank()) {
        return "Just now"
    }

    val parsedInstant = runCatching { Instant.parse(trimmed) }.getOrNull()
    if (parsedInstant != null) {
        val minutesAgo = Duration.between(parsedInstant, Instant.now()).toMinutes().coerceAtLeast(0)
        return when {
            minutesAgo < 1 -> "Just now"
            minutesAgo < 60 -> "${minutesAgo}m ago"
            minutesAgo < 1440 -> "${minutesAgo / 60}h ago"
            else -> "${minutesAgo / 1440}d ago"
        }
    }

    return trimmed
        .replace('T', ' ')
        .replace("Z", "")
        .take(16)
}
