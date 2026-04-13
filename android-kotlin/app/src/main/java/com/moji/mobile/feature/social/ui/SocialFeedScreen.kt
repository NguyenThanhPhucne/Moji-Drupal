package com.moji.mobile.feature.social.ui

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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.moji.mobile.ui.components.ShadcnOutlineButton
import com.moji.mobile.ui.components.ShadcnSectionCard

private enum class SocialFeedBodyState {
    Loading,
    Empty,
    Content,
}

@Composable
fun SocialFeedScreen(
    modifier: Modifier = Modifier,
    viewModel: SocialViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val showFeedSkeleton = uiState.loading && uiState.posts.isEmpty()
    val bodyState = when {
        showFeedSkeleton -> SocialFeedBodyState.Loading
        !uiState.loading && uiState.posts.isEmpty() -> SocialFeedBodyState.Empty
        else -> SocialFeedBodyState.Content
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
                    text = "Social feed",
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    text = "Live post updates and social notifications",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ShadcnOutlineButton(
                        text = if (uiState.loading) "Refreshing..." else "Refresh",
                        onClick = viewModel::refresh,
                        enabled = !uiState.loading,
                        modifier = Modifier.weight(0.45f),
                    )
                    Text(
                        text = "${uiState.posts.size} posts",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(0.55f),
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        if (uiState.error != null) {
            Text(
                text = uiState.error ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }

        Crossfade(
            targetState = bodyState,
            modifier = Modifier.fillMaxSize(),
            label = "socialFeedBodyCrossfade",
        ) { state ->
            when (state) {
                SocialFeedBodyState.Loading -> {
                    SocialFeedSkeletonList(modifier = Modifier.fillMaxSize())
                }

                SocialFeedBodyState.Empty -> {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.Top,
                    ) {
                        SocialFeedEmptyState(modifier = Modifier.fillMaxWidth())
                    }
                }

                SocialFeedBodyState.Content -> {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(uiState.posts, key = { it.id }) { post ->
                            val interactionSource = remember(post.id) { MutableInteractionSource() }
                            val isPressed by interactionSource.collectIsPressedAsState()
                            val cardScale by animateFloatAsState(
                                targetValue = if (isPressed) 0.992f else 1f,
                                animationSpec = tween(durationMillis = 120),
                                label = "socialPostCardPress",
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
                                    ) {},
                                containerColor = MaterialTheme.colorScheme.surface,
                                borderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.65f),
                                elevation = 3.dp,
                            ) {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(36.dp)
                                                .clip(CircleShape)
                                                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Text(
                                                text = post.authorName.trim().take(1).ifBlank { "?" },
                                                style = MaterialTheme.typography.titleSmall,
                                                color = MaterialTheme.colorScheme.primary,
                                                fontWeight = FontWeight.SemiBold,
                                            )
                                        }
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = post.authorName,
                                                style = MaterialTheme.typography.titleSmall,
                                                fontWeight = FontWeight.SemiBold,
                                            )
                                            Text(
                                                text = formatPostTime(post.createdAt),
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }

                                    if (post.caption.isNotBlank()) {
                                        Text(
                                            text = post.caption,
                                            style = MaterialTheme.typography.bodyMedium,
                                        )
                                    }

                                    val firstImage = post.mediaUrls.firstOrNull()
                                    if (!firstImage.isNullOrBlank()) {
                                        AsyncImage(
                                            model = firstImage,
                                            contentDescription = "Post image",
                                            contentScale = ContentScale.Crop,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(190.dp)
                                                .clip(MaterialTheme.shapes.medium),
                                        )
                                    }

                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        SocialMetaPill(text = "${post.likesCount} likes", highlighted = true)
                                        SocialMetaPill(text = "${post.commentsCount} comments")
                                        if (post.mediaUrls.size > 1) {
                                            SocialMetaPill(text = "${post.mediaUrls.size} media")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SocialFeedEmptyState(modifier: Modifier = Modifier) {
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
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f))
                    .border(
                        width = 1.dp,
                        color = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f),
                        shape = CircleShape,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "@",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = "No posts available",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "New updates will stream in when your network feed syncs.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun SocialFeedSkeletonList(modifier: Modifier = Modifier) {
    val shimmerTransition = rememberInfiniteTransition(label = "socialFeedShimmer")
    val translateX by shimmerTransition.animateFloat(
        initialValue = -280f,
        targetValue = 980f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1250, easing = LinearEasing),
        ),
        label = "socialFeedShimmerTranslate",
    )

    val shimmerBrush = Brush.linearGradient(
        colors = listOf(
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.58f),
            MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.58f),
        ),
        start = Offset(translateX, 0f),
        end = Offset(translateX + 260f, 240f),
    )

    LazyColumn(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(5) { index ->
            ShadcnSectionCard(
                modifier = Modifier.fillMaxWidth(),
                containerColor = MaterialTheme.colorScheme.surface,
                borderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.62f),
                elevation = 2.dp,
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(shimmerBrush),
                        )
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(0.4f)
                                    .height(12.dp)
                                    .clip(MaterialTheme.shapes.small)
                                    .background(shimmerBrush),
                            )
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(0.24f)
                                    .height(10.dp)
                                    .clip(MaterialTheme.shapes.small)
                                    .background(shimmerBrush),
                            )
                        }
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth(if (index % 2 == 0) 0.84f else 0.72f)
                            .height(12.dp)
                            .clip(MaterialTheme.shapes.small)
                            .background(shimmerBrush),
                    )

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(190.dp)
                            .clip(MaterialTheme.shapes.medium)
                            .background(shimmerBrush),
                    )

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        repeat(3) {
                            Box(
                                modifier = Modifier
                                    .size(width = 72.dp, height = 20.dp)
                                    .clip(CircleShape)
                                    .background(shimmerBrush),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SocialMetaPill(
    text: String,
    highlighted: Boolean = false,
) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(
                if (highlighted) {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.16f)
                } else {
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.62f)
                },
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
            fontWeight = FontWeight.Medium,
        )
    }
}

private fun formatPostTime(raw: String): String {
    val value = raw.trim()
    if (value.isBlank()) {
        return "Just now"
    }

    return value
        .replace('T', ' ')
        .replace("Z", "")
        .take(16)
}
