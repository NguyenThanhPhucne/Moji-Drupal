package com.moji.mobile.feature.social.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.moji.mobile.core.model.SocialPost
import com.moji.mobile.core.realtime.SocialRealtimeEvent
import com.moji.mobile.core.realtime.SocketManager
import com.moji.mobile.feature.social.data.SocialRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SocialUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val posts: List<SocialPost> = emptyList(),
)

@HiltViewModel
class SocialViewModel @Inject constructor(
    private val socialRepository: SocialRepository,
    private val socketManager: SocketManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SocialUiState())
    val uiState: StateFlow<SocialUiState> = _uiState.asStateFlow()

    init {
        observeRealtime()
        refresh()
    }

    private fun observeRealtime() {
        viewModelScope.launch {
            socketManager.socialEvents.collect { event ->
                when (event) {
                    is SocialRealtimeEvent.PostCreated -> {
                        _uiState.update { state ->
                            if (state.posts.any { it.id == event.post.id }) {
                                state
                            } else {
                                state.copy(posts = listOf(event.post) + state.posts)
                            }
                        }
                    }

                    is SocialRealtimeEvent.PostUpdated -> {
                        _uiState.update { state ->
                            state.copy(
                                posts = state.posts.map { currentPost ->
                                    if (currentPost.id == event.post.id) {
                                        event.post
                                    } else {
                                        currentPost
                                    }
                                },
                            )
                        }
                    }

                    is SocialRealtimeEvent.PostDeleted -> {
                        _uiState.update { state ->
                            state.copy(posts = state.posts.filterNot { it.id == event.postId })
                        }
                    }

                    is SocialRealtimeEvent.LikeUpdated -> {
                        _uiState.update { state ->
                            state.copy(
                                posts = state.posts.map { post ->
                                    if (post.id == event.payload.postId) {
                                        post.copy(likesCount = event.payload.likesCount)
                                    } else {
                                        post
                                    }
                                },
                            )
                        }
                    }

                    is SocialRealtimeEvent.CommentAdded -> {
                        _uiState.update { state ->
                            val commentsCount = event.payload.commentsCount
                            if (commentsCount == null) {
                                state
                            } else {
                                state.copy(
                                    posts = state.posts.map { post ->
                                        if (post.id == event.payload.postId) {
                                            post.copy(commentsCount = commentsCount)
                                        } else {
                                            post
                                        }
                                    },
                                )
                            }
                        }
                    }

                    is SocialRealtimeEvent.CommentDeleted -> {
                        _uiState.update { state ->
                            val commentsCount = event.payload.commentsCount
                            if (commentsCount == null) {
                                state
                            } else {
                                state.copy(
                                    posts = state.posts.map { post ->
                                        if (post.id == event.payload.postId) {
                                            post.copy(commentsCount = commentsCount)
                                        } else {
                                            post
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            val result = socialRepository.getHomeFeed()
            result
                .onSuccess { posts ->
                    _uiState.update { it.copy(loading = false, posts = posts) }
                }
                .onFailure { throwable ->
                    _uiState.update {
                        it.copy(
                            loading = false,
                            error = throwable.message ?: "Cannot load social feed",
                        )
                    }
                }
        }
    }
}
