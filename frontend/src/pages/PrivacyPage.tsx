import { ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const PrivacyPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100svh] bg-background text-foreground flex items-center justify-center px-4 py-8">
      <article className="w-full max-w-2xl rounded-2xl border border-border/70 bg-card/80 p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-primary">
          <ShieldCheck className="size-4" />
          <p className="text-xs font-semibold uppercase tracking-wide">Legal</p>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          We process account and activity data to provide chat and social
          features, improve reliability, and protect users from abuse. Access is
          limited to authorized systems and retained only as needed for service
          operation.
        </p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          You can manage core notification and visibility preferences from your
          account settings. If you have privacy questions, contact the product
          administrator.
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

export default PrivacyPage;
