import { ShieldCheck, ArrowLeft, Database, Lock, Eye, UserCheck } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  {
    icon: Database,
    title: "Data We Collect",
    content:
      "We collect account details (name, email, avatar), usage data (messages, interactions), and technical data (device type, IP address) to provide and improve the service.",
  },
  {
    icon: Lock,
    title: "How We Use Your Data",
    content:
      "Your data is used to deliver chat and social features, improve reliability, detect abuse, and personalize your experience. We never sell personal data to third parties.",
  },
  {
    icon: Eye,
    title: "Data Retention & Access",
    content:
      "Data is retained only as long as needed for service operation. You can export or delete your account at any time from Settings → Security. Deletion is permanent and irreversible.",
  },
  {
    icon: UserCheck,
    title: "Your Controls",
    content:
      "You control your notification preferences, online visibility, and profile information from Settings. You can also mute, block, or report other users at any time.",
  },
];

const PrivacyPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100svh] bg-background text-foreground relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[600px] h-[400px] bg-primary/[0.03] rounded-full blur-3xl" />
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
            <ShieldCheck className="size-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">Legal</span>
          </div>
        </div>

        {/* Header */}
        <header className="mb-12">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-[55ch]">
            Your privacy matters. This policy explains what data we collect, how we use it, and how you maintain control over your information.
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

        {/* GDPR-style callout */}
        <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/[0.04] p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="size-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Your rights</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You have the right to access, correct, export, or delete your personal data at any time.
                Visit <Link to="/settings/security" className="text-primary hover:underline underline-offset-4 font-medium">Settings → Security</Link> to
                manage your data, or contact the platform administrator for assistance.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-border/40">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button type="button" onClick={() => navigate("/signin")} className="h-10 rounded-xl">
                Sign in
              </Button>
              <Link to="/terms" className="text-sm text-primary hover:underline underline-offset-4 font-medium">
                Terms of Service →
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

export default PrivacyPage;
