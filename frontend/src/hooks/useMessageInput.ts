import { useState, useRef, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import type { AudioMeta, Conversation, Message } from "@/types/chat";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { chatService, VOICE_MEMO_TOO_LARGE_ERROR } from "@/services/chatService";
import {
  addVoiceMemoOutboxItem,
  buildVoiceMemoOutboxId,
  type VoiceMemoOutboxItem,
} from "@/lib/voiceMemoOutbox";
import {
  flushVoiceMemoOutbox,
  VOICE_MEMO_OUTBOX_TOAST_ID,
} from "@/lib/voiceMemoDelivery";

export const MAX_FILE_SIZE_MB = 5;
export const MAX_MESSAGE_LENGTH = 1200;
const TYPING_EMIT_INTERVAL_MS = 350;
const MESSAGE_DRAFT_STORAGE_PREFIX = "moji-message-drafts-v1";
const MAX_VOICE_MEMO_DURATION_SECONDS = 180;
const MAX_VOICE_MEMO_UPLOAD_MB = 8;
const AUDIO_UPLOAD_REQUIRES_ONLINE_ERROR = "AUDIO_UPLOAD_REQUIRES_ONLINE";

const VOICE_MEMO_MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

const resolveVoiceMemoMimeType = () => {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  for (const mimeType of VOICE_MEMO_MIME_TYPE_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return "";
};

const isAudioUploadRequiresOnlineError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message === AUDIO_UPLOAD_REQUIRES_ONLINE_ERROR;
};

const isNavigatorOffline = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  return navigator.onLine === false;
};

const isVoiceMemoOutboxLimitError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return /voice memo payload exceeds outbox size limit/i.test(error.message);
};

/**
 * Validates message content before sending
 * Checks for empty messages, length limits, and content quality
 */
const validateMessageBeforeSend = (value: string, imagePreview: string | null, audioPreview: string | null) => {
  const normalizedContent = value.trim();
  const hasContent = normalizedContent.length > 0;
  const hasImage = Boolean(imagePreview);
  const hasAudio = Boolean(audioPreview);
  const hasMediaPayload = hasImage || hasAudio;

  // Check for empty message
  if (!hasContent && !hasMediaPayload) {
    return {
      valid: false,
      error: "Tin nhắn phải có nội dung hoặc phương tiện",
      code: "EMPTY_MESSAGE"
    };
  }

  // Check content length
  if (normalizedContent.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Nội dung vượt quá ${MAX_MESSAGE_LENGTH} ký tự`,
      code: "CONTENT_TOO_LONG",
      currentLength: normalizedContent.length,
      maxLength: MAX_MESSAGE_LENGTH
    };
  }

  // Check for excessive whitespace only
  if (hasContent && /^\s+$/.test(normalizedContent)) {
    return {
      valid: false,
      error: "Tin nhắn không được chỉ chứa khoảng trắng",
      code: "WHITESPACE_ONLY"
    };
  }

  return {
    valid: true,
    error: null,
    code: null
  };
};

type MessageDraftState = {
  value: string;
  imagePreview: string | null;
  audioPreview: string | null;
  audioMeta: AudioMeta | null;
};

type PersistedDraftMap = Record<string, string>;

const readPersistedDraftMap = (storageKey: string): PersistedDraftMap => {
  try {
    const rawValue = globalThis.localStorage.getItem(storageKey);
    if (!rawValue) {
      return {};
    }

    const parsedValue = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== "object") {
      return {};
    }

    return Object.entries(parsedValue).reduce<PersistedDraftMap>(
      (nextDraftMap, [conversationId, draftValue]) => {
        if (
          typeof conversationId === "string" &&
          typeof draftValue === "string" &&
          conversationId.trim()
        ) {
          nextDraftMap[conversationId] = draftValue;
        }

        return nextDraftMap;
      },
      {},
    );
  } catch {
    return {};
  }
};

const writePersistedDraftMap = (
  storageKey: string,
  draftMap: PersistedDraftMap,
) => {
  try {
    if (Object.keys(draftMap).length === 0) {
      globalThis.localStorage.removeItem(storageKey);
      return;
    }

    globalThis.localStorage.setItem(storageKey, JSON.stringify(draftMap));
  } catch {
    // Ignore storage write failures (private mode, quota exceeded, etc.).
  }
};

export function useMessageInput(selectedConvo: Conversation) {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const {
    sendDirectMessage,
    sendGroupMessage,
    replyingTo,
    setReplyingTo,
    activeThreadRootId,
    addMessage,
    removeMessageFromConversation,
  } = useChatStore();
  const { socket } = useSocketStore();

  const [value, setValue] = useState("");
  const [typing, setTyping] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [audioMeta, setAudioMeta] = useState<AudioMeta | null>(null);
  const [focused, setFocused] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingMimeTypeRef = useRef("");
  const recordingCanceledRef = useRef(false);
  const recordingAutoStoppedRef = useRef(false);
  const recordingDurationRef = useRef(0);
  const isUnmountingRef = useRef(false);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmitAtRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef(false);
  const draftByConversationRef = useRef<Record<string, MessageDraftState>>({});
  const persistedDraftTextByConversationRef = useRef<PersistedDraftMap>({});
  const previousConversationIdRef = useRef(String(selectedConvo._id || ""));
  const draftStorageKey = `${MESSAGE_DRAFT_STORAGE_PREFIX}:${String(user?._id || "guest")}`;

  useEffect(() => {
    isUnmountingRef.current = false;
    persistedDraftTextByConversationRef.current =
      readPersistedDraftMap(draftStorageKey);

    return () => {
      isUnmountingRef.current = true;
    };
  }, [draftStorageKey]);

  useEffect(() => {
    recordingDurationRef.current = recordingDuration;
  }, [recordingDuration]);

  const persistDraft = useCallback(
    (
      conversationId: string,
      nextValue: string,
      nextImagePreview: string | null,
      nextAudioPreview?: string | null,
      nextAudioMeta?: AudioMeta | null,
    ) => {
      const normalizedConversationId = String(conversationId || "").trim();
      if (!normalizedConversationId) {
        return;
      }

      const normalizedValue = String(nextValue || "");
      const normalizedImagePreview = nextImagePreview || null;
      const normalizedAudioPreview =
        nextAudioPreview === undefined
          ? audioPreview || null
          : nextAudioPreview || null;
      let normalizedAudioMeta: AudioMeta | null = null;
      if (normalizedAudioPreview !== null) {
        if (nextAudioMeta === undefined) {
          normalizedAudioMeta = audioMeta || null;
        } else {
          normalizedAudioMeta = nextAudioMeta || null;
        }
      }
      const hasDraft = Boolean(
        normalizedValue.trim() || normalizedImagePreview || normalizedAudioPreview,
      );

      if (!hasDraft) {
        delete draftByConversationRef.current[normalizedConversationId];

        if (
          persistedDraftTextByConversationRef.current[normalizedConversationId]
        ) {
          delete persistedDraftTextByConversationRef.current[
            normalizedConversationId
          ];
          writePersistedDraftMap(
            draftStorageKey,
            persistedDraftTextByConversationRef.current,
          );
        }

        return;
      }

      draftByConversationRef.current[normalizedConversationId] = {
        value: normalizedValue,
        imagePreview: normalizedImagePreview,
        audioPreview: normalizedAudioPreview,
        audioMeta: normalizedAudioMeta,
      };

      if (normalizedValue.trim()) {
        persistedDraftTextByConversationRef.current[normalizedConversationId] =
          normalizedValue;
      } else {
        delete persistedDraftTextByConversationRef.current[
          normalizedConversationId
        ];
      }

      writePersistedDraftMap(
        draftStorageKey,
        persistedDraftTextByConversationRef.current,
      );
    },
    [audioMeta, audioPreview, draftStorageKey],
  );

  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const releaseRecordingStream = useCallback(() => {
    const activeStream = recordingStreamRef.current;
    if (!activeStream) {
      return;
    }

    activeStream.getTracks().forEach((track) => {
      track.stop();
    });

    recordingStreamRef.current = null;
  }, []);

  const requestRecorderStop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording" || recorder?.state === "paused") {
      recorder.stop();
    }
  }, []);

  const stopTyping = useCallback(() => {
    if (typing && socket?.connected) {
      socket.emit("stop_typing", selectedConvo._id);
      setTyping(false);
      lastTypingEmitAtRef.current = 0;
    }
  }, [typing, socket, selectedConvo._id]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value.slice(0, MAX_MESSAGE_LENGTH);
    setValue(newValue);
    persistDraft(selectedConvo._id, newValue, imagePreview, audioPreview);

    // Auto-resize textarea
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }

    const now = Date.now();
    const hasText = newValue.trim().length > 0;

    if (!hasText) {
      stopTyping();
    } else if (
      socket?.connected &&
      (!typing || now - lastTypingEmitAtRef.current >= TYPING_EMIT_INTERVAL_MS)
    ) {
      setTyping(true);
      lastTypingEmitAtRef.current = now;
      socket.emit("typing", selectedConvo._id);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 2000);
  };

  const appendEmoji = (emoji: string) => {
    setValue((prev) => {
      const nextValue = `${prev}${emoji}`;
      persistDraft(selectedConvo._id, nextValue, imagePreview, audioPreview);
      return nextValue;
    });
  };

  const setImagePreviewWithDraft = useCallback(
    (nextImagePreview: string | null) => {
      setImagePreview(nextImagePreview);
      persistDraft(selectedConvo._id, value, nextImagePreview, audioPreview);
    },
    [audioPreview, persistDraft, selectedConvo._id, value],
  );

  const setAudioPreviewWithDraft = useCallback(
    (nextAudioPreview: string | null, nextAudioMeta?: AudioMeta | null) => {
      setAudioPreview(nextAudioPreview);
      setAudioMeta(nextAudioPreview ? nextAudioMeta || null : null);
      persistDraft(
        selectedConvo._id,
        value,
        imagePreview,
        nextAudioPreview,
        nextAudioPreview ? nextAudioMeta || null : null,
      );
    },
    [imagePreview, persistDraft, selectedConvo._id, value],
  );

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      lastTypingEmitAtRef.current = 0;

      if (socket?.connected) {
        socket.emit("stop_typing", selectedConvo._id);
      }

      clearRecordingTimer();
      const recorder = mediaRecorderRef.current;
      if (recorder?.state === "recording" || recorder?.state === "paused") {
        recordingCanceledRef.current = true;
        recorder.stop();
      }
      releaseRecordingStream();
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
      recordingMimeTypeRef.current = "";
      recordingAutoStoppedRef.current = false;
    };
  }, [clearRecordingTimer, releaseRecordingStream, socket, selectedConvo._id]);

  // Keep per-conversation drafts instead of resetting on room switch.
  useEffect(() => {
    const nextConversationId = String(selectedConvo._id || "");
    const previousConversationId = previousConversationIdRef.current;

    if (previousConversationId && previousConversationId !== nextConversationId) {
      persistDraft(previousConversationId, value, imagePreview, audioPreview);
      setReplyingTo(null);
    }

    const persistedDraftValue =
      persistedDraftTextByConversationRef.current[nextConversationId] || "";

    const draft = draftByConversationRef.current[nextConversationId] || {
      value: persistedDraftValue,
      imagePreview: null,
      audioPreview: null,
      audioMeta: null,
    };

    setValue(draft.value);
    setImagePreview(draft.imagePreview);
    setAudioPreview(draft.audioPreview);
    setAudioMeta(draft.audioMeta || null);
    setReplyingTo(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const nextHeight = Math.min(textareaRef.current.scrollHeight, 120);
      if (draft.value.trim()) {
        textareaRef.current.style.height = `${Math.max(40, nextHeight)}px`;
      }
    }
    lastTypingEmitAtRef.current = 0;
    setTyping(false);
    previousConversationIdRef.current = nextConversationId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConvo._id]);

  const startRecording = async () => {
    if (isRecording) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      toast.error("Voice recording is not supported on this device.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      toast.error("Voice recording is not supported by this browser.");
      return;
    }

    const supportedMimeType = resolveVoiceMemoMimeType();
    if (!supportedMimeType) {
      toast.error("No supported voice memo format was found.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: supportedMimeType,
      });

      mediaRecorderRef.current = mediaRecorder;
      recordingMimeTypeRef.current = supportedMimeType;
      recordingCanceledRef.current = false;
      recordingAutoStoppedRef.current = false;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        clearRecordingTimer();
        setIsRecording(false);
        setRecordingDuration(0);
        recordingDurationRef.current = 0;
        releaseRecordingStream();
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        recordingMimeTypeRef.current = "";
        recordingCanceledRef.current = false;
        recordingAutoStoppedRef.current = false;

        if (!isUnmountingRef.current) {
          toast.error("Voice memo recording failed. Please try again.");
        }
      };

      mediaRecorder.onstop = () => {
        const shouldDiscard = recordingCanceledRef.current;
        const shouldShowAutoStopToast = recordingAutoStoppedRef.current;
        const mimeType = mediaRecorder.mimeType || recordingMimeTypeRef.current || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const capturedDurationSeconds = Math.max(
          1,
          Math.round(recordingDurationRef.current || 0),
        );

        clearRecordingTimer();
        setIsRecording(false);
        setRecordingDuration(0);
        recordingDurationRef.current = 0;
        releaseRecordingStream();
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        recordingMimeTypeRef.current = "";
        recordingCanceledRef.current = false;
        recordingAutoStoppedRef.current = false;

        if (isUnmountingRef.current || shouldDiscard) {
          return;
        }

        if (!audioBlob.size) {
          toast.error("Voice memo is empty. Please record again.");
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          if (isUnmountingRef.current) {
            return;
          }

          setAudioPreviewWithDraft(reader.result as string, {
            durationSeconds: capturedDurationSeconds,
            mimeType: mimeType || "audio/webm",
            sizeBytes: audioBlob.size,
          });

          if (shouldShowAutoStopToast) {
            toast.info("Voice memo reached 3:00 and was saved.");
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingDurationRef.current = 0;

      clearRecordingTimer();
      recordingTimerRef.current = setInterval(() => {
        const nextDuration = recordingDurationRef.current + 1;
        const boundedDuration = Math.min(
          nextDuration,
          MAX_VOICE_MEMO_DURATION_SECONDS,
        );

        recordingDurationRef.current = boundedDuration;
        setRecordingDuration(boundedDuration);

        if (nextDuration >= MAX_VOICE_MEMO_DURATION_SECONDS) {
          clearRecordingTimer();
          recordingAutoStoppedRef.current = true;
          requestRecorderStop();
        }
      }, 1000);
    } catch (err) {
      console.error("Unable to access microphone", err);
      releaseRecordingStream();
      mediaRecorderRef.current = null;
      recordingMimeTypeRef.current = "";
      recordingCanceledRef.current = false;
      recordingAutoStoppedRef.current = false;
      clearRecordingTimer();

      if (!isUnmountingRef.current) {
        toast.error("Microphone access was denied. Please allow microphone permission.");
      }
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state !== "recording") {
      return;
    }

    recordingCanceledRef.current = false;
    clearRecordingTimer();
    setIsRecording(false);
    recorder.stop();
  };

  const cancelRecording = () => {
    const recorder = mediaRecorderRef.current;
    recordingCanceledRef.current = true;
    recordingAutoStoppedRef.current = false;
    audioChunksRef.current = [];
    clearRecordingTimer();
    setIsRecording(false);
    setRecordingDuration(0);
    recordingDurationRef.current = 0;
    setAudioPreviewWithDraft(null);

    if (recorder?.state === "recording" || recorder?.state === "paused") {
      recorder.stop();
      return;
    }

    recordingCanceledRef.current = false;
    releaseRecordingStream();
    mediaRecorderRef.current = null;
    recordingMimeTypeRef.current = "";
  };

  const removeAudioPreview = () => {
    setAudioPreviewWithDraft(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(
        t("chatComposer.error.image_too_large", { size: MAX_FILE_SIZE_MB }),
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreviewWithDraft(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const validateAudioSizeBeforeUpload = (audioDataUrl: string): { valid: boolean; errorMessage?: string } => {
    const payload = String(audioDataUrl || "").split(",")[1] || "";
    const normalizedPayload = payload.replaceAll(/\s+/g, "");
    if (!normalizedPayload) {
      return { valid: false, errorMessage: "Voice memo is empty" };
    }

    const estimatedBytes = Math.floor((normalizedPayload.length * 3) / 4);
    if (!Number.isFinite(estimatedBytes) || estimatedBytes <= 0) {
      return { valid: false, errorMessage: "Invalid voice memo format" };
    }

    if (estimatedBytes > MAX_VOICE_MEMO_UPLOAD_MB * 1024 * 1024) {
      return { valid: false, errorMessage: `Voice memo exceeds ${MAX_VOICE_MEMO_UPLOAD_MB}MB limit` };
    }

    return { valid: true };
  };

  const resolveOutgoingAudioUrl = async (rawAudioPreview: string | null) => {
    if (!rawAudioPreview) {
      return {
        audioUrl: undefined as string | undefined,
        audioMetaPatch: null as AudioMeta | null,
      };
    }

    if (!rawAudioPreview.startsWith("data:audio/")) {
      return {
        audioUrl: rawAudioPreview,
        audioMetaPatch: null as AudioMeta | null,
      };
    }

    const sizeValidation = validateAudioSizeBeforeUpload(rawAudioPreview);
    if (!sizeValidation.valid) {
      throw new Error(sizeValidation.errorMessage || "Voice memo validation failed");
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new Error(AUDIO_UPLOAD_REQUIRES_ONLINE_ERROR);
    }

    const uploadResult = await chatService.uploadAudio(rawAudioPreview);
    return {
      audioUrl: uploadResult.audioUrl,
      audioMetaPatch: {
        mimeType: uploadResult.audioMeta?.mimeType ?? null,
        sizeBytes: uploadResult.audioMeta?.sizeBytes ?? null,
      },
    };
  };

  const restoreComposerAfterSendFailure = (
    failedValue: string,
    failedImagePreview: string | null,
    failedAudioPreview: string | null,
    failedAudioMeta?: AudioMeta | null,
  ) => {
    setValue(failedValue);
    setImagePreview(failedImagePreview);
    setAudioPreview(failedAudioPreview);
    setAudioMeta(failedAudioPreview ? failedAudioMeta ?? null : null);
    persistDraft(
      selectedConvo._id,
      failedValue,
      failedImagePreview ?? null,
      failedAudioPreview,
      failedAudioPreview ? failedAudioMeta ?? null : null,
    );

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const nextHeight = Math.min(textareaRef.current.scrollHeight, 120);
      textareaRef.current.style.height = `${Math.max(40, nextHeight)}px`;
    }
  };

  const sendMessageToConversation = async ({
    content,
    imageUrl,
    audioUrl,
    audioMeta: nextAudioMeta,
    replyToId,
  }: {
    content: string;
    imageUrl?: string;
    audioUrl?: string;
    audioMeta?: AudioMeta | null;
    replyToId?: string;
  }) => {
    if (selectedConvo.type === "direct") {
      const otherUser = selectedConvo.participants.find(
        (participant) => String(participant._id) !== String(user?._id),
      );

      if (!otherUser) {
        throw new Error("DIRECT_RECIPIENT_NOT_FOUND");
      }

      await sendDirectMessage(
        otherUser._id,
        content,
        imageUrl,
        audioUrl,
        selectedConvo._id,
        {
          replyTo: replyToId,
          threadRootId: activeThreadRootId || undefined,
          audioMeta: nextAudioMeta || undefined,
        },
      );
      return;
    }

    await sendGroupMessage(
      selectedConvo._id,
      content,
      imageUrl,
      audioUrl,
      {
        replyTo: replyToId,
        groupChannelId: selectedConvo.group?.activeChannelId,
        threadRootId: activeThreadRootId || undefined,
        audioMeta: nextAudioMeta || undefined,
      },
    );
  };

  const resolveSelectedDirectRecipientId = useCallback(() => {
    if (selectedConvo.type !== "direct") {
      return "";
    }

    const currentUserId = String(user?._id || "");
    const otherUser = selectedConvo.participants.find(
      (participant) => String(participant._id) !== currentUserId,
    );

    return String(otherUser?._id || "").trim();
  }, [selectedConvo, user?._id]);

  const queueVoiceMemoForDeferredDelivery = useCallback(
    async ({
      content,
      imgUrl,
      audioDataUrl,
      audioMeta: nextAudioMeta,
      replyToId,
      queuedAt,
      clientMessageId,
    }: {
      content: string;
      imgUrl: string | null;
      audioDataUrl: string;
      audioMeta?: AudioMeta | null;
      replyToId?: string;
      queuedAt: string;
      clientMessageId?: string;
    }) => {
      const normalizedUserId = String(user?._id || "").trim();
      const normalizedConversationId = String(selectedConvo._id || "").trim();

      if (!normalizedUserId || !normalizedConversationId) {
        throw new Error("Unable to queue voice memo while offline");
      }

      const outboxId = String(clientMessageId || buildVoiceMemoOutboxId()).trim();
      if (!outboxId) {
        throw new Error("Unable to queue voice memo with empty id");
      }

      const isOnlineNow = !isNavigatorOffline();
      const replyPreview = replyToId
        ? {
            _id: replyToId,
            content: String(replyingTo?.content || ""),
            senderId: String(replyingTo?.senderId || ""),
            senderDisplayName: replyingTo?.senderDisplayName,
          }
        : null;
      const activeGroupChannelId =
        selectedConvo.type === "group"
          ? String(
              selectedConvo.group?.activeChannelId ||
                selectedConvo.group?.channels?.[0]?.channelId ||
                "general",
            )
          : null;

      const optimisticMessage: Message = {
        _id: outboxId,
        conversationId: normalizedConversationId,
        groupChannelId: activeGroupChannelId || undefined,
        senderId: normalizedUserId,
        content: content ?? "",
        imgUrl: imgUrl ?? null,
        audioUrl: audioDataUrl,
        audioMeta: nextAudioMeta ?? null,
        replyTo: replyPreview,
        threadRootId: activeThreadRootId || null,
        reactions: [],
        isDeleted: false,
        editedAt: null,
        readBy: [],
        hiddenFor: [],
        createdAt: queuedAt,
        updatedAt: queuedAt,
        isOwn: true,
        deliveryState: isOnlineNow ? "uploading" : "queued",
        deliveryError: null,
        deliveryAttemptCount: 0,
      };

      addMessage(optimisticMessage);

      const baseOutboxItem: VoiceMemoOutboxItem = {
        id: outboxId,
        userId: normalizedUserId,
        scope: selectedConvo.type === "direct" ? "direct" : "group",
        conversationId: normalizedConversationId,
        content,
        imgUrl: imgUrl ?? undefined,
        audioDataUrl,
        audioDurationSeconds: nextAudioMeta?.durationSeconds ?? null,
        audioMimeType: nextAudioMeta?.mimeType ?? null,
        audioSizeBytes: nextAudioMeta?.sizeBytes ?? null,
        replyToId,
        threadRootId: activeThreadRootId || undefined,
        queuedAt,
        attemptCount: 0,
        lastError: null,
      };

      try {
        if (selectedConvo.type === "direct") {
          const directRecipientId = resolveSelectedDirectRecipientId();
          if (!directRecipientId) {
            throw new Error("DIRECT_RECIPIENT_NOT_FOUND");
          }

          await addVoiceMemoOutboxItem({
            ...baseOutboxItem,
            recipientId: directRecipientId,
          });
        } else {
          await addVoiceMemoOutboxItem({
            ...baseOutboxItem,
            groupChannelId: activeGroupChannelId || undefined,
          });
        }
      } catch (error) {
        removeMessageFromConversation(normalizedConversationId, outboxId);
        throw error;
      }

      setReplyingTo(null);
      stopTyping();

      if (isOnlineNow) {
        void flushVoiceMemoOutbox({ silent: true });
      } else {
        toast.info("Voice memo queued. It will send when you are back online.", {
          id: VOICE_MEMO_OUTBOX_TOAST_ID,
        });
      }
    },
    [
      activeThreadRootId,
      addMessage,
      flushVoiceMemoOutbox,
      removeMessageFromConversation,
      replyingTo?.content,
      replyingTo?.senderDisplayName,
      replyingTo?.senderId,
      resolveSelectedDirectRecipientId,
      selectedConvo._id,
      selectedConvo.group?.activeChannelId,
      selectedConvo.group?.channels,
      selectedConvo.type,
      setReplyingTo,
      stopTyping,
      user?._id,
    ],
  );

  useEffect(() => {
    void flushVoiceMemoOutbox({ silent: true });
  }, [user?._id]);

  useEffect(() => {
    const handleOnline = () => {
      void flushVoiceMemoOutbox();
    };

    const handleWindowFocus = () => {
      void flushVoiceMemoOutbox({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (globalThis.document?.visibilityState === "visible") {
        void flushVoiceMemoOutbox({ silent: true });
      }
    };

    globalThis.window?.addEventListener("online", handleOnline);
    globalThis.window?.addEventListener("focus", handleWindowFocus);
    globalThis.document?.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      globalThis.window?.removeEventListener("online", handleOnline);
      globalThis.window?.removeEventListener("focus", handleWindowFocus);
      globalThis.document?.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const sendMessage = async () => { // NOSONAR
    if (isSendingRef.current || !user) return;
    if (isRecording) {
      toast.error("Kết thúc ghi âm trước khi gửi.", { duration: 3 });
      return;
    }

    // Validate message before attempting to send
    const validation = validateMessageBeforeSend(value, imagePreview, audioPreview);
    if (!validation.valid) {
      toast.error(validation.error, { duration: 4 });
      return;
    }

    const trimmed = value.trim();

    isSendingRef.current = true;

    const currValue = trimmed;
    const currImage = imagePreview;
    const currAudio = audioPreview;
    const currAudioMeta = audioMeta;
    setValue("");
    setImagePreview(null);
    setAudioPreview(null);
    setAudioMeta(null);
    persistDraft(selectedConvo._id, "", null, null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const queuedAt = new Date().toISOString();
      const replyToId = String(replyingTo?._id || "").trim() || undefined;

      const hasVoiceMemoPayload = Boolean(
        currAudio?.startsWith("data:audio/"),
      );

      if (hasVoiceMemoPayload) {
        const sizeValidation = validateAudioSizeBeforeUpload(currAudio as string);
        if (!sizeValidation.valid) {
          throw new Error(sizeValidation.errorMessage || "Voice memo validation failed");
        }

        await queueVoiceMemoForDeferredDelivery({
          content: currValue,
          imgUrl: currImage,
          audioDataUrl: currAudio as string,
          audioMeta: currAudioMeta,
          replyToId,
          queuedAt,
        });
        return;
      }

      const uploadResolution = await resolveOutgoingAudioUrl(currAudio);
      const resolvedAudioUrl = uploadResolution.audioUrl;
      let resolvedAudioMeta = currAudioMeta;
      if (uploadResolution.audioMetaPatch) {
        // Preserve client durationSeconds (server doesn't calculate it).
        // Server provides: mimeType, sizeBytes. Client provides: durationSeconds.
        // Canonical audioMeta = server values + client durationSeconds.
        resolvedAudioMeta = resolvedAudioMeta
          ? {
              durationSeconds: resolvedAudioMeta.durationSeconds,
              ...uploadResolution.audioMetaPatch,
            }
          : uploadResolution.audioMetaPatch;
      }

      await sendMessageToConversation({
        content: currValue,
        imageUrl: currImage ?? undefined,
        audioUrl: resolvedAudioUrl,
        audioMeta: resolvedAudioMeta,
        replyToId,
      });

      setReplyingTo(null);
      stopTyping();
    } catch (error) {
      restoreComposerAfterSendFailure(currValue, currImage, currAudio, currAudioMeta);

      if (isAudioUploadRequiresOnlineError(error)) {
        toast.error("Voice memo needs internet to upload before sending.");
      } else if (isVoiceMemoOutboxLimitError(error)) {
        toast.error("Voice memo is too large to queue offline. Please record a shorter memo.");
      } else if (error instanceof Error && error.message === VOICE_MEMO_TOO_LARGE_ERROR) {
        toast.error(`Voice memo exceeds ${MAX_VOICE_MEMO_UPLOAD_MB}MB. Please record a shorter one.`);
      } else if (error instanceof Error && /exceeds|too large/i.test(error.message)) {
        toast.error(error.message);
      } else {
        toast.error(t("chatComposer.error.send_failed"));
      }
    } finally {
      isSendingRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage().catch((error) => {
        console.error("Failed to send message", error);
      });
    }
  };

  const hasSendable = value.trim() || imagePreview || audioPreview;
  const charsLeft = MAX_MESSAGE_LENGTH - value.length;

  return {
    value,
    focused,
    setFocused,
    imagePreview,
    setImagePreview: setImagePreviewWithDraft,
    replyingTo,
    setReplyingTo,
    textareaRef,
    fileInputRef,
    handleChange,
    handleFileChange,
    handleKeyDown,
    sendMessage,
    appendEmoji,
    hasSendable,
    charsLeft,

    audioPreview,
    isRecording,
    recordingDuration,
    recordingStream: recordingStreamRef.current,
    startRecording,
    stopRecording,
    cancelRecording,
    removeAudioPreview,
  };
}
