import { useAuthStore } from "@/stores/useAuthStore";
import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { authService } from "@/services/authService";

// Add a timeout wrapper so we never hang forever waiting for a cold-start backend
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

const ProtectedRoute = () => {
  const { accessToken, user, setAccessToken, fetchMe, refresh } =
    useAuthStore();
  // If we already have a cached user from localStorage, skip the loading screen
  const alreadyHasUser = useRef(!!user).current;
  const [starting, setStarting] = useState(!alreadyHasUser);

  useEffect(() => {
    const tryDrupalSso = async () => {
      const params = new URLSearchParams(globalThis.location.search);
      if (params.get("crm_sso") !== "1") return false;

      const uid = params.get("uid") || "";
      const username = params.get("username") || "";
      const email = params.get("email") || "";
      const displayName = params.get("displayName") || "";
      const ts = params.get("ts") || "";
      const sig = params.get("sig") || "";

      if (!uid || !username || !ts || !sig) return false;

      try {
        const data = await withTimeout(
          authService.drupalSso({ uid, username, email, displayName, ts, sig }),
          8000,
        );
        if (data?.accessToken) {
          setAccessToken(data.accessToken);
          await withTimeout(fetchMe(), 6000);
        }
      } catch (err) {
        console.error("Drupal SSO bootstrap failed:", err);
      } finally {
        globalThis.history.replaceState({}, "", globalThis.location.pathname);
      }

      return Boolean(useAuthStore.getState().accessToken);
    };

    const init = async () => {
      if (!accessToken) {
        await tryDrupalSso();
      }

      const currentToken = useAuthStore.getState().accessToken;
      const currentUser = useAuthStore.getState().user;

      if (!currentToken) {
        // Run refresh (which internally calls fetchMe when no user) with a timeout
        try {
          await withTimeout(refresh(), 10000);
        } catch {
          // refresh timed out or failed – user must sign in
        }
      } else if (!currentUser) {
        // Token exists but user not loaded yet — fetch in parallel with a timeout
        try {
          await withTimeout(fetchMe(), 6000);
        } catch {
          console.warn("fetchMe timed out");
        }
      }

      setStarting(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  if (starting) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-4">
        <div className="elevated-card flex items-center gap-3 px-5 py-3 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-primary animate-pulse" />{" "}
          Connecting to workspace...
        </div>
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/signin" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
