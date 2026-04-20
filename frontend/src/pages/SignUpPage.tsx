import { SignupForm } from "@/components/auth/signup-form";

const SignUpPage = () => {
  return (
    <section
      className="app-shell-bg relative flex min-h-svh items-center justify-center overflow-hidden p-4 sm:p-6 md:p-10"
      aria-label="Sign up page"
    >
      <div className="pointer-events-none absolute -top-24 -left-20 h-64 w-64 rounded-full bg-primary/[0.1] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-accent/[0.08] blur-3xl" />

      <div className="relative z-10 w-full max-w-sm md:max-w-5xl" aria-label="Sign up form">
        <SignupForm />
      </div>
    </section>
  );
};

export default SignUpPage;
