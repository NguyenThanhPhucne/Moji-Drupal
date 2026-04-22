import { toast } from "sonner";
import { chatService } from "@/services/chatService";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import {
  listVoiceMemoOutboxItemsByUser,
  MAX_VOICE_MEMO_OUTBOX_ATTEMPTS,
  markVoiceMemoOutboxItemFailed,
  removeVoiceMemoOutboxItem,
  type VoiceMemoOutboxItem,
} from "@/lib/voiceMemoOutbox";

export const VOICE_MEMO_OUTBOX_TOAST_ID = "voice-memo-outbox";

let isVoiceMemoOutboxFlushRunning = false;

const isNavigatorOffline = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  return navigator.onLine === false;
};

export const isLikelyVoiceMemoOfflineError = (error: unknown) => {
  if (isNavigatorOffline()) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /(network error|offline|failed to fetch|network request failed|ecconn|enotfound)/i.test(
    error.message,
  );
};

const isRetryEligibleNow = (item: VoiceMemoOutboxItem) => {
  const nextRetryAtTs = item.nextRetryAt
    ? new Date(item.nextRetryAt).getTime()
    : 0;

  if (!nextRetryAtTs || !Number.isFinite(nextRetryAtTs)) {
    return true;
  }

  return nextRetryAtTs <= Date.now();
};

const sendQueuedVoiceMemoItem = async ({
  item,
  uploadedAudioUrl,
}: {
  item: VoiceMemoOutboxItem;
  uploadedAudioUrl: string;
}) => {
  const normalizedAudioUrl = String(uploadedAudioUrl || "").trim();
  if (!normalizedAudioUrl) {
    throw new Error("Voice memo upload returned no audio URL");
  }

  const chatStore = useChatStore.getState();

  if (item.scope === "direct") {
    const normalizedRecipientId = String(item.recipientId || "").trim();
    if (!normalizedRecipientId) {
      throw new Error("Voice memo recipient is missing");
    }

    await chatStore.sendDirectMessage(
      normalizedRecipientId,
      item.content,
      item.imgUrl || undefined,
      normalizedAudioUrl,
      item.conversationId || undefined,
      item.replyToId || undefined,
      item.threadRootId || undefined,
    );

    return;
  }

  const normalizedConversationId = String(item.conversationId || "").trim();
  if (!normalizedConversationId) {
    throw new Error("Voice memo conversation is missing");
  }

  await chatStore.sendGroupMessage(
    normalizedConversationId,
    item.content,
    item.imgUrl || undefined,
    normalizedAudioUrl,
    item.replyToId || undefined,
    item.groupChannelId || undefined,
    item.threadRootId || undefined,
  );
};

type VoiceMemoFlushItemResult =
  | "delivered"
  | "failed"
  | "exhausted"
  | "skipped"
  | "halt-offline";

const processQueuedVoiceMemoItem = async (
  item: VoiceMemoOutboxItem,
): Promise<VoiceMemoFlushItemResult> => {
  if (isNavigatorOffline()) {
    return "halt-offline";
  }

  if (!isRetryEligibleNow(item)) {
    return "skipped";
  }

  if (Number(item.attemptCount || 0) >= MAX_VOICE_MEMO_OUTBOX_ATTEMPTS) {
    return "exhausted";
  }

  try {
    const uploadResult = await chatService.uploadAudio(item.audioDataUrl);
    const uploadedAudioUrl = String(uploadResult.audioUrl || "").trim();
    if (!uploadedAudioUrl) {
      throw new Error("Voice memo upload returned empty URL");
    }

    await sendQueuedVoiceMemoItem({
      item,
      uploadedAudioUrl,
    });

    await removeVoiceMemoOutboxItem(item.id);
    return "delivered";
  } catch (error) {
    if (isLikelyVoiceMemoOfflineError(error)) {
      return "halt-offline";
    }

    await markVoiceMemoOutboxItemFailed({
      item,
      errorMessage:
        error instanceof Error ? error.message : "Voice memo outbox send failed",
    });

    return "failed";
  }
};

const notifyVoiceMemoFlushSummary = ({
  silent,
  deliveredCount,
  failedCount,
  exhaustedCount,
}: {
  silent: boolean;
  deliveredCount: number;
  failedCount: number;
  exhaustedCount: number;
}) => {
  if (silent) {
    return;
  }

  if (deliveredCount > 0) {
    toast.success(
      deliveredCount === 1
        ? "Queued voice memo sent."
        : `${deliveredCount} queued voice memos sent.`,
      {
        id: VOICE_MEMO_OUTBOX_TOAST_ID,
      },
    );
  }

  if (deliveredCount === 0 && failedCount > 0) {
    toast.error(
      failedCount === 1
        ? "A queued voice memo could not be delivered."
        : `${failedCount} queued voice memos could not be delivered.`,
      {
        id: VOICE_MEMO_OUTBOX_TOAST_ID,
      },
    );
  }

  if (exhaustedCount > 0) {
    toast.error(
      exhaustedCount === 1
        ? "A queued voice memo reached retry limit."
        : `${exhaustedCount} queued voice memos reached retry limit.`,
      {
        id: VOICE_MEMO_OUTBOX_TOAST_ID,
      },
    );
  }
};

export const flushVoiceMemoOutbox = async ({
  silent = false,
}: {
  silent?: boolean;
} = {}) => {
  const normalizedUserId = String(useAuthStore.getState().user?._id || "").trim();

  if (!normalizedUserId || isNavigatorOffline() || isVoiceMemoOutboxFlushRunning) {
    return;
  }

  isVoiceMemoOutboxFlushRunning = true;

  try {
    const queuedItems = await listVoiceMemoOutboxItemsByUser(normalizedUserId);
    if (!queuedItems.length) {
      return;
    }

    let deliveredCount = 0;
    let failedCount = 0;
    let exhaustedCount = 0;

    for (const item of queuedItems) {
      const itemResult = await processQueuedVoiceMemoItem(item);

      if (itemResult === "halt-offline") {
        break;
      }
      if (itemResult === "delivered") {
        deliveredCount += 1;
        continue;
      }
      if (itemResult === "failed") {
        failedCount += 1;
        continue;
      }
      if (itemResult === "exhausted") {
        exhaustedCount += 1;
      }
    }

    notifyVoiceMemoFlushSummary({
      silent,
      deliveredCount,
      failedCount,
      exhaustedCount,
    });
  } finally {
    isVoiceMemoOutboxFlushRunning = false;
  }
};