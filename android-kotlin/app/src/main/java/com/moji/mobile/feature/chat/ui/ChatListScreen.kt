package com.moji.mobile.feature.chat.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.moji.mobile.ui.components.ShadcnSectionCard

private enum class ChatListBodyState {
    Loading,
    Empty,
    Content,
}

@Composable
fun ChatListScreen(
    modifier: Modifier = Modifier,
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val selectedConversationId = uiState.selectedConversation?.id
    val currentUserId = uiState.currentUserId
    val showConversationSkeleton =
        uiState.loadingConversations && uiState.conversations.isEmpty()
    val bodyState = when {
        showConversationSkeleton -> ChatListBodyState.Loading
        !uiState.loadingConversations && uiState.conversations.isEmpty() -> ChatListBodyState.Empty
        else -> ChatListBodyState.Content
    }
    val unreadCount = uiState.conversations.count { conversation ->
        currentUserId != null &&
            !conversation.lastMessage.isNullOrBlank() &&
            !conversation.seenByIds.contains(currentUserId)
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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = "Chats",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(
                        text = "Realtime messages synchronized with Socket.IO",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (uiState.loadingConversations) {
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f))
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                    ) {
                        Text(
                            text = "Syncing...",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                } else if (unreadCount > 0) {
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary)
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                    ) {
                        Text(
                            text = if (unreadCount > 99) "99+ new" else "$unreadCount new",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        Crossfade(
            targetState = bodyState,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            label = "chatListBodyCrossfade",
        ) { state ->
            when (state) {
                ChatListBodyState.Loading -> {
                    ChatListSkeleton(modifier = Modifier.fillMaxSize())
                }

                ChatListBodyState.Empty -> {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.Top,
                    ) {
                        ChatListEmptyState(modifier = Modifier.fillMaxWidth())
                    }
                }

                ChatListBodyState.Content -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(uiState.conversations, key = { it.id }) { conversation ->
                            val isSelected = conversation.id == selectedConversationId
                            val isUnread =
                                currentUserId != null &&
                                    !conversation.lastMessage.isNullOrBlank() &&
                                    !conversation.seenByIds.contains(currentUserId)
                            val interactionSource = remember(conversation.id) { MutableInteractionSource() }
                            val isPressed by interactionSource.collectIsPressedAsState()
                            val cardScale by animateFloatAsState(
                                targetValue = if (isPressed) 0.992f else 1f,
                                animationSpec = tween(durationMillis = 120),
                                label = "chatListCardPress",
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
                                        viewModel.selectConversation(conversation)
                                    },
                                containerColor = if (isSelected) {
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                                } else {
                                    MaterialTheme.colorScheme.surface
                                },
                                borderColor = if (isSelected || isUnread) {
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.45f)
                                } else {
                                    MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)
                                },
                                elevation = if (isSelected) 4.dp else 1.dp,
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(38.dp)
                                            .clip(CircleShape)
                                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.16f)),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text(
                                            text = conversation.title.trim().take(1).ifBlank { "#" },
                                            style = MaterialTheme.typography.titleSmall,
                                            color = MaterialTheme.colorScheme.primary,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                    }

                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = conversation.title,
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = if (isUnread) FontWeight.SemiBold else FontWeight.Medium,
                                        )
                                        Spacer(modifier = Modifier.height(2.dp))
                                        Text(
                                            text = conversation.lastMessage?.takeIf { it.isNotBlank() }
                                                ?: "No messages yet",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 2,
                                        )
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Text(
                                            text = formatConversationTime(conversation.updatedAt),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }

                                    if (isUnread) {
                                        Box(
                                            modifier = Modifier
                                                .size(10.dp)
                                                .clip(CircleShape)
                                                .background(MaterialTheme.colorScheme.primary),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        uiState.selectedConversation?.let { selected ->
            Spacer(modifier = Modifier.height(10.dp))
            ConversationScreen(
                conversation = selected,
                messages = uiState.messages,
                replyingToMessage = uiState.replyingToMessage,
                currentUserId = uiState.currentUserId,
                loading = uiState.loadingMessages,
                sending = uiState.sendingMessage,
                typingSummary = uiState.typingSummary,
                onSendMessage = viewModel::sendMessage,
                onReactToMessage = viewModel::reactToMessage,
                onReplyToMessage = viewModel::setReplyTarget,
                onCancelReply = viewModel::clearReplyTarget,
                onDraftChanged = viewModel::onMessageDraftChanged,
                onStopTyping = viewModel::stopTypingForConversation,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        if (uiState.error != null) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = uiState.error ?: "",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun ChatListEmptyState(modifier: Modifier = Modifier) {
    ShadcnSectionCard(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
        borderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.65f),
        elevation = 2.dp,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f))
                        .border(
                            width = 1.dp,
                            color = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f),
                            shape = CircleShape,
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "#",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = "No conversations yet",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Start a direct chat or create a group from the web app.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun ChatListSkeleton(modifier: Modifier = Modifier) {
    val shimmerTransition = rememberInfiniteTransition(label = "chatListShimmer")
    val translateX by shimmerTransition.animateFloat(
        initialValue = -260f,
        targetValue = 860f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
        ),
        label = "chatListShimmerTranslate",
    )

    val shimmerBrush = Brush.linearGradient(
        colors = listOf(
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.56f),
            MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.56f),
        ),
        start = Offset(translateX, 0f),
        end = Offset(translateX + 240f, 220f),
    )

    LazyColumn(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(7) { index ->
            ShadcnSectionCard(
                modifier = Modifier.fillMaxWidth(),
                containerColor = MaterialTheme.colorScheme.surface,
                borderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f),
                elevation = 1.dp,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(shimmerBrush),
                    )

                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.46f)
                                .height(14.dp)
                                .clip(MaterialTheme.shapes.small)
                                .background(shimmerBrush),
                        )
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(if (index % 2 == 0) 0.78f else 0.62f)
                                .height(12.dp)
                                .clip(MaterialTheme.shapes.small)
                                .background(shimmerBrush),
                        )
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.28f)
                                .height(10.dp)
                                .clip(MaterialTheme.shapes.small)
                                .background(shimmerBrush),
                        )
                    }

                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(shimmerBrush),
                    )
                }
            }
        }
    }
}

private fun formatConversationTime(raw: String?): String {
    val value = raw?.trim().orEmpty()
    if (value.isBlank()) {
        return "Just now"
    }

    return value
        .replace('T', ' ')
        .replace("Z", "")
        .take(16)
}
