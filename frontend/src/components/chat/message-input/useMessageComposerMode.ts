import { useMemo } from "react";
import type { Conversation } from "@/types/chat";

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
}: {
  canSendInCurrentMode: boolean;
  isGroupConversation: boolean;
  activeGroupChannelName: string;
}) => {
  if (!canSendInCurrentMode) {
    return "Only admins can send messages in announcement mode";
  }

  if (isGroupConversation) {
    return `Message #${activeGroupChannelName}`;
  }

  return "Aa";
};

const resolveComposerModeLabel = (
  announcementOnly: boolean,
  canSendInCurrentMode: boolean,
) => {
  if (!announcementOnly) {
    return "Realtime mode";
  }

  if (canSendInCurrentMode) {
    return "Announcement mode (admin)";
  }

  return "Announcement mode";
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
    });
    const composerContextLabel = isGroupConversation
      ? `#${activeGroupChannelName}`
      : "Direct message";
    const composerModeLabel = resolveComposerModeLabel(
      announcementOnly,
      canSendInCurrentMode,
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
  }, [currentUserId, hasSendableMessage, selectedConvo]);
};