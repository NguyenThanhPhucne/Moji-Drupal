import { SignupForm } from "@/components/auth/signup-form";

const SignUpPage = () => {
  return (
    <section className="app-shell-bg min-h-svh items-center justify-center p-6 md:p-10" aria-label="Sign up page">
      <div className="relative z-10 w-full max-w-sm md:max-w-4xl" role="region" aria-label="Sign up form">
        <SignupForm />
      </div>
    </section>
  );
};

export default SignUpPage;
