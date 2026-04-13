import { SigninForm } from "@/components/auth/signin-form";

const SignInPage = () => {
  return (
    <div className="app-shell-bg min-h-svh items-center justify-center px-4 py-8 sm:p-6 md:p-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-24 left-[-10%] h-64 w-64 rounded-full bg-primary/14 blur-3xl" />
        <div className="absolute right-[-8%] top-[18%] h-56 w-56 rounded-full bg-cyan-400/16 blur-3xl" />
        <div className="absolute bottom-[-18%] left-[42%] h-72 w-72 rounded-full bg-accent/16 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm md:max-w-5xl">
        <SigninForm className="animate-in fade-in-0 zoom-in-95 duration-500" />
      </div>
    </div>
  );
};

export default SignInPage;
