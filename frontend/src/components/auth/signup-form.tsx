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

const signUpSchema = z.object({
  firstname: z.string().min(1, "First name is required"),
  lastname: z.string().min(1, "Last name is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.email("Invalid email address"),
  password: z.string().min(5, "Password must be at least 5 characters"),
});

type SignUpFormValues = z.infer<typeof signUpSchema>;

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
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden rounded-3xl border-border/70 bg-card/90 p-0 shadow-soft backdrop-blur-xl">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form
            className="p-6 md:p-8 lg:p-10"
            onSubmit={handleSubmit(onSubmit)}
          >
            <div className="flex flex-col gap-6">
              {/* header - logo */}
              <div className="flex flex-col items-center text-center gap-2">
                <Link to="/" className="mx-auto block w-fit text-center">
                  <img src="/logo.svg" alt="logo" />
                </Link>

                <h1 className="text-3xl font-bold tracking-[-0.02em]">
                  Create your Coming account
                </h1>
                <p className="text-muted-foreground text-balance">
                  Create your workspace in less than a minute.
                </p>
              </div>

              {/* first and last name */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="lastname" className="block text-sm">
                    Last name
                  </Label>
                  <Input
                    type="text"
                    id="lastname"
                    placeholder="Last name"
                    autoComplete="family-name"
                    {...register("lastname")}
                  />

                  {errors.lastname && (
                    <p className="error-message">{errors.lastname.message}</p>
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
                    {...register("firstname")}
                  />
                  {errors.firstname && (
                    <p className="error-message">{errors.firstname.message}</p>
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
                  {...register("username")}
                />
                {errors.username && (
                  <p className="error-message">{errors.username.message}</p>
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
                  {...register("email")}
                />
                {errors.email && (
                  <p className="error-message">{errors.email.message}</p>
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
                  {...register("password")}
                />
                {errors.password && (
                  <p className="error-message">{errors.password.message}</p>
                )}
              </div>

              {/* sign-up button */}
              <Button
                type="submit"
                className="w-full rounded-xl bg-gradient-chat text-white shadow-soft hover:opacity-95"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating account..." : "Create account"}
              </Button>

              <div className="text-center text-sm">
                Already have an account?{" "}
                <Link to="/signin" className="underline underline-offset-4">
                  Sign in
                </Link>
              </div>
            </div>
          </form>
          <div className="relative hidden overflow-hidden bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 md:block">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.24),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.18),transparent_34%)]" />
            <img
              src="/placeholderSignUp.png"
              alt="Sign-up illustration"
              className="absolute inset-0 h-full w-full object-cover opacity-45 mix-blend-screen"
            />
            <div className="absolute inset-x-6 bottom-8 rounded-2xl border border-white/30 bg-white/15 p-4 text-white backdrop-blur-md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                Professional Chat
              </p>
              <p className="mt-1 text-lg font-semibold leading-tight">
                Collaborate with friends and teams in one focused inbox.
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
