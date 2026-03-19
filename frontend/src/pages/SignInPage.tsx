import { SigninForm } from "@/components/auth/signin-form";

const SignInPage = () => {
  return (
    <div className="app-shell-bg min-h-svh items-center justify-center p-6 md:p-10">
      <div className="relative z-10 w-full max-w-sm md:max-w-4xl">
        <SigninForm />
      </div>
    </div>
  );
};

export default SignInPage;
