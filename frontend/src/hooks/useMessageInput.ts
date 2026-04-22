import { useState, useRef, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import type { Conversation } from "@/types/chat";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const MAX_FILE_SIZE_MB = 5;
export const MAX_MESSAGE_LENGTH = 1200;
const TYPING_EMIT_INTERVAL_MS = 350;
const MESSAGE_DRAFT_STORAGE_PREFIX = "moji-message-drafts-v1";

type MessageDraftState = {
  value: string;
  imagePreview: string | null;
  audioPreview: string | null;
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
  const { sendDirectMessage, sendGroupMessage, replyingTo, setReplyingTo } = useChatStore();
  const { socket } = useSocketStore();

  const [value, setValue] = useState("");
  const [typing, setTyping] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    persistedDraftTextByConversationRef.current =
      readPersistedDraftMap(draftStorageKey);
  }, [draftStorageKey]);

  const persistDraft = useCallback(
    (conversationId: string, nextValue: string, nextImagePreview: string | null) => {
      const normalizedConversationId = String(conversationId || "").trim();
      if (!normalizedConversationId) {
        return;
      }

      const normalizedValue = String(nextValue || "");
      const normalizedImagePreview = nextImagePreview || null;
      const normalizedAudioPreview = audioPreview || null;
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
    [draftStorageKey],
  );

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
    persistDraft(selectedConvo._id, newValue, imagePreview);

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
      persistDraft(selectedConvo._id, nextValue, imagePreview);
      return nextValue;
    });
  };

  const setImagePreviewWithDraft = useCallback(
    (nextImagePreview: string | null) => {
      setImagePreview(nextImagePreview);
      persistDraft(selectedConvo._id, value, nextImagePreview);
    },
    [persistDraft, selectedConvo._id, value],
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
    };
  }, [socket, selectedConvo._id]);

  // Keep per-conversation drafts instead of resetting on room switch.
  useEffect(() => {
    const nextConversationId = String(selectedConvo._id || "");
    const previousConversationId = previousConversationIdRef.current;

    if (previousConversationId && previousConversationId !== nextConversationId) {
      persistDraft(previousConversationId, value, imagePreview);
      setReplyingTo(null);
    }

    const persistedDraftValue =
      persistedDraftTextByConversationRef.current[nextConversationId] || "";

    const draft = draftByConversationRef.current[nextConversationId] || {
      value: persistedDraftValue,
      imagePreview: null,
    };

    setValue(draft.value);
    setImagePreview(draft.imagePreview);
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          setAudioPreview(reader.result as string);
        };
        reader.readAsDataURL(audioBlob);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Lỗi khi truy cập microphone", err);
      toast.error("Không thể truy cập microphone. Vui lòng cấp quyền.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setAudioPreview(null);
      audioChunksRef.current = [];
    }
  };

  const removeAudioPreview = () => {
    setAudioPreview(null);
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

  const sendMessage = async () => {
    if (isSendingRef.current || !user) return;
    const trimmed = value.trim();
    if (!trimmed && !imagePreview && !audioPreview) return;

    isSendingRef.current = true;

    const currValue = trimmed;
    const currImage = imagePreview;
    const currAudio = audioPreview;
    setValue("");
    setImagePreview(null);
    setAudioPreview(null);
    persistDraft(selectedConvo._id, "", null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      if (selectedConvo.type === "direct") {
        const otherUser = selectedConvo.participants.find(
          (p) => String(p._id) !== String(user._id),
        );
        if (!otherUser) return;
        await sendDirectMessage(
          otherUser._id,
          currValue,
          currImage ?? undefined,
          currAudio ?? undefined,
          selectedConvo._id,
          replyingTo?._id,
        );
      } else {
        await sendGroupMessage(
          selectedConvo._id,
          currValue,
          currImage ?? undefined,
          currAudio ?? undefined,
          replyingTo?._id,
          selectedConvo.group?.activeChannelId,
        );
      }
      setReplyingTo(null);
      stopTyping();
    } catch {
      setValue(currValue);
      setImagePreview(currImage);
      setAudioPreview(currAudio);
      persistDraft(selectedConvo._id, currValue, currImage ?? null);

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        const nextHeight = Math.min(textareaRef.current.scrollHeight, 120);
        textareaRef.current.style.height = `${Math.max(40, nextHeight)}px`;
      }

      toast.error(t("chatComposer.error.send_failed"));
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
    startRecording,
    stopRecording,
    cancelRecording,
    removeAudioPreview,
  };
}
