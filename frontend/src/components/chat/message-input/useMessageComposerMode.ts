import { useMemo } from "react";
import type { Conversation } from "@/types/chat";
import { useI18n } from "@/lib/i18n";

interface UseMessageComposerModeArgs {
  selectedConvo: Conversation;
  currentUserId: string;
  hasSendableMessage: boolean;
}

const resolveActiveGroupChannelName = (conversation: Conversation) => {
  const activeChannelId = String(
    conversation.group?.activeChannelId ||
      conversation.group?.channels?.[0]?.channelId ||
      "general",
  );

  return (
    conversation.group?.channels?.find(
      (channel) => String(channel.channelId) === activeChannelId,
    )?.name || "general"
  );
};

const resolveComposerPlaceholder = ({
  canSendInCurrentMode,
  isGroupConversation,
  activeGroupChannelName,
  t,
}: {
  canSendInCurrentMode: boolean;
  isGroupConversation: boolean;
  activeGroupChannelName: string;
  t: ReturnType<typeof useI18n>["t"];
}) => {
  if (!canSendInCurrentMode) {
    return t("chatComposer.placeholder.announcement_only");
  }

  if (isGroupConversation) {
    return t("chatComposer.placeholder.group", {
      channel: activeGroupChannelName,
    });
  }

  return t("chatComposer.placeholder.direct");
};

const resolveComposerModeLabel = (
  announcementOnly: boolean,
  canSendInCurrentMode: boolean,
  t: ReturnType<typeof useI18n>["t"],
) => {
  if (!announcementOnly) {
    return t("chatComposer.mode.realtime");
  }

  if (canSendInCurrentMode) {
    return t("chatComposer.mode.announcement_admin");
  }

  return t("chatComposer.mode.announcement");
};

const resolveSendButtonToneClass = (
  canSendInCurrentMode: boolean,
  hasSendableMessage: boolean,
) => {
  if (canSendInCurrentMode && hasSendableMessage) {
    return "chat-composer-send-tone chat-composer-send-tone--ready";
  }

  if (canSendInCurrentMode) {
    return "chat-composer-send-tone chat-composer-send-tone--idle";
  }

  return "chat-composer-send-tone chat-composer-send-tone--disabled";
};

export const useMessageComposerMode = ({
  selectedConvo,
  currentUserId,
  hasSendableMessage,
}: UseMessageComposerModeArgs) => {
  const { t } = useI18n();

  return useMemo(() => {
    const isGroupConversation = selectedConvo.type === "group";
    const isGroupCreator =
      isGroupConversation &&
      String(selectedConvo.group?.createdBy || "") === currentUserId;
    const isGroupAdmin =
      isGroupConversation &&
      ((selectedConvo.group?.adminIds || []).map(String).includes(currentUserId) ||
        isGroupCreator);
    const activeGroupChannelName = isGroupConversation
      ? resolveActiveGroupChannelName(selectedConvo)
      : "";
    const announcementOnly =
      isGroupConversation && Boolean(selectedConvo.group?.announcementOnly);
    const canSendInCurrentMode = !announcementOnly || isGroupAdmin;
    const composerPlaceholder = resolveComposerPlaceholder({
      canSendInCurrentMode,
      isGroupConversation,
      activeGroupChannelName,
      t,
    });
    const composerContextLabel = isGroupConversation
      ? `#${activeGroupChannelName}`
      : t("chatComposer.context.direct");
    const composerModeLabel = resolveComposerModeLabel(
      announcementOnly,
      canSendInCurrentMode,
      t,
    );
    const sendDisabled = !hasSendableMessage || !canSendInCurrentMode;
    const sendButtonToneClass = resolveSendButtonToneClass(
      canSendInCurrentMode,
      hasSendableMessage,
    );

    return {
      isGroupAdmin,
      announcementOnly,
      canSendInCurrentMode,
      composerPlaceholder,
      composerContextLabel,
      composerModeLabel,
      sendDisabled,
      sendButtonToneClass,
    };
  }, [currentUserId, hasSendableMessage, selectedConvo, t]);
};