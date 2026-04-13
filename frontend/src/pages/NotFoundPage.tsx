import { Compass, Home, SearchX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/useAuthStore";

const NotFoundPage = () => {
  const navigate = useNavigate();
  const { accessToken } = useAuthStore();

  return (
    <div className="min-h-[100svh] bg-background text-foreground flex items-center justify-center px-4 py-8">
      <article className="w-full max-w-lg rounded-2xl border border-border/70 bg-card/80 p-6 shadow-sm">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1 text-primary">
          <SearchX className="size-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-wide">404</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">Page Not Found</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          The page you requested does not exist or was moved to a new path.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => {
              navigate(accessToken ? "/feed" : "/signin");
            }}
          >
            <Home className="mr-1.5 size-4" />
            {accessToken ? "Go to feed" : "Go to sign in"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              navigate(accessToken ? "/explore" : "/signup");
            }}
          >
            <Compass className="mr-1.5 size-4" />
            {accessToken ? "Explore" : "Create account"}
          </Button>
        </div>
      </article>
    </div>
  );
};

export default NotFoundPage;
