import { SigninForm } from "@/components/auth/signin-form";

const SignInPage = () => {
  return (
    <section className="app-shell-bg min-h-svh items-center justify-center p-6 md:p-10" aria-label="Sign in page">
      <div className="relative z-10 w-full max-w-sm md:max-w-4xl" role="region" aria-label="Sign in form">
        <SigninForm />
      </div>
    </section>
  );
};

export default SignInPage;
