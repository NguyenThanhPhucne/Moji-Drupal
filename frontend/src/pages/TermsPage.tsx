import { FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const TermsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100svh] bg-background text-foreground flex items-center justify-center px-4 py-8">
      <article className="w-full max-w-2xl rounded-2xl border border-border/70 bg-card/80 p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-primary">
          <FileText className="size-4" />
          <p className="text-xs font-semibold uppercase tracking-wide">Legal</p>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          By using this app, you agree to use the service responsibly, respect
          other users, and avoid abusive or unlawful behavior. Features and
          policies may evolve over time to keep the platform safe and reliable.
        </p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Account security, acceptable use, and content moderation rules are
          enforced to protect the community. If you do not agree with these
          terms, please stop using the service.
        </p>

        <div className="mt-6 flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button type="button" onClick={() => navigate("/signin")}>
            Sign in
          </Button>
        </div>
      </article>
    </div>
  );
};

export default TermsPage;
