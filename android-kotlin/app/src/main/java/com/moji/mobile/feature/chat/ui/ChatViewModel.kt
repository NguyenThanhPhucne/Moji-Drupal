package com.moji.mobile.feature.chat.ui

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.moji.mobile.BuildConfig
import com.moji.mobile.core.model.Conversation
import com.moji.mobile.core.model.Message
import com.moji.mobile.core.model.MessageReaction
import com.moji.mobile.core.realtime.ChatRealtimeEvent
import com.moji.mobile.core.realtime.SocketManager
import com.moji.mobile.core.session.SessionManager
import com.moji.mobile.feature.chat.data.ChatRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

private data class TypingIndicatorState(
    val displayName: String,
    val expiresAt: Long,
)

private const val TYPING_EMIT_INTERVAL_MS = 350L
private const val TYPING_STOP_DELAY_MS = 2000L
private const val TYPING_TTL_MS = 2600L
private const val TYPING_STOP_GRACE_MS = 450L
private const val READ_BATCH_DEBOUNCE_MS = 260L
private const val SEEN_DEBOUNCE_MS = 520L
private const val READ_SEEN_LOG_TAG = "ChatReadSeen"

data class ChatUiState(
    val loadingConversations: Boolean = false,
    val loadingMessages: Boolean = false,
    val sendingMessage: Boolean = false,
    val error: String? = null,
    val conversations: List<Conversation> = emptyList(),
    val selectedConversation: Conversation? = null,
    val messages: List<Message> = emptyList(),
    val replyingToMessage: Message? = null,
    val currentUserId: String? = null,
    val typingSummary: String? = null,
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
    private val sessionManager: SessionManager,
    private val socketManager: SocketManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private val typingUsers = mutableMapOf<String, TypingIndicatorState>()
    private val pendingReadMessageIds = mutableSetOf<String>()
    private val queuedReadMessageIdsByConversation =
        mutableMapOf<String, MutableSet<String>>()
    private val readFlushJobByConversation = mutableMapOf<String, Job>()
    private val seenDebounceJobByConversation = mutableMapOf<String, Job>()
    private var outgoingTypingConversationId: String? = null
    private var outgoingTypingActive = false
    private var lastTypingEmitAt: Long = 0L
    private var stopTypingJob: Job? = null

    private fun logReadSeen(message: String) {
        if (BuildConfig.DEBUG) {
            Log.d(READ_SEEN_LOG_TAG, message)
        }
    }

    init {
        observeSession()
        observeRealtime()
        startTypingIndicatorPruner()
        loadConversations()
    }

    private fun observeSession() {
        viewModelScope.launch {
            sessionManager.session.collect { sessionState ->
                _uiState.update {
                    it.copy(currentUserId = sessionState.user?.id)
                }
            }
        }
    }

    private fun observeRealtime() {
        viewModelScope.launch {
            socketManager.chatEvents.collect { event ->
                when (event) {
                    is ChatRealtimeEvent.MessageReceived -> {
                        val incomingMessage = event.message
                        _uiState.update { state ->
                            val existingConversation = state.conversations.firstOrNull {
                                it.id == incomingMessage.conversationId
                            }

                            val nextConversationSnapshot = when {
                                existingConversation != null -> existingConversation.copy(
                                    lastMessageId = incomingMessage.id,
                                    lastMessage = incomingMessage.content,
                                    updatedAt = incomingMessage.createdAt,
                                )

                                event.conversation != null -> event.conversation.copy(
                                    lastMessageId = incomingMessage.id,
                                    lastMessage = incomingMessage.content,
                                    updatedAt = incomingMessage.createdAt,
                                )

                                else -> null
                            }

                            val nextConversations = if (nextConversationSnapshot == null) {
                                state.conversations
                            } else {
                                (listOf(nextConversationSnapshot) + state.conversations
                                    .filterNot { it.id == nextConversationSnapshot.id })
                                    .sortedByDescending { it.updatedAt }
                            }

                            val nextMessages = if (
                                state.selectedConversation?.id == incomingMessage.conversationId &&
                                state.messages.none { it.id == incomingMessage.id }
                            ) {
                                (state.messages + incomingMessage)
                                    .sortedBy { it.createdAt }
                            } else {
                                state.messages
                            }

                            state.copy(
                                conversations = nextConversations,
                                messages = nextMessages,
                                replyingToMessage = state.replyingToMessage
                                    ?.takeIf { replying ->
                                        nextMessages.any { current -> current.id == replying.id }
                                    },
                                selectedConversation = state.selectedConversation?.let { selected ->
                                    nextConversations.firstOrNull {
                                        it.id == selected.id
                                    } ?: selected
                                },
                            )
                        }

                        markMessageAsReadIfNeeded(incomingMessage)
                        markConversationSeenIfNeeded(incomingMessage.conversationId)
                    }

                    is ChatRealtimeEvent.MessageRead -> {
                        _uiState.update { state ->
                            if (state.messages.none { it.id == event.messageId }) {
                                state
                            } else {
                                state.copy(
                                    messages = state.messages.map { message ->
                                        if (message.id == event.messageId) {
                                            message.copy(readBy = event.readBy)
                                        } else {
                                            message
                                        }
                                    },
                                )
                            }
                        }
                    }

                    is ChatRealtimeEvent.MessageReacted -> {
                        updateMessageReactions(
                            messageId = event.messageId,
                            reactions = event.reactions,
                        )
                    }

                    is ChatRealtimeEvent.ConversationSeenUpdated -> {
                        _uiState.update { state ->
                            val nextConversations = state.conversations.map { conversation ->
                                if (conversation.id == event.conversationId) {
                                    conversation.copy(
                                        seenByIds = event.seenByIds,
                                        lastMessageId = event.lastMessageId ?: conversation.lastMessageId,
                                        lastMessage = event.lastMessageContent ?: conversation.lastMessage,
                                        updatedAt = event.lastMessageCreatedAt ?: conversation.updatedAt,
                                    )
                                } else {
                                    conversation
                                }
                            }

                            state.copy(
                                conversations = nextConversations,
                                selectedConversation = state.selectedConversation?.let { selected ->
                                    if (selected.id == event.conversationId) {
                                        selected.copy(
                                            seenByIds = event.seenByIds,
                                            lastMessageId = event.lastMessageId
                                                ?: selected.lastMessageId,
                                            lastMessage = event.lastMessageContent
                                                ?: selected.lastMessage,
                                            updatedAt = event.lastMessageCreatedAt
                                                ?: selected.updatedAt,
                                        )
                                    } else {
                                        selected
                                    }
                                },
                            )
                        }
                    }

                    is ChatRealtimeEvent.UserTyping -> {
                        val selectedId = _uiState.value.selectedConversation?.id
                        val currentUserId = _uiState.value.currentUserId
                        if (
                            selectedId == event.conversationId &&
                            event.userId != currentUserId
                        ) {
                            typingUsers[event.userId] = TypingIndicatorState(
                                displayName = event.displayName,
                                expiresAt = System.currentTimeMillis() + TYPING_TTL_MS,
                            )
                            updateTypingSummary()
                        }
                    }

                    is ChatRealtimeEvent.UserStopTyping -> {
                        val selectedId = _uiState.value.selectedConversation?.id
                        if (selectedId == event.conversationId) {
                            val current = typingUsers[event.userId] ?: return@collect
                            typingUsers[event.userId] = current.copy(
                                expiresAt = System.currentTimeMillis() + TYPING_STOP_GRACE_MS,
                            )
                            updateTypingSummary()
                        }
                    }

                    is ChatRealtimeEvent.ConversationAdded -> {
                        socketManager.joinConversationRoom(event.conversation.id)
                        _uiState.update { state ->
                            val exists = state.conversations.any {
                                it.id == event.conversation.id
                            }
                            if (exists) {
                                state
                            } else {
                                state.copy(
                                    conversations = listOf(event.conversation) + state.conversations,
                                )
                            }
                        }
                    }

                    is ChatRealtimeEvent.ConversationUpdated -> {
                        _uiState.update { state ->
                            state.copy(
                                conversations = state.conversations.map {
                                    if (it.id == event.conversation.id) {
                                        event.conversation
                                    } else {
                                        it
                                    }
                                },
                            )
                        }
                    }

                    is ChatRealtimeEvent.ConversationDeleted -> {
                        cancelConversationDeliveryJobs(event.conversationId)

                        _uiState.update { state ->
                            val nextConversations = state.conversations.filterNot {
                                it.id == event.conversationId
                            }
                            val selectedStillExists =
                                state.selectedConversation?.id != event.conversationId

                            state.copy(
                                conversations = nextConversations,
                                selectedConversation = if (selectedStillExists) {
                                    state.selectedConversation
                                } else {
                                    nextConversations.firstOrNull()
                                },
                                replyingToMessage = if (selectedStillExists) {
                                    state.replyingToMessage
                                } else {
                                    null
                                },
                                messages = if (selectedStillExists) {
                                    state.messages
                                } else {
                                    emptyList()
                                },
                            )
                        }

                        if (_uiState.value.selectedConversation?.id == event.conversationId) {
                            clearIncomingTyping()
                            resetOutgoingTypingState()
                        }
                    }
                }
            }
        }
    }

    private fun startTypingIndicatorPruner() {
        viewModelScope.launch {
            while (isActive) {
                delay(500)
                pruneExpiredTypingUsers()
            }
        }
    }

    private fun pruneExpiredTypingUsers() {
        val now = System.currentTimeMillis()
        val beforeSize = typingUsers.size
        typingUsers.entries.removeAll { (_, state) -> state.expiresAt <= now }
        if (typingUsers.size != beforeSize) {
            updateTypingSummary()
        }
    }

    private fun updateTypingSummary() {
        val now = System.currentTimeMillis()
        val names = typingUsers.values
            .filter { it.expiresAt > now }
            .map { it.displayName }
            .distinct()

        val summary = when (names.size) {
            0 -> null
            1 -> "${names[0]} is typing..."
            2 -> "${names[0]}, ${names[1]} are typing..."
            else -> "${names[0]}, ${names[1]} and ${names.size - 2} others are typing..."
        }

        _uiState.update { it.copy(typingSummary = summary) }
    }

    private fun clearIncomingTyping() {
        typingUsers.clear()
        _uiState.update { it.copy(typingSummary = null) }
    }

    private fun resetOutgoingTypingState() {
        stopTypingJob?.cancel()
        stopTypingJob = null
        outgoingTypingActive = false
        outgoingTypingConversationId = null
        lastTypingEmitAt = 0L
    }

    fun onMessageDraftChanged(draft: String) {
        val conversationId = _uiState.value.selectedConversation?.id ?: return
        val hasText = draft.trim().isNotEmpty()
        if (!hasText) {
            emitStopTyping(conversationId)
            return
        }

        val now = System.currentTimeMillis()
        val shouldEmitTyping = !outgoingTypingActive ||
            outgoingTypingConversationId != conversationId ||
            now - lastTypingEmitAt >= TYPING_EMIT_INTERVAL_MS

        if (shouldEmitTyping) {
            socketManager.emitTyping(conversationId)
            outgoingTypingActive = true
            outgoingTypingConversationId = conversationId
            lastTypingEmitAt = now
        }

        stopTypingJob?.cancel()
        stopTypingJob = viewModelScope.launch {
            delay(TYPING_STOP_DELAY_MS)
            emitStopTyping(conversationId)
        }
    }

    fun stopTypingForConversation(conversationId: String) {
        if (conversationId.isBlank()) {
            return
        }
        emitStopTyping(conversationId)
    }

    private fun emitStopTyping(conversationId: String) {
        val matchesActiveConversation = outgoingTypingConversationId == conversationId
        if (matchesActiveConversation && outgoingTypingActive) {
            socketManager.emitStopTyping(conversationId)
        }
        resetOutgoingTypingState()
    }

    private fun markConversationSeenIfNeeded(conversationId: String) {
        val state = _uiState.value
        val currentUserId = state.currentUserId ?: return
        if (state.selectedConversation?.id != conversationId) {
            return
        }

        val unreadIncomingMessages = state.messages.filter { message ->
            message.conversationId == conversationId &&
                message.senderId != currentUserId &&
                !message.readBy.contains(currentUserId)
        }

        if (unreadIncomingMessages.isEmpty()) {
            return
        }

        logReadSeen(
            "queue-seen conversation=$conversationId unreadCount=${unreadIncomingMessages.size}",
        )
        unreadIncomingMessages.forEach(::markMessageAsReadIfNeeded)
        scheduleConversationSeenDebounce(conversationId)
    }

    private fun markMessageAsReadIfNeeded(message: Message) {
        val currentUserId = _uiState.value.currentUserId ?: return
        if (message.senderId == currentUserId) {
            return
        }
        if (message.readBy.contains(currentUserId)) {
            return
        }
        if (!pendingReadMessageIds.add(message.id)) {
            return
        }

        val conversationQueue = queuedReadMessageIdsByConversation
            .getOrPut(message.conversationId) { linkedSetOf() }
        conversationQueue.add(message.id)
        logReadSeen(
            "queue-read conversation=${message.conversationId} message=${message.id} queueSize=${conversationQueue.size}",
        )
        scheduleReadFlush(message.conversationId)
    }

    private fun scheduleReadFlush(conversationId: String) {
        readFlushJobByConversation[conversationId]?.cancel()
        val queueSize = queuedReadMessageIdsByConversation[conversationId]?.size ?: 0
        logReadSeen("schedule-read-flush conversation=$conversationId queueSize=$queueSize")
        readFlushJobByConversation[conversationId] = viewModelScope.launch {
            delay(READ_BATCH_DEBOUNCE_MS)
            flushQueuedReads(conversationId)
        }
    }

    private suspend fun flushQueuedReads(conversationId: String) {
        val messageIds = queuedReadMessageIdsByConversation
            .remove(conversationId)
            ?.toList()
            .orEmpty()

        if (messageIds.isEmpty()) {
            return
        }

        val currentUserId = _uiState.value.currentUserId
        logReadSeen("flush-read-start conversation=$conversationId count=${messageIds.size}")

        messageIds.forEach { messageId ->
            try {
                val result = chatRepository.markMessageRead(messageId)
                result.onSuccess {
                    logReadSeen("flush-read-success conversation=$conversationId message=$messageId")
                    if (currentUserId != null) {
                        _uiState.update { state ->
                            state.copy(
                                messages = state.messages.map { current ->
                                    if (
                                        current.id == messageId &&
                                        !current.readBy.contains(currentUserId)
                                    ) {
                                        current.copy(readBy = current.readBy + currentUserId)
                                    } else {
                                        current
                                    }
                                },
                            )
                        }
                    }
                }
                result.onFailure { throwable ->
                    logReadSeen(
                        "flush-read-failed conversation=$conversationId message=$messageId error=${throwable.message}",
                    )
                }
            } finally {
                pendingReadMessageIds.remove(messageId)
            }
        }

        readFlushJobByConversation.remove(conversationId)
        logReadSeen("flush-read-finish conversation=$conversationId")
    }

    private fun scheduleConversationSeenDebounce(conversationId: String) {
        seenDebounceJobByConversation[conversationId]?.cancel()
        logReadSeen("schedule-seen-debounce conversation=$conversationId")
        seenDebounceJobByConversation[conversationId] = viewModelScope.launch {
            delay(SEEN_DEBOUNCE_MS)
            val result = chatRepository.markConversationSeen(conversationId)
            result.onSuccess {
                logReadSeen("seen-success conversation=$conversationId")
            }
            result.onFailure { throwable ->
                logReadSeen(
                    "seen-failed conversation=$conversationId error=${throwable.message}",
                )
            }
        }
    }

    private fun cancelConversationDeliveryJobs(conversationId: String) {
        readFlushJobByConversation.remove(conversationId)?.cancel()
        seenDebounceJobByConversation.remove(conversationId)?.cancel()
        queuedReadMessageIdsByConversation.remove(conversationId)?.forEach { messageId ->
            pendingReadMessageIds.remove(messageId)
        }
        logReadSeen("cancel-conversation-jobs conversation=$conversationId")
    }

    private fun cancelAllDeliveryJobs() {
        readFlushJobByConversation.values.forEach { it.cancel() }
        seenDebounceJobByConversation.values.forEach { it.cancel() }
        readFlushJobByConversation.clear()
        seenDebounceJobByConversation.clear()
        queuedReadMessageIdsByConversation.clear()
        pendingReadMessageIds.clear()
        logReadSeen("cancel-all-jobs")
    }

    fun loadConversations() {
        viewModelScope.launch {
            _uiState.update { it.copy(loadingConversations = true, error = null) }
            val result = chatRepository.fetchConversations()
            result
                .onSuccess { list ->
                    list.forEach { conversation ->
                        socketManager.joinConversationRoom(conversation.id)
                    }

                    _uiState.update { current ->
                        current.copy(
                            loadingConversations = false,
                            conversations = list,
                            selectedConversation = current.selectedConversation ?: list.firstOrNull(),
                        )
                    }
                    _uiState.value.selectedConversation?.let { selected ->
                        loadMessages(selected.id)
                    }
                }
                .onFailure { throwable ->
                    _uiState.update {
                        it.copy(
                            loadingConversations = false,
                            error = throwable.message ?: "Cannot load conversations",
                        )
                    }
                }
        }
    }

    fun selectConversation(conversation: Conversation) {
        val previousConversationId = _uiState.value.selectedConversation?.id
        if (previousConversationId != null && previousConversationId != conversation.id) {
            emitStopTyping(previousConversationId)
        }

        socketManager.joinConversationRoom(conversation.id)
        _uiState.update {
            it.copy(
                selectedConversation = conversation,
                messages = emptyList(),
                replyingToMessage = null,
            )
        }
        clearIncomingTyping()
        loadMessages(conversation.id)
    }

    fun setReplyTarget(message: Message) {
        _uiState.update { state ->
            if (state.selectedConversation?.id != message.conversationId) {
                state
            } else {
                state.copy(replyingToMessage = message)
            }
        }
    }

    fun clearReplyTarget() {
        _uiState.update { it.copy(replyingToMessage = null) }
    }

    fun loadMessages(conversationId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(loadingMessages = true, error = null) }
            val result = chatRepository.fetchMessages(conversationId)
            result
                .onSuccess { messages ->
                    _uiState.update {
                        it.copy(loadingMessages = false, messages = messages)
                    }
                    markConversationSeenIfNeeded(conversationId)
                }
                .onFailure { throwable ->
                    _uiState.update {
                        it.copy(
                            loadingMessages = false,
                            error = throwable.message ?: "Cannot load messages",
                        )
                    }
                }
        }
    }

    fun sendMessage(content: String) {
        val trimmed = content.trim()
        if (trimmed.isEmpty()) {
            return
        }

        val selected = _uiState.value.selectedConversation ?: return
        val replyToMessageId = _uiState.value.replyingToMessage?.id
        emitStopTyping(selected.id)

        viewModelScope.launch {
            _uiState.update { it.copy(sendingMessage = true, error = null) }

            val result = if (selected.type == "group") {
                chatRepository.sendGroupMessage(
                    conversationId = selected.id,
                    content = trimmed,
                    replyTo = replyToMessageId,
                )
            } else {
                val currentUserId = sessionManager.session.value.user?.id
                val recipientId = selected.memberIds.firstOrNull { it != currentUserId }
                    ?: selected.memberIds.firstOrNull()

                if (recipientId == null) {
                    Result.failure(IllegalStateException("Recipient not found in conversation"))
                } else {
                    chatRepository.sendDirectMessage(
                        recipientId = recipientId,
                        content = trimmed,
                        conversationId = selected.id,
                        replyTo = replyToMessageId,
                    )
                }
            }

            result
                .onSuccess {
                    _uiState.update { state ->
                        state.copy(
                            replyingToMessage = null,
                            conversations = state.conversations.map { conversation ->
                                if (conversation.id == selected.id) {
                                    conversation.copy(seenByIds = emptyList())
                                } else {
                                    conversation
                                }
                            },
                            selectedConversation = state.selectedConversation?.let { conversation ->
                                if (conversation.id == selected.id) {
                                    conversation.copy(seenByIds = emptyList())
                                } else {
                                    conversation
                                }
                            },
                        )
                    }
                    loadMessages(selected.id)
                }
                .onFailure { throwable ->
                    _uiState.update {
                        it.copy(error = throwable.message ?: "Cannot send message")
                    }
                }

            _uiState.update { it.copy(sendingMessage = false) }
        }
    }

    fun reactToMessage(message: Message, emoji: String) {
        val currentUserId = _uiState.value.currentUserId ?: return
        if (message.isDeleted) {
            return
        }

        val normalizedEmoji = emoji.trim()
        if (normalizedEmoji.isBlank() || normalizedEmoji.length > 16) {
            return
        }

        val previousReactions = message.reactions
        val optimisticReactions = toggleOwnReaction(
            reactions = previousReactions,
            currentUserId = currentUserId,
            emoji = normalizedEmoji,
        )

        updateMessageReactions(
            messageId = message.id,
            reactions = optimisticReactions,
        )

        viewModelScope.launch {
            val result = chatRepository.reactToMessage(
                messageId = message.id,
                emoji = normalizedEmoji,
            )

            result.onSuccess { canonicalReactions ->
                updateMessageReactions(
                    messageId = message.id,
                    reactions = canonicalReactions,
                )
            }

            result.onFailure { throwable ->
                updateMessageReactions(
                    messageId = message.id,
                    reactions = previousReactions,
                )
                logReadSeen(
                    "react-failed message=${message.id} error=${throwable.message}",
                )
            }
        }
    }

    private fun updateMessageReactions(messageId: String, reactions: List<MessageReaction>) {
        _uiState.update { state ->
            if (state.messages.none { it.id == messageId }) {
                state
            } else {
                state.copy(
                    messages = state.messages.map { message ->
                        if (message.id == messageId) {
                            message.copy(reactions = reactions)
                        } else {
                            message
                        }
                    },
                )
            }
        }
    }

    private fun toggleOwnReaction(
        reactions: List<MessageReaction>,
        currentUserId: String,
        emoji: String,
    ): List<MessageReaction> {
        val hasSameReaction = reactions.any { reaction ->
            reaction.userId == currentUserId && reaction.emoji == emoji
        }

        return if (hasSameReaction) {
            reactions.filterNot { reaction ->
                reaction.userId == currentUserId && reaction.emoji == emoji
            }
        } else {
            reactions
                .filterNot { reaction -> reaction.userId == currentUserId }
                .plus(MessageReaction(userId = currentUserId, emoji = emoji))
        }
    }

    override fun onCleared() {
        val conversationId = _uiState.value.selectedConversation?.id
        if (conversationId != null) {
            emitStopTyping(conversationId)
        }
        cancelAllDeliveryJobs()
        super.onCleared()
    }
}
