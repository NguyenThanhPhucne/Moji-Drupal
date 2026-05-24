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
import { GoogleLoginButton } from "./google-login-button";
import { Link } from "react-router-dom";
import { Lock, Search, Sparkles, Zap } from "lucide-react";

const signInSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(5, "Password must be at least 5 characters"),
});

type SignInFormValues = z.infer<typeof signInSchema>;

const SIGNIN_HIGHLIGHTS = [
  { label: "Realtime delivery", Icon: Zap },
  { label: "Smart search", Icon: Search },
  { label: "Secure sessions", Icon: Lock },
];

export function SigninForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { signIn } = useAuthStore();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = async (data: SignInFormValues) => {
    const { username, password } = data;
    try {
      const ok = await signIn(username, password);
      const { user, accessToken } = useAuthStore.getState();
      if (ok && (user || accessToken)) {
        navigate("/");
      }
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
                  Moji Workspace
                </span>

                <Link to="/" className="mx-auto block w-fit text-center">
                  <img src="/logo.svg" alt="logo" />
                </Link>

                <h1 className="text-title-1 md:text-3xl">Welcome back</h1>
                <p className="max-w-[30ch] text-body-sm text-muted-foreground text-balance">
                  Sign in to continue conversations, notifications, and your saved context.
                </p>

                <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                  {SIGNIN_HIGHLIGHTS.map(({ label, Icon }) => (
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

              {/* username */}
              <div className="flex flex-col gap-3">
                <Label htmlFor="username" className="block text-sm">
                  Username
                </Label>
                <Input
                  type="text"
                  id="username"
                  placeholder="Username or email"
                  autoComplete="username"
                  className="h-11 rounded-xl border-border/70 bg-background/80"
                  aria-invalid={Boolean(errors.username)}
                  aria-describedby={errors.username ? "signin-username-error" : undefined}
                  {...register("username")}
                />
                {errors.username && (
                  <p id="signin-username-error" className="text-destructive text-sm" role="alert">
                    {errors.username.message}
                  </p>
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
                  placeholder="Password"
                  autoComplete="current-password"
                  className="h-11 rounded-xl border-border/70 bg-background/80"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "signin-password-error" : undefined}
                  {...register("password")}
                />
                {errors.password && (
                  <p id="signin-password-error" className="text-destructive text-sm" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* sign-in button */}
              <Button
                type="submit"
                className="h-11 w-full rounded-xl bg-gradient-chat text-white shadow-soft transition hover:opacity-95"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>

              {/* divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="rounded-full border border-border/60 bg-card px-2 py-0.5 text-muted-foreground">
                    or continue with
                  </span>
                </div>
              </div>

              {/* Google Login */}
              <GoogleLoginButton />

              <div className="text-center text-sm">
                Don't have an account?{" "}
                <Link to="/signup" className="font-semibold text-primary underline underline-offset-4">
                  Sign up
                </Link>
              </div>
            </div>
          </form>
          <div className="auth-hero-pane auth-hero-pane--signin relative hidden overflow-hidden md:block">
            <div className="absolute left-6 top-6 rounded-full border border-white/35 bg-white/16 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85">
              Team Workspace
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(255,255,255,0.28),transparent_36%),radial-gradient(circle_at_74%_28%,rgba(255,255,255,0.2),transparent_32%)]" />
            <img
              src="/placeholder.png"
              alt="Sign-in illustration"
              className="absolute inset-0 h-full w-full object-cover opacity-45 mix-blend-screen"
            />
            <div className="absolute inset-x-6 bottom-8 rounded-2xl border border-white/30 bg-white/15 p-4 text-white backdrop-blur-md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                Sign-in faster
              </p>
              <p className="mt-1 text-lg font-semibold leading-tight">
                Stay connected with focused messaging and faster handoff between teams.
              </p>
              <p className="mt-2 text-[12px] text-white/82">
                Keep chat, feed, and notifications in one continuous workspace rhythm.
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
