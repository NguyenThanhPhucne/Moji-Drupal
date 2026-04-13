package com.moji.mobile.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp
import com.moji.mobile.core.session.SessionState
import com.moji.mobile.feature.chat.ui.ChatListScreen
import com.moji.mobile.feature.notification.ui.NotificationCenterScreen
import com.moji.mobile.feature.profile.ui.ProfileScreen
import com.moji.mobile.feature.social.ui.SocialFeedScreen
import com.moji.mobile.ui.components.ShadcnSectionCard
import com.moji.mobile.ui.components.ShadcnTabItem

@Composable
fun HomeScreen(
    sessionState: SessionState,
    onSignOut: () -> Unit,
) {
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }

    Surface(
        color = MaterialTheme.colorScheme.background,
        modifier = Modifier.fillMaxSize(),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                            MaterialTheme.colorScheme.background,
                            MaterialTheme.colorScheme.background,
                        ),
                    ),
                ),
        ) {
            Box(
                modifier = Modifier
                    .padding(top = 26.dp, end = 20.dp)
                    .fillMaxWidth(),
            ) {
                Box(
                    modifier = Modifier
                        .align(androidx.compose.ui.Alignment.TopEnd)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                        .padding(24.dp),
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                ShadcnSectionCard(
                    modifier = Modifier.fillMaxWidth(),
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "Moji Mobile",
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Text(
                            text = "Hello ${sessionState.user?.displayName ?: "there"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                ShadcnSectionCard(
                    modifier = Modifier.fillMaxWidth(),
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                ) {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            ShadcnTabItem(
                                selected = selectedTab == 0,
                                title = "Chat",
                                onClick = { selectedTab = 0 },
                                modifier = Modifier.weight(1f),
                            )
                            ShadcnTabItem(
                                selected = selectedTab == 1,
                                title = "Social",
                                onClick = { selectedTab = 1 },
                                modifier = Modifier.weight(1f),
                            )
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            ShadcnTabItem(
                                selected = selectedTab == 2,
                                title = "Alerts",
                                onClick = { selectedTab = 2 },
                                modifier = Modifier.weight(1f),
                            )
                            ShadcnTabItem(
                                selected = selectedTab == 3,
                                title = "Profile",
                                onClick = { selectedTab = 3 },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(2.dp))

                when (selectedTab) {
                    0 -> ChatListScreen(modifier = Modifier.fillMaxSize())
                    1 -> SocialFeedScreen(modifier = Modifier.fillMaxSize())
                    2 -> NotificationCenterScreen(modifier = Modifier.fillMaxSize())
                    else -> ProfileScreen(
                        user = sessionState.user,
                        onSignOut = onSignOut,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
    }
}
