import { Compass, Home, ArrowLeft, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/useAuthStore";

const NotFoundPage = () => {
  const navigate = useNavigate();
  const { accessToken } = useAuthStore();

  return (
    <div className="not-found-page min-h-[100svh] bg-background text-foreground flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[15%] left-[10%] w-72 h-72 bg-primary/[0.04] rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-[20%] right-[8%] w-96 h-96 bg-primary/[0.03] rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/[0.02] to-transparent rounded-full" />
      </div>

      <article
        className="relative w-full max-w-lg rounded-2xl border border-border/50 bg-card/90 backdrop-blur-xl p-8 md:p-10 shadow-[0_24px_60px_-20px_hsl(var(--primary)/0.12)]"
        aria-labelledby="not-found-title"
      >
        {/* Animated 404 display */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1.5">
            <Sparkles className="size-3.5 text-primary animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary/80">
              Page not found
            </span>
          </div>
        </div>

        <div className="relative mb-6">
          <h1
            id="not-found-title"
            className="text-[72px] md:text-[96px] font-extrabold tracking-tighter leading-none bg-gradient-to-br from-foreground/90 via-foreground/60 to-foreground/30 bg-clip-text text-transparent select-none"
          >
            404
          </h1>
          <div className="absolute -top-2 -left-2 text-[72px] md:text-[96px] font-extrabold tracking-tighter leading-none text-primary/[0.06] select-none" aria-hidden="true">
            404
          </div>
        </div>

        <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground mb-2">
          Lost in the void
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-[42ch]">
          The page you're looking for doesn't exist or has been moved.
          Let's get you back on track.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            className="h-10 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md hover:shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
            onClick={() => navigate(accessToken ? "/feed" : "/signin")}
          >
            <Home className="mr-2 size-4" />
            {accessToken ? "Go to feed" : "Sign in"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl border-border/60 hover:bg-muted/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
            onClick={() => navigate(accessToken ? "/explore" : "/signup")}
          >
            <Compass className="mr-2 size-4" />
            {accessToken ? "Explore" : "Create account"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-xl text-muted-foreground hover:text-foreground transition-all"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="mr-2 size-4" />
            Go back
          </Button>
        </div>

        {/* Bottom decorative line */}
        <div className="mt-8 pt-5 border-t border-border/40">
          <p className="text-[11px] text-muted-foreground/60 font-medium">
            Moji • Enterprise Workspace
          </p>
        </div>
      </article>
    </div>
  );
};

export default NotFoundPage;
