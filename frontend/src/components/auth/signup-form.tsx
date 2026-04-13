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
import {
  ArrowRight,
  BadgeCheck,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

const signUpSchema = z.object({
  firstname: z.string().min(1, "First name is required"),
  lastname: z.string().min(1, "Last name is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.email("Invalid email address"),
  password: z.string().min(5, "Password must be at least 5 characters"),
  confirmPassword: z.string().min(5, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type SignUpFormValues = z.infer<typeof signUpSchema>;

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { signUp, loading } = useAuthStore();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const greetingByTime = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "Good morning";
    }
    if (hour < 18) {
      return "Good afternoon";
    }
    return "Good evening";
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    mode: "onChange",
  });

  const isBusy = isSubmitting || loading;
  const firstNameField = register("firstname");
  const lastNameField = register("lastname");
  const usernameField = register("username");
  const emailField = register("email");
  const passwordField = register("password");
  const confirmPasswordField = register("confirmPassword");

  const passwordValue = watch("password", "");
  const passwordStrength = useMemo(() => {
    if (!passwordValue) {
      return {
        label: "",
        hint: "Use at least 8 chars with letters and numbers",
        trackClass: "w-0",
        barClass: "bg-border",
        textClass: "text-muted-foreground",
      };
    }

    let score = 0;
    if (passwordValue.length >= 8) score += 1;
    if (/[A-Z]/.test(passwordValue) && /[a-z]/.test(passwordValue)) score += 1;
    if (/\d/.test(passwordValue)) score += 1;
    if (/[^A-Za-z0-9]/.test(passwordValue)) score += 1;

    if (score <= 1) {
      return {
        label: "Weak",
        hint: "Add length and character variety",
        trackClass: "w-1/4",
        barClass: "bg-red-500",
        textClass: "text-red-500",
      };
    }

    if (score === 2) {
      return {
        label: "Fair",
        hint: "Add uppercase or symbols to strengthen it",
        trackClass: "w-2/4",
        barClass: "bg-amber-500",
        textClass: "text-amber-600 dark:text-amber-400",
      };
    }

    if (score === 3) {
      return {
        label: "Good",
        hint: "Almost there",
        trackClass: "w-3/4",
        barClass: "bg-sky-500",
        textClass: "text-sky-600 dark:text-sky-400",
      };
    }

    return {
      label: "Strong",
      hint: "Great password quality",
      trackClass: "w-full",
      barClass: "bg-emerald-500",
      textClass: "text-emerald-600 dark:text-emerald-400",
    };
  }, [passwordValue]);

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
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden rounded-3xl border-border/70 bg-card/90 p-0 shadow-soft backdrop-blur-xl">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form
            className="p-6 md:p-8 lg:p-10"
            onSubmit={handleSubmit(onSubmit)}
          >
            <div className="space-stack-lg">
              {/* header - logo */}
              <div className="flex flex-col items-center text-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Sparkles className="size-3.5 text-primary" />
                  Create Secure Account
                </span>

                <Link to="/" className="mx-auto block w-fit text-center">
                  <img src="/logo.svg" alt="logo" />
                </Link>

                <h1 className="text-title-1">Create your Coming account</h1>
                <p className="text-body-sm text-muted-foreground text-balance">
                  {greetingByTime}. Set up your workspace in less than a minute.
                </p>
              </div>

              <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/6 to-accent/10 p-3 md:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/80">
                  Quick onboarding
                </p>
                <p className="mt-1 text-sm font-medium text-foreground/90">
                  One account to unlock chat, social updates, and saved messages.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-border/70 bg-background/70 px-2.5 py-2 text-center">
                  <ShieldCheck className="mx-auto mb-1 size-3.5 text-primary" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Secure
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 px-2.5 py-2 text-center">
                  <Users className="mx-auto mb-1 size-3.5 text-primary" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Team Ready
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 px-2.5 py-2 text-center">
                  <BadgeCheck className="mx-auto mb-1 size-3.5 text-primary" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Verified
                  </p>
                </div>
              </div>

              {/* first and last name */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="lastname" className="block text-sm">
                    Last name
                  </Label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80" />
                    <Input
                      type="text"
                      id="lastname"
                      placeholder="Last name"
                      autoComplete="family-name"
                      className="h-11 rounded-xl pl-10"
                      {...lastNameField}
                    />
                  </div>

                  {errors.lastname && (
                    <p className="text-destructive text-sm">{errors.lastname.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firstname" className="block text-sm">
                    First name
                  </Label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80" />
                    <Input
                      type="text"
                      id="firstname"
                      placeholder="First name"
                      autoComplete="given-name"
                      className="h-11 rounded-xl pl-10"
                      {...firstNameField}
                    />
                  </div>
                  {errors.firstname && (
                    <p className="text-destructive text-sm">{errors.firstname.message}</p>
                  )}
                </div>
              </div>

              {/* username */}
              <div className="flex flex-col gap-3">
                <Label htmlFor="username" className="block text-sm">
                  Username
                </Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80" />
                  <Input
                    type="text"
                    id="username"
                    placeholder="Username"
                    autoComplete="username"
                    className="h-11 rounded-xl pl-10"
                    {...usernameField}
                  />
                </div>
                {errors.username && (
                  <p className="text-destructive text-sm">{errors.username.message}</p>
                )}
              </div>

              {/* email */}
              <div className="flex flex-col gap-3">
                <Label htmlFor="email" className="block text-sm">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80" />
                  <Input
                    type="email"
                    id="email"
                    placeholder="name@company.com"
                    autoComplete="email"
                    className="h-11 rounded-xl pl-10"
                    {...emailField}
                  />
                </div>
                {errors.email && (
                  <p className="text-destructive text-sm">{errors.email.message}</p>
                )}
              </div>

              {/* password */}
              <div className="flex flex-col gap-3">
                <Label htmlFor="password" className="block text-sm">
                  Password
                </Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    placeholder="Create a password"
                    autoComplete="new-password"
                    className="h-11 rounded-xl pl-10 pr-11"
                    onKeyUp={(event) => {
                      setCapsLockOn(event.getModifierState("CapsLock"));
                    }}
                    onBlur={(event) => {
                      setCapsLockOn(false);
                      passwordField.onBlur(event);
                    }}
                    name={passwordField.name}
                    onChange={passwordField.onChange}
                    ref={passwordField.ref}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-destructive text-sm">{errors.password.message}</p>
                )}

                <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/35 px-3 py-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/70">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        passwordStrength.trackClass,
                        passwordStrength.barClass,
                      )}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn("font-medium", passwordStrength.textClass)}>
                      {passwordStrength.label || "Password strength"}
                    </span>
                    <span className="text-muted-foreground">
                      {passwordStrength.hint}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Label htmlFor="confirmPassword" className="block text-sm">
                  Confirm password
                </Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80" />
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    id="confirmPassword"
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    className="h-11 rounded-xl pl-10 pr-11"
                    onKeyUp={(event) => {
                      setCapsLockOn(event.getModifierState("CapsLock"));
                    }}
                    onBlur={(event) => {
                      setCapsLockOn(false);
                      confirmPasswordField.onBlur(event);
                    }}
                    name={confirmPasswordField.name}
                    onChange={confirmPasswordField.onChange}
                    ref={confirmPasswordField.ref}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    className="absolute right-2.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                {capsLockOn && (
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Caps Lock is on
                  </p>
                )}
                {errors.confirmPassword && (
                  <p className="text-destructive text-sm">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              {/* sign-up button */}
              <Button
                type="submit"
                className="group h-11 w-full rounded-xl bg-gradient-chat text-white shadow-soft transition-all hover:opacity-95"
                disabled={isBusy || !isValid}
              >
                {isBusy ? (
                  "Creating account..."
                ) : (
                  <span className="inline-flex items-center gap-2">
                    Create workspace account
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                )}
              </Button>

              <div className="rounded-xl border border-border/70 bg-muted/35 px-3 py-2.5 text-xs text-muted-foreground">
                We use your account details only for authentication and workspace profile setup.
              </div>

              <div className="text-center text-sm">
                Already have an account?{" "}
                <Link to="/signin" className="underline underline-offset-4">
                  Sign in
                </Link>
              </div>
            </div>
          </form>
          <div className="auth-hero-pane auth-hero-pane--signup relative hidden overflow-hidden md:block">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.24),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.18),transparent_34%)]" />
            <img
              src="/placeholderSignUp.png"
              alt="Sign-up illustration"
              className="absolute inset-0 h-full w-full object-cover opacity-50 mix-blend-screen"
            />
            <div className="absolute inset-6 flex flex-col justify-between">
              <div className="rounded-2xl border border-white/30 bg-white/15 p-4 text-white backdrop-blur-md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                  Professional Chat
                </p>
                <p className="mt-1 text-lg font-semibold leading-tight">
                  Collaborate with friends and teams in one focused inbox.
                </p>
                <p className="mt-2 text-sm text-white/85">
                  Build your profile once, then jump into shared conversations and social updates instantly.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/30 bg-black/20 p-3 text-white backdrop-blur-sm">
                  <p className="text-xl font-semibold leading-none">1 min</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-white/80">
                    Setup time
                  </p>
                </div>
                <div className="rounded-xl border border-white/30 bg-black/20 p-3 text-white backdrop-blur-sm">
                  <p className="text-xl font-semibold leading-none">Unified</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-white/80">
                    Chat + social
                  </p>
                </div>
              </div>
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
