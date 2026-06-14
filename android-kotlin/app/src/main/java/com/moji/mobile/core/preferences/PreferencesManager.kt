package com.moji.mobile.core.preferences

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages app preferences including message drafts, call mode, and other UI state.
 * Uses SharedPreferences for persistence across app restarts.
 */
@Singleton
class PreferencesManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val preferences: SharedPreferences =
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    // ==================== Draft Messages ====================
    /**
     * Save message draft for a conversation.
     * Persists even after app restart.
     */
    fun saveDraft(conversationId: String, draft: String) {
        preferences.edit().putString(
            getDraftKey(conversationId),
            draft.trim()
        ).apply()
    }

    /**
     * Load saved draft for a conversation.
     * Returns empty string if no draft found.
     */
    fun loadDraft(conversationId: String): String {
        return preferences.getString(getDraftKey(conversationId), "") ?: ""
    }

    /**
     * Clear draft for a conversation (called after sending).
     */
    fun clearDraft(conversationId: String) {
        preferences.edit().remove(getDraftKey(conversationId)).apply()
    }

    /**
     * Clear all drafts.
     */
    fun clearAllDrafts() {
        preferences.edit().apply {
            preferences.all.keys.forEach { key ->
                if (key.startsWith(DRAFT_PREFIX)) {
                    remove(key)
                }
            }
        }.apply()
    }

    // ==================== Call Mode ====================
    /**
     * Save user's call mode preference (audio or video).
     * Persists across sessions.
     */
    fun saveCallMode(mode: String) {
        preferences.edit().putString(CALL_MODE_KEY, mode).apply()
    }

    /**
     * Load call mode preference.
     * Returns "video" as default if not set.
     */
    fun getCallMode(): String {
        return preferences.getString(CALL_MODE_KEY, "video") ?: "video"
    }

    // ==================== Last Active Conversation ====================
    /**
     * Save last active conversation ID for quick access.
     */
    fun saveLastActiveConversationId(conversationId: String) {
        preferences.edit().putString(LAST_ACTIVE_CONVERSATION_KEY, conversationId).apply()
    }

    /**
     * Get last active conversation ID.
     */
    fun getLastActiveConversationId(): String? {
        return preferences.getString(LAST_ACTIVE_CONVERSATION_KEY, null)
    }

    // ==================== UI Preferences ====================
    /**
     * Save selected language (en, vi, etc).
     */
    fun saveLanguage(languageCode: String) {
        preferences.edit().putString(LANGUAGE_KEY, languageCode).apply()
    }

    /**
     * Get selected language.
     */
    fun getLanguage(): String {
        return preferences.getString(LANGUAGE_KEY, "en") ?: "en"
    }

    /**
     * Save dark mode preference.
     */
    fun saveDarkModeEnabled(enabled: Boolean) {
        preferences.edit().putBoolean(DARK_MODE_KEY, enabled).apply()
    }

    /**
     * Get dark mode preference.
     */
    fun isDarkModeEnabled(): Boolean {
        return preferences.getBoolean(DARK_MODE_KEY, false)
    }

    // ==================== Private Helpers ====================
    private fun getDraftKey(conversationId: String): String {
        return "$DRAFT_PREFIX:$conversationId"
    }

    companion object {
        private const val PREFERENCES_NAME = "moji_mobile_preferences"
        private const val DRAFT_PREFIX = "draft"
        private const val CALL_MODE_KEY = "call_mode"
        private const val LAST_ACTIVE_CONVERSATION_KEY = "last_active_conversation"
        private const val LANGUAGE_KEY = "language"
        private const val DARK_MODE_KEY = "dark_mode"
    }
}
