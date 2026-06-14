import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Link2, Loader2, Users, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/useChatStore";
import { cn } from "@/lib/utils";

const JoinGroupLinkPage = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { joinGroupByLink } = useChatStore();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Joining group...");
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [attemptVersion, setAttemptVersion] = useState(0);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = globalThis.setInterval(() => {
      setRetryAfterSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => globalThis.clearInterval(timer);
  }, [retryAfterSeconds]);

  useEffect(() => {
    if (status !== "error" || retryAfterSeconds <= 0) return;
    setMessage(`Too many attempts. Retry in ${retryAfterSeconds}s.`);
  }, [retryAfterSeconds, status]);

  useEffect(() => {
    const token = String(searchParams.get("token") || "").trim();
    if (!conversationId || !token) {
      setStatus("error");
      setMessage("Invalid join link. Please ask for a new invite.");
      return;
    }

    let cancelled = false;
    const run = async () => {
      setStatus("loading");
      setMessage("Joining group...");
      setRetryAfterSeconds(0);

      const result = await joinGroupByLink(conversationId, token);
      if (cancelled) return;

      if (!result.ok) {
        setStatus("error");
        if (result.retryAfterSeconds && result.retryAfterSeconds > 0) {
          setRetryAfterSeconds(result.retryAfterSeconds);
          setMessage(`Too many attempts. Retry in ${result.retryAfterSeconds}s.`);
          return;
        }
        setMessage(result.message || "Could not join this group.");
        return;
      }

      setStatus("success");
      setRetryAfterSeconds(0);
      setMessage(
        result.alreadyJoined
          ? "You are already in this group."
          : "Joined successfully! Redirecting to chat...",
      );
      globalThis.setTimeout(() => navigate("/"), 900);
    };

    void run();
    return () => { cancelled = true; };
  }, [attemptVersion, conversationId, joinGroupByLink, navigate, searchParams]);

  return (
    <div className="min-h-[100svh] bg-background text-foreground flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-32 -right-32 h-80 w-80 rounded-full bg-primary/[0.08] blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-accent/[0.06] blur-[100px]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-[0_16px_60px_-20px_hsl(222_38%_12%_/_0.35)] overflow-hidden">
          {/* Status indicator bar */}
          <div className={cn(
            "h-1 transition-all duration-500",
            status === "loading" && "bg-primary/60 animate-pulse",
            status === "success" && "bg-green-500",
            status === "error" && "bg-destructive/60",
          )} />

          <div className="p-6 sm:p-8">
            {/* Header */}
            <div className="flex items-center gap-2.5 mb-6">
              <div className={cn(
                "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                status === "loading" && "bg-primary/10",
                status === "success" && "bg-green-500/10",
                status === "error" && "bg-destructive/10",
              )}>
                {status === "loading" && <Users className="size-5 text-primary" />}
                {status === "success" && <CheckCircle2 className="size-5 text-green-500" />}
                {status === "error" && <AlertCircle className="size-5 text-destructive" />}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <Link2 className="size-3 text-muted-foreground/50" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    Group Invite
                  </p>
                </div>
                <h1 className="text-lg font-semibold tracking-tight text-foreground">
                  {status === "success" ? "You're in!" : status === "error" ? "Invite Issue" : "Join Group Space"}
                </h1>
              </div>
            </div>

            {/* Status message */}
            <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>

            {/* Loading */}
            {status === "loading" && (
              <div className="mt-5 flex items-center gap-2.5 text-sm text-muted-foreground/70">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>Processing invite link…</span>
              </div>
            )}

            {/* Success */}
            {status === "success" && (
              <div className="mt-5 flex items-center gap-2.5 text-sm text-green-600 dark:text-green-400">
                <Loader2 className="size-4 animate-spin" />
                <span>Redirecting to your conversations…</span>
              </div>
            )}

            {/* Error actions */}
            {status === "error" && (
              <div className="mt-6 flex items-center gap-2.5">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setAttemptVersion((prev) => prev + 1)}
                  disabled={retryAfterSeconds > 0}
                  className="rounded-xl"
                >
                  {retryAfterSeconds > 0 ? `Retry in ${retryAfterSeconds}s` : "Retry join"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/")}
                  className="rounded-xl gap-1.5"
                >
                  <ArrowLeft className="size-3.5" />
                  Back to chat
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-muted-foreground/40 mt-4">
          Moji • Enterprise Workspace
        </p>
      </div>
    </div>
  );
};

export default JoinGroupLinkPage;
