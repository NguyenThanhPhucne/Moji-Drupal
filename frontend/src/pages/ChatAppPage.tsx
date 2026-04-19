import ChatWindowLayout from "@/components/chat/ChatWindowLayout";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import GlobalSearchDialog from "@/components/chat/GlobalSearchDialog";
import { useChatStore } from "@/stores/useChatStore";
import { useEffect, useRef } from "react";

const ChatAppPage = () => {
  const {
    activeConversationId,
    setActiveConversation,
    conversations,
    convoLoading,
    fetchConversations,
  } = useChatStore();
  const didBootstrapConversationsRef = useRef(false);
  const activeSyncAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    if (didBootstrapConversationsRef.current || convoLoading) {
      return;
    }

    if (conversations.length > 0) {
      didBootstrapConversationsRef.current = true;
      return;
    }

    didBootstrapConversationsRef.current = true;
    fetchConversations().catch((error) => {
      console.error("Error bootstrapping conversations on chat route:", error);
    });
  }, [conversations.length, convoLoading, fetchConversations]);

  useEffect(() => {
    const targetConversationId = String(activeConversationId || "").trim();

    if (!targetConversationId || convoLoading) {
      activeSyncAttemptRef.current = null;
      return;
    }

    const hasTargetConversation = conversations.some(
      (conversation) => String(conversation._id) === targetConversationId,
    );

    if (hasTargetConversation) {
      activeSyncAttemptRef.current = null;
      return;
    }

    if (activeSyncAttemptRef.current === targetConversationId) {
      return;
    }

    activeSyncAttemptRef.current = targetConversationId;

    fetchConversations()
      .catch((error) => {
        console.error(
          "Error syncing active conversation on chat route:",
          error,
        );
      })
      .finally(() => {
        if (activeSyncAttemptRef.current === targetConversationId) {
          activeSyncAttemptRef.current = null;
        }
      });
  }, [activeConversationId, conversations, convoLoading, fetchConversations]);



  useEffect(() => {
    const handleOutsideCardClick = (event: MouseEvent) => {
      if (!activeConversationId) {
        return;
      }

      const target = event.target as Element | null;
      if (!target) {
        return;
      }

      const clickedInsideSidebar = target.closest("[data-chat-sidebar='true']");

      // Only reset when clicking in sidebar area.
      if (!clickedInsideSidebar) {
        return;
      }

      // Keep selected conversation when user interacts with actionable controls.
      if (
        target.closest(
          "button, a, input, textarea, select, label, [role='button'], [role='menuitem']",
        )
      ) {
        return;
      }

      // Keep selected conversation when clicking on a conversation card.
      if (target.closest("[data-chat-card='true']")) {
        return;
      }

      // Keep selected conversation for theme toggle and other explicit controls.
      if (target.closest("[data-keep-chat-open='true']")) {
        return;
      }

      setActiveConversation(null);
    };

    document.addEventListener("mousedown", handleOutsideCardClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideCardClick);
    };
  }, [activeConversationId, setActiveConversation]);

  return (
    <SidebarProvider>
      <AppSidebar />
      {/* GlobalSearchDialog mounted at page level — always handles Ctrl+K */}
      <GlobalSearchDialog globalOnly />

      <div className="app-shell-bg">
        <div className="relative z-10 flex h-full w-full">
          <ChatWindowLayout />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ChatAppPage;
