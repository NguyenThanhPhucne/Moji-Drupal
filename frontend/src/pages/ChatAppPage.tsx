import ChatWindowLayout from "@/components/chat/ChatWindowLayout";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useChatStore } from "@/stores/useChatStore";
import { useEffect } from "react";

const ChatAppPage = () => {
  const { activeConversationId, setActiveConversation } = useChatStore();

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

      <div className="app-shell-bg">
        <div className="relative z-10 flex h-full w-full">
          <ChatWindowLayout />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ChatAppPage;
