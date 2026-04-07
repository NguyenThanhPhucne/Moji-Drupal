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

const signInSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(5, "Password must be at least 5 characters"),
});

type SignInFormValues = z.infer<typeof signInSchema>;

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
                <Link to="/" className="mx-auto block w-fit text-center">
                  <img src="/logo.svg" alt="logo" />
                </Link>

                <h1 className="text-title-1 md:text-3xl">Welcome back</h1>
                <p className="text-body-sm text-muted-foreground text-balance">
                  Sign in to continue your conversations
                </p>
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
                  {...register("username")}
                />
                {errors.username && (
                  <p className="text-destructive text-sm">
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
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-destructive text-sm">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* sign-in button */}
              <Button
                type="submit"
                className="w-full rounded-xl bg-gradient-chat text-white shadow-soft hover:opacity-95"
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
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              {/* Google Login */}
              <GoogleLoginButton />

              <div className="text-center text-sm">
                Don't have an account?{" "}
                <Link to="/signup" className="underline underline-offset-4">
                  Sign up
                </Link>
              </div>
            </div>
          </form>
          <div className="auth-hero-pane auth-hero-pane--signin relative hidden overflow-hidden md:block">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(255,255,255,0.28),transparent_36%),radial-gradient(circle_at_74%_28%,rgba(255,255,255,0.2),transparent_32%)]" />
            <img
              src="/placeholder.png"
              alt="Sign-in illustration"
              className="absolute inset-0 h-full w-full object-cover opacity-45 mix-blend-screen"
            />
            <div className="absolute inset-x-6 bottom-8 rounded-2xl border border-white/30 bg-white/15 p-4 text-white backdrop-blur-md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                Team Workspace
              </p>
              <p className="mt-1 text-lg font-semibold leading-tight">
                Stay connected with faster messaging and smarter search.
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
