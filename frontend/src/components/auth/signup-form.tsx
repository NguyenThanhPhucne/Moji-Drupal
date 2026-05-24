import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Label } from "../ui/label";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNavigate } from "react-router";
import { Link } from "react-router-dom";
import { Lock, Sparkles, Users, Zap } from "lucide-react";

const signUpSchema = z.object({
  firstname: z.string().min(1, "First name is required"),
  lastname: z.string().min(1, "Last name is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.email("Invalid email address"),
  password: z.string().min(5, "Password must be at least 5 characters"),
});

type SignUpFormValues = z.infer<typeof signUpSchema>;

const SIGNUP_HIGHLIGHTS = [
  { label: "Private by default", Icon: Lock },
  { label: "Realtime channels", Icon: Zap },
  { label: "Team-ready", Icon: Users },
];

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { signUp } = useAuthStore();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = async (data: SignUpFormValues) => {
    const { firstname, lastname, username, email, password } = data;

    try {
      await signUp(username, password, email, firstname, lastname);
      // After successful sign-up, always redirect to sign-in.
      navigate("/signin");
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className={cn("flex flex-col gap-5", className)} {...props}>
      <Card className="overflow-hidden rounded-[1.7rem] border-border/70 bg-card/92 p-0 shadow-[0_26px_70px_-52px_hsl(222_38%_12%_/_0.55)] backdrop-blur-xl">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form
            className="p-6 md:p-8 lg:p-10"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <div className="space-stack-lg">
              {/* header - logo */}
              <div className="flex flex-col items-center text-center gap-2.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/[0.08] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-primary/85">
                  <Sparkles className="h-3 w-3" />
                  New Workspace
                </span>

                <Link to="/" className="mx-auto block w-fit text-center">
                  <img src="/logo.svg" alt="logo" />
                </Link>

                <h1 className="text-title-1 md:text-3xl">Create your account</h1>
                <p className="max-w-[32ch] text-body-sm text-muted-foreground text-balance">
                  Set up your profile and start collaborating in under a minute.
                </p>

                <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                  {SIGNUP_HIGHLIGHTS.map(({ label, Icon }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/35 px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground/85"
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* first and last name */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="lastname" className="block text-sm">
                    Last name
                  </Label>
                  <Input
                    type="text"
                    id="lastname"
                    placeholder="Last name"
                    autoComplete="family-name"
                    className="h-11 rounded-xl border-border/70 bg-background/80"
                    aria-invalid={Boolean(errors.lastname)}
                    aria-describedby={errors.lastname ? "signup-lastname-error" : undefined}
                    {...register("lastname")}
                  />

                  {errors.lastname && (
                    <p id="signup-lastname-error" className="error-message" role="alert">{errors.lastname.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firstname" className="block text-sm">
                    First name
                  </Label>
                  <Input
                    type="text"
                    id="firstname"
                    placeholder="First name"
                    autoComplete="given-name"
                    className="h-11 rounded-xl border-border/70 bg-background/80"
                    aria-invalid={Boolean(errors.firstname)}
                    aria-describedby={errors.firstname ? "signup-firstname-error" : undefined}
                    {...register("firstname")}
                  />
                  {errors.firstname && (
                    <p id="signup-firstname-error" className="error-message" role="alert">{errors.firstname.message}</p>
                  )}
                </div>
              </div>

              {/* username */}
              <div className="flex flex-col gap-3">
                <Label htmlFor="username" className="block text-sm">
                  Username
                </Label>
                <Input
                  type="text"
                  id="username"
                  placeholder="Username"
                  autoComplete="username"
                  className="h-11 rounded-xl border-border/70 bg-background/80"
                  aria-invalid={Boolean(errors.username)}
                  aria-describedby={errors.username ? "signup-username-error" : undefined}
                  {...register("username")}
                />
                {errors.username && (
                  <p id="signup-username-error" className="error-message" role="alert">{errors.username.message}</p>
                )}
              </div>

              {/* email */}
              <div className="flex flex-col gap-3">
                <Label htmlFor="email" className="block text-sm">
                  Email
                </Label>
                <Input
                  type="email"
                  id="email"
                  placeholder="name@company.com"
                  autoComplete="email"
                  className="h-11 rounded-xl border-border/70 bg-background/80"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "signup-email-error" : undefined}
                  {...register("email")}
                />
                {errors.email && (
                  <p id="signup-email-error" className="error-message" role="alert">{errors.email.message}</p>
                )}
              </div>

              {/* password */}
              <div className="flex flex-col gap-3">
                <Label htmlFor="password" className="block text-sm">
                  Password
                </Label>
                <Input
                  type="password"
                  id="password"
                  placeholder="Create a password"
                  autoComplete="new-password"
                  className="h-11 rounded-xl border-border/70 bg-background/80"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "signup-password-error" : undefined}
                  {...register("password")}
                />
                {errors.password && (
                  <p id="signup-password-error" className="error-message" role="alert">{errors.password.message}</p>
                )}
              </div>

              {/* sign-up button */}
              <Button
                type="submit"
                className="h-11 w-full rounded-xl bg-gradient-chat text-white shadow-soft transition hover:opacity-95"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating account..." : "Create account"}
              </Button>

              <div className="text-center text-sm">
                Already have an account?{" "}
                <Link to="/signin" className="font-semibold text-primary underline underline-offset-4">
                  Sign in
                </Link>
              </div>
            </div>
          </form>
          <div className="auth-hero-pane auth-hero-pane--signup relative hidden overflow-hidden md:block">
            <div className="absolute left-6 top-6 rounded-full border border-white/35 bg-white/16 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85">
              Professional Chat
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.24),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.18),transparent_34%)]" />
            <img
              src="/placeholderSignUp.png"
              alt="Sign-up illustration"
              className="absolute inset-0 h-full w-full object-cover opacity-45 mix-blend-screen"
            />
            <div className="absolute inset-x-6 bottom-8 rounded-2xl border border-white/30 bg-white/15 p-4 text-white backdrop-blur-md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                Build your flow
              </p>
              <p className="mt-1 text-lg font-semibold leading-tight">
                Collaborate with friends and teams in one focused inbox.
              </p>
              <p className="mt-2 text-[12px] text-white/82">
                Start with direct chat, then scale to groups and channels when your team grows.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="text-xs text-balance px-6 text-center *:[a]:hover:text-primary text-muted-foreground *:[a]:underline *:[a]:underline-offset-4">
        By continuing, you agree to our{" "}
        <Link to="/terms">Terms of Service</Link> and{" "}
        <Link to="/privacy">Privacy Policy</Link>.
      </div>
    </div>
  );
}
