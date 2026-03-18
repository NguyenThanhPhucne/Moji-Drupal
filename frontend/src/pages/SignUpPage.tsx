import { SignupForm } from "@/components/auth/signup-form";

const SignUpPage = () => {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-gradient-to-br from-sky-100 via-white to-cyan-100 p-6 md:p-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(14,165,233,0.12),transparent_40%),radial-gradient(circle_at_80%_20%,rgba(6,182,212,0.12),transparent_35%),radial-gradient(circle_at_50%_85%,rgba(56,189,248,0.10),transparent_40%)]" />
      <div className="relative z-10 w-full max-w-sm md:max-w-4xl">
        <SignupForm />
      </div>
    </div>
  );
};

export default SignUpPage;
