package com.moji.mobile.feature.chat.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.moji.mobile.core.model.Conversation
import com.moji.mobile.core.model.Message
import com.moji.mobile.core.model.MessageReaction
import com.moji.mobile.ui.components.ShadcnInput
import com.moji.mobile.ui.components.ShadcnPrimaryButton
import com.moji.mobile.ui.components.ShadcnSectionCard
import com.moji.mobile.ui.theme.ChatReceivedBubbleDark
import com.moji.mobile.ui.theme.ChatReceivedBubbleLight
import com.moji.mobile.ui.theme.ChatSentBubbleDark
import com.moji.mobile.ui.theme.ChatSentBubbleLight
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val QUICK_REACTIONS = listOf("👍", "❤️", "😂", "😮", "😢", "👏")

private data class ReactionCluster(
    val emoji: String,
    val reactions: List<MessageReaction>,
    val reactedByMe: Boolean,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationScreen(
    conversation: Conversation,
    messages: List<Message>,
    replyingToMessage: Message?,
    currentUserId: String?,
    loading: Boolean,
    sending: Boolean,
    typingSummary: String?,
    onSendMessage: (String) -> Unit,
    onReactToMessage: (Message, String) -> Unit,
    onReplyToMessage: (Message) -> Unit,
    onCancelReply: () -> Unit,
    onDraftChanged: (String) -> Unit,
    onStopTyping: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val isDarkTheme = isSystemInDarkTheme()
    val sentBubbleColor = if (isDarkTheme) ChatSentBubbleDark else ChatSentBubbleLight
    val receivedBubbleColor = if (isDarkTheme) ChatReceivedBubbleDark else ChatReceivedBubbleLight
    val sentTextColor = MaterialTheme.colorScheme.onPrimary
    val receivedTextColor = MaterialTheme.colorScheme.onSurface

    var draft by remember(conversation.id) { mutableStateOf("") }
    var quickReactionMessageId by remember(conversation.id) { mutableStateOf<String?>(null) }
    var actionMessage by remember(conversation.id) { mutableStateOf<Message?>(null) }

    val clipboardManager = LocalClipboardManager.current
    val hapticFeedback = LocalHapticFeedback.current
    val coroutineScope = rememberCoroutineScope()
    val actionSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val messageListState = rememberLazyListState()
    val messageIndexById = remember(messages) {
        messages.mapIndexed { index, message ->
            message.id to index
        }.toMap()
    }
    val messageById = remember(messages) {
        messages.associateBy { it.id }
    }
    val memberNameById = remember(conversation.memberIds, conversation.memberNames) {
        conversation.memberIds
            .mapIndexed { index, memberId ->
                memberId to conversation.memberNames.getOrNull(index).orEmpty()
            }
            .toMap()
    }
    var focusedMessageId by remember(conversation.id) { mutableStateOf<String?>(null) }

    val latestOwnMessageId = remember(messages, currentUserId) {
        messages.lastOrNull { message ->
            currentUserId != null && message.senderId == currentUserId && !message.isDeleted
        }?.id
    }

    LaunchedEffect(actionMessage?.id) {
        if (actionMessage != null) {
            actionSheetState.show()
        }
    }

    LaunchedEffect(focusedMessageId) {
        val currentFocusedId = focusedMessageId ?: return@LaunchedEffect
        delay(1400)
        if (focusedMessageId == currentFocusedId) {
            focusedMessageId = null
        }
    }

    DisposableEffect(conversation.id) {
        onDispose {
            onStopTyping(conversation.id)
        }
    }

    fun closeActionSheet() {
        quickReactionMessageId = null
        coroutineScope.launch {
            if (actionSheetState.isVisible) {
                actionSheetState.hide()
            }
            actionMessage = null
        }
    }

    ShadcnSectionCard(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = conversation.title,
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = "${messages.size} messages",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            if (loading) {
                ConversationSkeletonList(
                    modifier = Modifier
                        .height(240.dp)
                        .fillMaxWidth(),
                )
            } else {
                LazyColumn(
                    state = messageListState,
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier
                        .height(240.dp)
                        .fillMaxWidth(),
                ) {
                    itemsIndexed(messages, key = { _, item -> item.id }) { index, message ->
                        if (shouldShowDateDivider(messages, index)) {
                            MessageDateDivider(label = formatMessageDateLabel(message.createdAt))
                        }

                        val isOwnMessage = currentUserId != null && message.senderId == currentUserId
                        val previousSenderId = if (index > 0) messages[index - 1].senderId else null
                        val nextSenderId = if (index < messages.lastIndex) messages[index + 1].senderId else null
                        val isClusterStart = previousSenderId != message.senderId
                        val isClusterEnd = nextSenderId != message.senderId
                        val bubbleShape = bubbleShapeForCluster(
                            isOwn = isOwnMessage,
                            isClusterStart = isClusterStart,
                            isClusterEnd = isClusterEnd,
                        )
                        val interactionSource = remember(message.id) { MutableInteractionSource() }
                        val isPressed by interactionSource.collectIsPressedAsState()
                        val bubbleScale by animateFloatAsState(
                            targetValue = if (isPressed) 0.985f else 1f,
                            animationSpec = tween(durationMillis = 120),
                            label = "messageBubblePress",
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = if (isOwnMessage) Arrangement.End else Arrangement.Start,
                        ) {
                            Column(
                                horizontalAlignment = if (isOwnMessage) Alignment.End else Alignment.Start,
                            ) {
                                if (!isOwnMessage && isClusterStart) {
                                    Text(
                                        text = message.senderDisplayName,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(bottom = 3.dp, start = 4.dp),
                                    )
                                }

                                val isJumpFocused = focusedMessageId == message.id
                                val bubbleModifier = if (isOwnMessage) {
                                    Modifier
                                        .widthIn(max = 280.dp)
                                        .graphicsLayer {
                                            scaleX = bubbleScale
                                            scaleY = bubbleScale
                                        }
                                        .shadow(
                                            elevation = 8.dp,
                                            shape = bubbleShape,
                                            ambientColor = sentBubbleColor.copy(alpha = 0.28f),
                                            spotColor = sentBubbleColor.copy(alpha = 0.26f),
                                        )
                                        .clip(bubbleShape)
                                        .background(
                                            Brush.linearGradient(
                                                colors = listOf(
                                                    sentBubbleColor,
                                                    sentBubbleColor.copy(alpha = 0.92f),
                                                ),
                                                start = Offset.Zero,
                                                end = Offset(260f, 180f),
                                            ),
                                        )
                                        .border(
                                            width = if (isJumpFocused) 2.dp else 0.dp,
                                            color = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.9f),
                                            shape = bubbleShape,
                                        )
                                        .pointerInput(message.id) {
                                            detectTapGestures(
                                                onLongPress = {
                                                    hapticFeedback.performHapticFeedback(
                                                        HapticFeedbackType.LongPress,
                                                    )
                                                    quickReactionMessageId = message.id
                                                    actionMessage = message
                                                },
                                            )
                                        }
                                        .clickable(
                                            interactionSource = interactionSource,
                                            indication = null,
                                            onClick = { quickReactionMessageId = null },
                                        )
                                        .padding(horizontal = 12.dp, vertical = 9.dp)
                                } else {
                                    Modifier
                                        .widthIn(max = 280.dp)
                                        .graphicsLayer {
                                            scaleX = bubbleScale
                                            scaleY = bubbleScale
                                        }
                                        .shadow(
                                            elevation = 4.dp,
                                            shape = bubbleShape,
                                            ambientColor = Color.Black.copy(alpha = if (isDarkTheme) 0.22f else 0.12f),
                                            spotColor = Color.Black.copy(alpha = if (isDarkTheme) 0.2f else 0.1f),
                                        )
                                        .clip(bubbleShape)
                                        .background(receivedBubbleColor.copy(alpha = if (isDarkTheme) 0.92f else 0.96f))
                                        .border(
                                            width = if (isJumpFocused) 2.dp else 1.dp,
                                            color = if (isJumpFocused) {
                                                MaterialTheme.colorScheme.tertiary.copy(alpha = 0.9f)
                                            } else {
                                                MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)
                                            },
                                            shape = bubbleShape,
                                        )
                                        .pointerInput(message.id) {
                                            detectTapGestures(
                                                onLongPress = {
                                                    hapticFeedback.performHapticFeedback(
                                                        HapticFeedbackType.LongPress,
                                                    )
                                                    quickReactionMessageId = message.id
                                                    actionMessage = message
                                                },
                                            )
                                        }
                                        .clickable(
                                            interactionSource = interactionSource,
                                            indication = null,
                                            onClick = { quickReactionMessageId = null },
                                        )
                                        .padding(horizontal = 12.dp, vertical = 9.dp)
                                }

                                Box(modifier = bubbleModifier) {
                                    val messageBodyText = when {
                                        message.isDeleted -> "This message was removed"
                                        message.content.isBlank() && !message.imageUrl.isNullOrBlank() -> "[Media attachment]"
                                        else -> message.content
                                    }

                                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        if (!message.isDeleted && message.replyTo != null) {
                                            val replyTarget = messageById[message.replyTo.id]
                                            val replyTargetUnavailable = replyTarget == null
                                            val replyTargetDeleted = replyTarget?.isDeleted == true
                                            val replyTargetIsMedia = replyTarget != null &&
                                                replyTarget.content.isBlank() &&
                                                !replyTarget.imageUrl.isNullOrBlank()
                                            val replyPreviewTitle = replyTarget?.senderDisplayName
                                                ?.takeIf { it.isNotBlank() }
                                                ?: message.replyTo.senderDisplayName
                                                    ?.takeIf { it.isNotBlank() }
                                                ?: "Reply"
                                            val replyPreviewContent = when {
                                                replyTargetDeleted -> "This message was removed"
                                                replyTargetIsMedia -> "Media attachment"
                                                !replyTarget?.content.isNullOrBlank() -> {
                                                    replyTarget?.content.orEmpty()
                                                }
                                                message.replyTo.content.isNotBlank() -> {
                                                    message.replyTo.content
                                                }
                                                replyTargetUnavailable -> "Original message unavailable"
                                                else -> "Original message"
                                            }

                                            MessageReplyPreviewBubble(
                                                senderDisplayName = replyPreviewTitle,
                                                content = replyPreviewContent,
                                                isOwnMessage = isOwnMessage,
                                                jumpEnabled = replyTarget != null,
                                                onClick = {
                                                    val targetMessage = replyTarget ?: return@MessageReplyPreviewBubble
                                                    val targetIndex = messageIndexById[targetMessage.id] ?: return@MessageReplyPreviewBubble
                                                    hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                                                    coroutineScope.launch {
                                                        messageListState.animateScrollToItem(targetIndex)
                                                    }
                                                    focusedMessageId = targetMessage.id
                                                },
                                            )
                                        }

                                        Text(
                                            text = messageBodyText,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = if (message.isDeleted) {
                                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.82f)
                                            } else if (isOwnMessage) {
                                                sentTextColor
                                            } else {
                                                receivedTextColor
                                            },
                                            fontStyle = if (message.isDeleted) FontStyle.Italic else FontStyle.Normal,
                                        )
                                    }
                                }

                                MessageReactionBar(
                                    message = message,
                                    currentUserId = currentUserId,
                                    memberNameById = memberNameById,
                                    onReact = { selectedEmoji ->
                                        onReactToMessage(message, selectedEmoji)
                                    },
                                )

                                AnimatedVisibility(
                                    visible = quickReactionMessageId == message.id && !message.isDeleted,
                                    enter = fadeIn(animationSpec = tween(110)) + scaleIn(
                                        initialScale = 0.84f,
                                        animationSpec = spring(
                                            dampingRatio = Spring.DampingRatioMediumBouncy,
                                            stiffness = Spring.StiffnessLow,
                                        ),
                                    ),
                                    exit = fadeOut(animationSpec = tween(90)) + scaleOut(
                                        targetScale = 0.88f,
                                        animationSpec = spring(
                                            dampingRatio = Spring.DampingRatioNoBouncy,
                                            stiffness = Spring.StiffnessMedium,
                                        ),
                                    ),
                                ) {
                                    QuickReactionStrip(
                                        onReactionSelected = { selectedEmoji ->
                                            hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                                            onReactToMessage(message, selectedEmoji)
                                            quickReactionMessageId = null
                                        },
                                        modifier = Modifier.padding(top = 4.dp),
                                    )
                                }

                                val isLatestOwnMessage = latestOwnMessageId == message.id
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(top = 4.dp, start = 4.dp, end = 4.dp),
                                ) {
                                    if (!message.isDeleted && !message.editedAt.isNullOrBlank()) {
                                        Text(
                                            text = "edited",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            fontStyle = FontStyle.Italic,
                                        )
                                    }

                                    Text(
                                        text = formatMessageTime(message.createdAt),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )

                                    if (isOwnMessage && isLatestOwnMessage && !message.isDeleted) {
                                        val seenByOthers = message.readBy.any { readerId ->
                                            readerId != currentUserId
                                        }
                                        Text(
                                            text = if (seenByOthers) "Seen" else "Delivered",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = if (seenByOthers) {
                                                MaterialTheme.colorScheme.primary
                                            } else {
                                                MaterialTheme.colorScheme.onSurfaceVariant
                                            },
                                            fontWeight = FontWeight.Medium,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (!typingSummary.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
                        .border(
                            width = 1.dp,
                            color = MaterialTheme.colorScheme.outline.copy(alpha = 0.26f),
                            shape = RoundedCornerShape(999.dp),
                        )
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                ) {
                    Text(
                        text = typingSummary,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            if (replyingToMessage != null) {
                ReplyComposerPreview(
                    message = replyingToMessage,
                    onCancel = onCancelReply,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp),
                )
            }

            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(18.dp))
                    .background(
                        MaterialTheme.colorScheme.surfaceVariant.copy(
                            alpha = if (isDarkTheme) 0.32f else 0.44f,
                        ),
                    )
                    .border(
                        width = 1.dp,
                        color = MaterialTheme.colorScheme.outline.copy(alpha = 0.28f),
                        shape = RoundedCornerShape(18.dp),
                    )
                    .padding(horizontal = 10.dp, vertical = 10.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    ShadcnInput(
                        value = draft,
                        onValueChange = {
                            draft = it
                            onDraftChanged(it)
                        },
                        label = "Message",
                        modifier = Modifier.weight(1f),
                    )
                    ShadcnPrimaryButton(
                        text = "Send",
                        onClick = {
                            val message = draft.trim()
                            if (message.isNotBlank()) {
                                onSendMessage(message)
                                draft = ""
                                onDraftChanged("")
                            }
                        },
                        enabled = !sending && draft.isNotBlank(),
                        modifier = Modifier.weight(0.36f),
                    )
                }
            }
        }
    }

    actionMessage?.let { selectedMessage ->
        MessageActionsSheet(
            message = selectedMessage,
            sheetState = actionSheetState,
            onReact = { selectedEmoji ->
                hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                onReactToMessage(selectedMessage, selectedEmoji)
                closeActionSheet()
            },
            onReply = {
                if (!selectedMessage.isDeleted) {
                    onReplyToMessage(selectedMessage)
                }
                closeActionSheet()
            },
            onCopy = {
                if (!selectedMessage.isDeleted && selectedMessage.content.isNotBlank()) {
                    clipboardManager.setText(AnnotatedString(selectedMessage.content))
                }
                closeActionSheet()
            },
            onDismiss = {
                quickReactionMessageId = null
                actionMessage = null
            },
        )
    }
}

@Composable
private fun MessageReplyPreviewBubble(
    senderDisplayName: String,
    content: String,
    isOwnMessage: Boolean,
    jumpEnabled: Boolean,
    onClick: () -> Unit,
) {
    val containerColor = if (isOwnMessage) {
        MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.16f)
    } else {
        MaterialTheme.colorScheme.surface.copy(alpha = 0.82f)
    }
    val textColor = if (isOwnMessage) {
        MaterialTheme.colorScheme.onPrimary
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(containerColor)
            .border(
                width = 1.dp,
                color = if (isOwnMessage) {
                    MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.2f)
                } else {
                    MaterialTheme.colorScheme.outline.copy(alpha = 0.24f)
                },
                shape = RoundedCornerShape(10.dp),
            )
            .clickable(enabled = jumpEnabled, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = senderDisplayName,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = textColor,
            )
            Text(
                text = content,
                style = MaterialTheme.typography.bodySmall,
                color = textColor.copy(alpha = 0.86f),
                maxLines = 2,
            )
            if (jumpEnabled) {
                Text(
                    text = "Tap to view",
                    style = MaterialTheme.typography.labelSmall,
                    color = textColor.copy(alpha = 0.72f),
                    fontStyle = FontStyle.Italic,
                )
            }
        }
    }
}

@Composable
private fun MessageReactionBar(
    message: Message,
    currentUserId: String?,
    memberNameById: Map<String, String>,
    onReact: (String) -> Unit,
) {
    val groupedReactions = remember(message.reactions, currentUserId) {
        message.reactions
            .groupBy { it.emoji.trim() }
            .filterKeys { it.isNotBlank() }
            .map { (emoji, reactions) ->
                val uniqueReactions = reactions.distinctBy { it.userId }
                ReactionCluster(
                    emoji = emoji,
                    reactions = uniqueReactions,
                    reactedByMe = currentUserId != null &&
                        uniqueReactions.any { it.userId == currentUserId },
                )
            }
            .sortedWith(
                compareByDescending<ReactionCluster> { it.reactions.size }
                    .thenByDescending { if (it.reactedByMe) 1 else 0 }
                    .thenBy { it.emoji },
            )
    }

    if (groupedReactions.isEmpty() || message.isDeleted) {
        return
    }

    Row(
        modifier = Modifier.padding(top = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        groupedReactions.forEach { cluster ->
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(
                        if (cluster.reactedByMe) {
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.22f)
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.44f)
                        },
                    )
                    .border(
                        width = 1.dp,
                        color = if (cluster.reactedByMe) {
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.68f)
                        } else {
                            MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)
                        },
                        shape = RoundedCornerShape(999.dp),
                    )
                    .clickable { onReact(cluster.emoji) }
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(text = cluster.emoji, style = MaterialTheme.typography.labelSmall)
                    ReactionUserStack(
                        userIds = cluster.reactions.map { it.userId },
                        currentUserId = currentUserId,
                        memberNameById = memberNameById,
                    )
                    Text(
                        text = cluster.reactions.size.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (cluster.reactedByMe) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        fontWeight = if (cluster.reactedByMe) {
                            FontWeight.SemiBold
                        } else {
                            FontWeight.Medium
                        },
                    )
                    if (cluster.reactedByMe) {
                        Text(
                            text = "you",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                            fontStyle = FontStyle.Italic,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ReactionUserStack(
    userIds: List<String>,
    currentUserId: String?,
    memberNameById: Map<String, String>,
) {
    val uniqueUserIds = remember(userIds) {
        userIds.filter { it.isNotBlank() }.distinct()
    }
    if (uniqueUserIds.isEmpty()) {
        return
    }

    val visibleUserIds = uniqueUserIds.take(3)
    val extraCount = uniqueUserIds.size - visibleUserIds.size

    Row(
        horizontalArrangement = Arrangement.spacedBy((-6).dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        visibleUserIds.forEach { userId ->
            val displayName = memberNameById[userId]
                ?.trim()
                ?.takeIf { it.isNotBlank() }
                ?: userId
            val initial = displayName.take(1).ifBlank { "?" }.uppercase()
            val isCurrentUser = currentUserId != null && userId == currentUserId

            Box(
                modifier = Modifier
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(
                        if (isCurrentUser) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.surface
                        },
                    )
                    .border(
                        width = 1.dp,
                        color = if (isCurrentUser) {
                            MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.9f)
                        } else {
                            MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)
                        },
                        shape = CircleShape,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = initial,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isCurrentUser) {
                        MaterialTheme.colorScheme.onPrimary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        if (extraCount > 0) {
            Text(
                text = "+$extraCount",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun QuickReactionStrip(
    onReactionSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.95f))
            .border(
                width = 1.dp,
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.22f),
                shape = RoundedCornerShape(999.dp),
            )
            .padding(horizontal = 6.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        QUICK_REACTIONS.forEach { emoji ->
            val interactionSource = remember(emoji) { MutableInteractionSource() }
            val isPressed by interactionSource.collectIsPressedAsState()
            val reactionScale by animateFloatAsState(
                targetValue = if (isPressed) 0.86f else 1f,
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessMediumLow,
                ),
                label = "quickReactionScale",
            )

            Box(
                modifier = Modifier
                    .size(32.dp)
                    .graphicsLayer {
                        scaleX = reactionScale
                        scaleY = reactionScale
                    }
                    .clip(RoundedCornerShape(999.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f))
                    .clickable(
                        interactionSource = interactionSource,
                        indication = null,
                    ) { onReactionSelected(emoji) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = emoji,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MessageActionsSheet(
    message: Message,
    sheetState: SheetState,
    onReact: (String) -> Unit,
    onReply: () -> Unit,
    onCopy: () -> Unit,
    onDismiss: () -> Unit,
) {
    var contentVisible by remember(message.id) { mutableStateOf(false) }

    LaunchedEffect(message.id) {
        contentVisible = true
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = 6.dp,
    ) {
        AnimatedVisibility(
            visible = contentVisible,
            enter = fadeIn(animationSpec = tween(130)) + scaleIn(
                initialScale = 0.95f,
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioNoBouncy,
                    stiffness = Spring.StiffnessMediumLow,
                ),
            ),
            exit = fadeOut(animationSpec = tween(90)) + scaleOut(
                targetScale = 0.98f,
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioNoBouncy,
                    stiffness = Spring.StiffnessMedium,
                ),
            ),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                QuickReactionStrip(
                    onReactionSelected = onReact,
                    modifier = Modifier.fillMaxWidth(),
                )

                if (!message.isDeleted) {
                    Text(
                        text = message.content.ifBlank { "Media attachment" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 3,
                        modifier = Modifier.padding(horizontal = 4.dp),
                    )
                }

                ActionSheetButton(
                    label = "Reply",
                    enabled = !message.isDeleted,
                    onClick = onReply,
                )

                ActionSheetButton(
                    label = "Copy",
                    enabled = !message.isDeleted && message.content.isNotBlank(),
                    onClick = onCopy,
                )

                ActionSheetButton(
                    label = "Close",
                    enabled = true,
                    onClick = onDismiss,
                )

                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun ActionSheetButton(
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.36f))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = if (enabled) {
                MaterialTheme.colorScheme.onSurface
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f)
            },
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun MessageDateDivider(label: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.52f))
                .border(
                    width = 1.dp,
                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.24f),
                    shape = RoundedCornerShape(999.dp),
                )
                .padding(horizontal = 10.dp, vertical = 4.dp),
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ReplyComposerPreview(
    message: Message,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.46f))
            .border(
                width = 1.dp,
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.26f),
                shape = RoundedCornerShape(14.dp),
            )
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Replying to ${message.senderDisplayName}",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = when {
                        message.isDeleted -> "This message was removed"
                        message.content.isBlank() -> "Media attachment"
                        else -> message.content
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                )
            }

            TextButton(onClick = onCancel) {
                Text("Cancel")
            }
        }
    }
}

@Composable
private fun ConversationSkeletonList(modifier: Modifier = Modifier) {
    val shimmerTransition = rememberInfiniteTransition(label = "conversationShimmer")
    val translateX by shimmerTransition.animateFloat(
        initialValue = -320f,
        targetValue = 920f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1300, easing = LinearEasing),
        ),
        label = "conversationShimmerTranslate",
    )

    val shimmerBrush = Brush.linearGradient(
        colors = listOf(
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
            MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
        ),
        start = Offset(translateX, 0f),
        end = Offset(translateX + 260f, 220f),
    )

    LazyColumn(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(8) { index ->
            val own = index % 3 != 0
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = if (own) Arrangement.End else Arrangement.Start,
            ) {
                Box(
                    modifier = Modifier
                        .widthIn(max = if (own) 250.dp else 230.dp)
                        .fillMaxWidth(if (own) 0.58f else 0.65f)
                        .clip(RoundedCornerShape(18.dp))
                        .background(shimmerBrush)
                        .height(if (index % 2 == 0) 48.dp else 66.dp),
                )
            }
        }
    }
}

private fun bubbleShapeForCluster(
    isOwn: Boolean,
    isClusterStart: Boolean,
    isClusterEnd: Boolean,
): RoundedCornerShape {
    val rounded = 18.dp
    val joined = 6.dp

    return if (isOwn) {
        RoundedCornerShape(
            topStart = rounded,
            topEnd = if (isClusterStart) rounded else joined,
            bottomStart = rounded,
            bottomEnd = if (isClusterEnd) rounded else joined,
        )
    } else {
        RoundedCornerShape(
            topStart = if (isClusterStart) rounded else joined,
            topEnd = rounded,
            bottomStart = if (isClusterEnd) rounded else joined,
            bottomEnd = rounded,
        )
    }
}

private fun formatMessageTime(raw: String): String {
    val instant = parseMessageInstant(raw) ?: return "Now"
    val formatter = DateTimeFormatter.ofPattern("HH:mm")
    return instant
        .atZone(ZoneId.systemDefault())
        .toLocalTime()
        .format(formatter)
}

private fun shouldShowDateDivider(messages: List<Message>, index: Int): Boolean {
    if (index == 0) {
        return true
    }

    val previousDate = parseMessageInstant(messages[index - 1].createdAt)
        ?.atZone(ZoneId.systemDefault())
        ?.toLocalDate()
    val currentDate = parseMessageInstant(messages[index].createdAt)
        ?.atZone(ZoneId.systemDefault())
        ?.toLocalDate()

    return previousDate != currentDate
}

private fun formatMessageDateLabel(raw: String): String {
    val zoneId = ZoneId.systemDefault()
    val date = parseMessageInstant(raw)
        ?.atZone(zoneId)
        ?.toLocalDate()
        ?: return "Recent"

    val today = LocalDate.now(zoneId)

    return when (date) {
        today -> "Today"
        today.minusDays(1) -> "Yesterday"
        else -> date.format(DateTimeFormatter.ofPattern("MMM d, yyyy"))
    }
}

private fun parseMessageInstant(raw: String): Instant? {
    val value = raw.trim()
    if (value.isBlank()) {
        return null
    }

    return runCatching { Instant.parse(value) }.getOrNull()
        ?: runCatching { OffsetDateTime.parse(value).toInstant() }.getOrNull()
        ?: runCatching {
            LocalDateTime
                .parse(value.replace(' ', 'T'))
                .atZone(ZoneId.systemDefault())
                .toInstant()
        }.getOrNull()
        ?: runCatching {
            Instant.ofEpochMilli(value.toLong())
        }.getOrNull()
}
