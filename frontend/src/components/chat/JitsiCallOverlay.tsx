import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { JitsiMeeting } from "@jitsi/react-sdk";
import { X, Loader2 } from "lucide-react";

export default function JitsiCallOverlay() {
  const { isCallActive, activeConversationId, setIsCallActive } = useChatStore();
  const { user } = useAuthStore();

  if (!isCallActive || !activeConversationId) {
    return null;
  }

  // Generate a predictable but unique room name for this conversation
  const roomName = `MojiChat-Room-${activeConversationId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const displayName = user?.displayName || "MojiChat User";
  const userEmail = user?.email || "";

  const handleClose = () => {
    setIsCallActive(false);
  };

  return (
    <div className="absolute inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Header bar to allow closing if Jitsi SDK gets stuck */}
      <div className="flex h-12 w-full items-center justify-between px-4 bg-background border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium">Ongoing Call</span>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
          title="End Call & Close Overlay"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Jitsi Meeting Container */}
      <div className="relative flex-1 w-full h-full bg-black/5">
        <JitsiMeeting
          domain="meet.jit.si"
          roomName={roomName}
          configOverwrite={{
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableModeratorIndicator: true,
            startScreenSharing: false,
            enableEmailInStats: false,
            prejoinPageEnabled: false, // Skip prejoin page for faster connection
          }}
          interfaceConfigOverwrite={{
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            BRAND_WATERMARK_LINK: "",
            SHOW_POWERED_BY: false,
          }}
          userInfo={{
            displayName: displayName,
            email: userEmail,
          }}
          onApiReady={(externalApi) => {
            // Optional: Listen to events from the Jitsi iframe
            externalApi.addListener("videoConferenceLeft", () => {
              setIsCallActive(false);
            });
          }}
          getIFrameRef={(iframeRef) => {
            iframeRef.style.height = "100%";
            iframeRef.style.width = "100%";
            iframeRef.style.border = "none";
          }}
          spinner={() => (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground animate-pulse">Connecting to secure call server...</p>
            </div>
          )}
        />
      </div>
    </div>
  );
}
