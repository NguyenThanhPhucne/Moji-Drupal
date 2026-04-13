package com.moji.mobile.feature.profile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.moji.mobile.ui.components.ShadcnOutlineButton
import com.moji.mobile.ui.components.ShadcnSectionCard

@Composable
@OptIn(ExperimentalLayoutApi::class)
fun NotificationPreferencesSection(
    modifier: Modifier = Modifier,
    viewModel: NotificationPreferencesViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val prefs = uiState.preferences

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        ShadcnSectionCard(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.93f),
            borderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.68f),
            elevation = 3.dp,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = "Notification preferences",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = "Quick presets and fine-grained controls similar to the web app.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    SavingIndicator(saving = uiState.saving)
                }

                SectionLabel(text = "Quick presets")

                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    NotificationPresets.forEach { preset ->
                        PresetOptionCard(
                            title = preset.title,
                            subtitle = preset.subtitle,
                            selected = uiState.activePreset == preset.key,
                            enabled = !uiState.saving,
                            onClick = { viewModel.applyPreset(preset.key) },
                        )
                    }
                }
            }
        }

        ShadcnSectionCard(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.93f),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionLabel(text = "Delivery")

                PreferenceToggleRow(
                    title = "Message notifications",
                    subtitle = "Receive direct and group alerts",
                    checked = prefs.message,
                    enabled = !uiState.saving,
                    onCheckedChange = { viewModel.updateDelivery(message = it) },
                )
                PreferenceToggleRow(
                    title = "Sound",
                    subtitle = "Play incoming notification sound",
                    checked = prefs.sound,
                    enabled = !uiState.saving && prefs.message,
                    onCheckedChange = { viewModel.updateDelivery(sound = it) },
                )
                PreferenceToggleRow(
                    title = "Desktop",
                    subtitle = "Show system push notifications",
                    checked = prefs.desktop,
                    enabled = !uiState.saving && prefs.message,
                    onCheckedChange = { viewModel.updateDelivery(desktop = it) },
                )
            }
        }

        ShadcnSectionCard(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.93f),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionLabel(text = "Social quiet mode")

                PreferenceToggleRow(
                    title = "Show online status",
                    subtitle = "Control whether others can see your online state",
                    checked = uiState.showOnlineStatus,
                    enabled = !uiState.saving,
                    onCheckedChange = viewModel::updateOnlineStatus,
                )

                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f))

                PreferenceToggleRow(
                    title = "Social quiet mode",
                    subtitle = "Mute social notifications quickly",
                    checked = prefs.social.muted,
                    enabled = !uiState.saving,
                    onCheckedChange = { viewModel.updateSocial(muted = it) },
                )

                listOf(
                    SocialToggleOption(
                        title = "Follow",
                        subtitle = "New followers",
                        checked = prefs.social.follow,
                        onCheckedChange = { viewModel.updateSocial(follow = it) },
                    ),
                    SocialToggleOption(
                        title = "Like",
                        subtitle = "Post reactions",
                        checked = prefs.social.like,
                        onCheckedChange = { viewModel.updateSocial(like = it) },
                    ),
                    SocialToggleOption(
                        title = "Comment",
                        subtitle = "New comments",
                        checked = prefs.social.comment,
                        onCheckedChange = { viewModel.updateSocial(comment = it) },
                    ),
                    SocialToggleOption(
                        title = "Friend accepted",
                        subtitle = "Accepted requests",
                        checked = prefs.social.friendAccepted,
                        onCheckedChange = { viewModel.updateSocial(friendAccepted = it) },
                    ),
                    SocialToggleOption(
                        title = "System",
                        subtitle = "Platform updates",
                        checked = prefs.social.system,
                        onCheckedChange = { viewModel.updateSocial(system = it) },
                    ),
                ).chunked(2).forEach { options ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        options.forEach { option ->
                            PreferenceToggleRow(
                                title = option.title,
                                subtitle = option.subtitle,
                                checked = option.checked,
                                enabled = !uiState.saving && !prefs.social.muted,
                                onCheckedChange = option.onCheckedChange,
                                modifier = Modifier.weight(1f),
                                compact = true,
                            )
                        }

                        if (options.size == 1) {
                            Box(modifier = Modifier.weight(1f))
                        }
                    }
                }

                PreferenceToggleRow(
                    title = "Digest mode",
                    subtitle = "Batch social notifications periodically",
                    checked = prefs.social.digestEnabled,
                    enabled = !uiState.saving && !prefs.social.muted,
                    onCheckedChange = { viewModel.updateSocial(digestEnabled = it) },
                )

                if (prefs.social.digestEnabled) {
                    FlowRow(
                        modifier = Modifier.padding(top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        listOf(1, 3, 6, 12, 24).forEach { hours ->
                            DigestHourChip(
                                hours = hours,
                                selected = prefs.social.digestWindowHours == hours,
                                enabled = !uiState.saving,
                                onClick = { viewModel.updateSocial(digestWindowHours = hours) },
                            )
                        }
                    }
                }
            }
        }

        if (uiState.error != null) {
            Text(
                text = uiState.error ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }

        if (uiState.recentRealtimeEvents.isNotEmpty()) {
            ShadcnSectionCard(
                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.38f),
                borderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.55f),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "Recent realtime events",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    uiState.recentRealtimeEvents.forEach { eventText ->
                        Text(
                            text = eventText,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        ShadcnOutlineButton(
            text = "Reset to balanced",
            onClick = { viewModel.applyPreset(NotificationPresetKey.Balanced) },
            enabled = !uiState.saving,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun PreferenceToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.25f))
            .border(
                width = 1.dp,
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f),
                shape = MaterialTheme.shapes.medium,
            )
            .padding(horizontal = 10.dp, vertical = if (compact) 8.dp else 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(if (compact) 1.dp else 2.dp),
        ) {
            Text(
                text = title,
                style = if (compact) {
                    MaterialTheme.typography.labelMedium
                } else {
                    MaterialTheme.typography.bodyMedium
                },
            )
            Text(
                text = subtitle,
                style = if (compact) {
                    MaterialTheme.typography.labelSmall
                } else {
                    MaterialTheme.typography.bodySmall
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Spacer(modifier = Modifier.height(1.dp))

        Switch(
            checked = checked,
            enabled = enabled,
            onCheckedChange = onCheckedChange,
        )
    }
}

@Composable
private fun PresetOptionCard(
    title: String,
    subtitle: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .clip(MaterialTheme.shapes.medium)
            .background(
                if (selected) {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.11f)
                } else {
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.24f)
                },
            )
            .border(
                width = 1.dp,
                color = if (selected) {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.45f)
                } else {
                    MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
                },
                shape = MaterialTheme.shapes.medium,
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            color = if (selected) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurface
            },
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (selected) {
            Text(
                text = "Active",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun DigestHourChip(
    hours: Int,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(
                if (selected) {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.13f)
                } else {
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                },
            )
            .border(
                width = 1.dp,
                color = if (selected) {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.4f)
                } else {
                    MaterialTheme.colorScheme.outline.copy(alpha = 0.45f)
                },
                shape = CircleShape,
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 5.dp),
    ) {
        Text(
            text = "${hours}h",
            style = MaterialTheme.typography.labelSmall,
            color = if (selected) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun SavingIndicator(saving: Boolean) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(7.dp)
                .clip(CircleShape)
                .background(
                    if (saving) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.45f)
                    },
                ),
        )
        Text(
            text = if (saving) "Saving..." else "Synced",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontWeight = FontWeight.SemiBold,
    )
}

private data class SocialToggleOption(
    val title: String,
    val subtitle: String,
    val checked: Boolean,
    val onCheckedChange: (Boolean) -> Unit,
)
