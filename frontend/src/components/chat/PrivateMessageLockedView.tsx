import { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { userService } from "@/services/userService";
import { useChatStore } from "@/stores/useChatStore";
import { toast } from "sonner";
import type { Conversation } from "@/types/chat";

interface PrivateMessageLockedViewProps {
  conversation: Conversation;
  onUnlock: () => void;
}

export function PrivateMessageLockedView({
  conversation,
  onUnlock,
}: PrivateMessageLockedViewProps) {
  const setPrivatePin = useChatStore((state) => state.setPrivatePin);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [shake, setShake] = useState(false);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 620);
  };

  const handleUnlock = async () => {
    const trimmedPin = pin.trim();
    if (!trimmedPin) {
      triggerShake();
      toast.error("Nhập mã PIN để xem tin nhắn");
      return;
    }

    try {
      setIsVerifying(true);
      const result = await userService.verifyPrivatePin(trimmedPin);
      
      if (!result?.allowed) {
        triggerShake();
        toast.error("Mã PIN không đúng");
        setPin("");
        return;
      }

      // Store PIN in Zustand so it's included in fetchMessages requests
      setPrivatePin(trimmedPin);
      toast.success("Mở khóa thành công");
      setPin("");
      onUnlock();
    } catch (error) {
      triggerShake();
      toast.error("Lỗi xác minh PIN");
      console.error("PIN verification failed:", error);
    } finally {
      setIsVerifying(false);
    }
  };

  const conversationName = 
    conversation.type === "direct"
      ? conversation.participants?.[0]?.displayName || "Người dùng"
      : conversation.group?.name || "Nhóm";

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 px-6 py-12 bg-gradient-to-br from-background via-background to-muted/30 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-primary/[0.03] blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-16 -left-20 h-52 w-52 rounded-full bg-accent/[0.03] blur-3xl" aria-hidden="true" />

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-sm w-full">
        {/* Lock icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 ring-4 ring-amber-500/10">
          <Lock className="w-8 h-8 text-amber-600 dark:text-amber-500" />
        </div>

        {/* Title & description */}
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-foreground">Tin nhắn được bảo vệ</h2>
          <p className="text-sm text-muted-foreground">
            Cuộc trò chuyện với <span className="font-semibold text-foreground">{conversationName}</span> được ẩn. 
            Nhập mã PIN để xem tin nhắn.
          </p>
        </div>

        {/* Info box */}
        <div className="w-full rounded-lg border border-blue-500/20 bg-blue-500/8 px-4 py-3 space-y-2">
          <p className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Chỉ bạn mới có thể xem tin nhắn này
          </p>
          <p className="text-xs text-blue-600/80 dark:text-blue-300/70">
            Tin nhắn được bảo mật và không thể bị truy cập trái phép
          </p>
        </div>

        {/* PIN input form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleUnlock();
          }}
          className="w-full space-y-3"
        >
          <div className={cn(
            "relative",
            shake && "animate-pin-shake"
          )}>
            <label htmlFor="pin" className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Nhập mã PIN
            </label>
            <div className="relative">
              <input
                id="pin"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleUnlock();
                  }
                }}
                placeholder="0000"
                disabled={isVerifying}
                className="w-full h-12 rounded-xl border border-border/60 bg-background pl-4 pr-10 text-center text-lg font-mono tracking-widest placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-60"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isVerifying || !pin}
            className={cn(
              "w-full h-11 rounded-xl font-semibold text-sm transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "flex items-center justify-center gap-2"
            )}
          >
            {isVerifying ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Đang xác minh…
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Mở khóa
              </>
            )}
          </button>
        </form>

        {/* Help text */}
        <p className="text-xs text-muted-foreground/60 text-center">
          Quên mã PIN?{" "}
          <button
            type="button"
            className="text-primary hover:underline font-semibold transition-colors"
            onClick={() => toast.info("Vui lòng kiểm tra tin nhắn hoặc liên hệ với người quản lý")}
          >
            Liên hệ hỗ trợ
          </button>
        </p>
      </div>
    </div>
  );
}
