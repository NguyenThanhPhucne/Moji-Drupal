import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/useChatStore";

const JoinGroupLinkPage = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { joinGroupByLink } = useChatStore();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Joining group...");

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

      const result = await joinGroupByLink(conversationId, token);
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setStatus("error");
        setMessage(result.message || "Could not join this group.");
        return;
      }

      setStatus("success");
      setMessage(
        result.alreadyJoined
          ? "You are already in this group."
          : "Joined successfully. Redirecting to chat...",
      );

      globalThis.setTimeout(() => {
        navigate("/");
      }, 900);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [conversationId, joinGroupByLink, navigate, searchParams]);

  return (
    <div className="min-h-[100svh] bg-background text-foreground flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card/80 p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-primary">
          <Link2 className="size-4" />
          <p className="text-xs font-semibold uppercase tracking-wide">Group Invite</p>
        </div>

        <h1 className="text-xl font-semibold tracking-tight">Join Group Space</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>

        {status === "loading" && (
          <div className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Processing invite link
          </div>
        )}

        {status === "error" && (
          <div className="mt-6 flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/")}>
              Back to chat
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default JoinGroupLinkPage;
