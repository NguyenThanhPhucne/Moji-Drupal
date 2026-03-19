import { SignupForm } from "@/components/auth/signup-form";

const SignUpPage = () => {
  return (
    <div className="app-shell-bg min-h-svh items-center justify-center p-6 md:p-10">
      <div className="relative z-10 w-full max-w-sm md:max-w-4xl">
        <SignupForm />
      </div>
    </div>
  );
};

export default SignUpPage;
