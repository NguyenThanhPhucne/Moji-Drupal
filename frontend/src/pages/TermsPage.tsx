import { FileText, ArrowLeft, Shield, Scale, Users, Eye } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  {
    icon: Users,
    title: "Account & Registration",
    content:
      "You must provide accurate information when creating an account. You are responsible for maintaining the security of your credentials and all activity under your account.",
  },
  {
    icon: Scale,
    title: "Acceptable Use",
    content:
      "You agree not to use the service for illegal, harmful, or abusive purposes. Harassment, spam, impersonation, and distribution of malicious content are strictly prohibited.",
  },
  {
    icon: Shield,
    title: "Content Moderation",
    content:
      "We reserve the right to remove content or suspend accounts that violate our community guidelines. Decisions are made with transparency and users may appeal moderation actions.",
  },
  {
    icon: Eye,
    title: "Intellectual Property",
    content:
      "Content you create remains yours. By posting, you grant us a limited license to display and distribute it within the platform. We respect copyright and respond to valid takedown requests.",
  },
];

const TermsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100svh] bg-background text-foreground relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/[0.03] rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-20">
        {/* Navigation */}
        <div className="mb-10 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-2 text-primary">
            <FileText className="size-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">Legal</span>
          </div>
        </div>

        {/* Header */}
        <header className="mb-12">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-[55ch]">
            These terms govern your use of the Moji platform. By creating an account or using any feature, you agree to be bound by these conditions.
          </p>
          <p className="mt-2 text-xs text-muted-foreground/60 font-medium">
            Last updated: June 2026
          </p>
        </header>

        {/* Sections */}
        <div className="space-y-6">
          {SECTIONS.map(({ icon: Icon, title, content }, i) => (
            <section
              key={title}
              className="group rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-6 transition-all duration-200 hover:border-border/80 hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.08)]"
            >
              <div className="flex items-start gap-4">
                <div className="mt-0.5 flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-primary/[0.08] text-primary group-hover:bg-primary/[0.12] transition-colors">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold text-foreground mb-1.5">
                    <span className="text-muted-foreground/40 font-medium mr-2">0{i + 1}</span>
                    {title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">{content}</p>
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-border/40">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button type="button" onClick={() => navigate("/signin")} className="h-10 rounded-xl">
                Sign in
              </Button>
              <Link to="/privacy" className="text-sm text-primary hover:underline underline-offset-4 font-medium">
                Privacy Policy →
              </Link>
            </div>
            <p className="text-[11px] text-muted-foreground/50 font-medium">
              Moji • Enterprise Workspace
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default TermsPage;
