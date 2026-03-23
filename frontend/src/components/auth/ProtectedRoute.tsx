import { useAuthStore } from "@/stores/useAuthStore";
import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { authService } from "@/services/authService";

const CRM_SSO_SESSION_KEY = "crm_sso_payload";

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
      const fromUrl = {
        uid: params.get("uid") || "",
        username: params.get("username") || "",
        email: params.get("email") || "",
        displayName: params.get("displayName") || "",
        ts: params.get("ts") || "",
        sig: params.get("sig") || "",
      };

      const hasSsoInUrl = params.get("crm_sso") === "1";
      const hasAllRequiredFromUrl =
        !!fromUrl.uid && !!fromUrl.username && !!fromUrl.ts && !!fromUrl.sig;

      if (hasSsoInUrl && hasAllRequiredFromUrl) {
        sessionStorage.setItem(CRM_SSO_SESSION_KEY, JSON.stringify(fromUrl));
      }

      let ssoPayload = fromUrl;
      if (!hasAllRequiredFromUrl) {
        const cached = sessionStorage.getItem(CRM_SSO_SESSION_KEY);
        if (cached) {
          try {
            ssoPayload = JSON.parse(cached);
          } catch {
            sessionStorage.removeItem(CRM_SSO_SESSION_KEY);
          }
        }
      }

      if (
        !ssoPayload.uid ||
        !ssoPayload.username ||
        !ssoPayload.ts ||
        !ssoPayload.sig
      ) {
        return false;
      }

      try {
        const data = await withTimeout(authService.drupalSso(ssoPayload), 8000);
        if (data?.accessToken) {
          setAccessToken(data.accessToken);
          await withTimeout(fetchMe(), 6000);
          sessionStorage.removeItem(CRM_SSO_SESSION_KEY);
        }
      } catch (err) {
        console.error("Drupal SSO bootstrap failed:", err);
      } finally {
        if (hasSsoInUrl) {
          globalThis.history.replaceState(
            {},
            "",
            `${globalThis.location.pathname}${globalThis.location.hash}`,
          );
        }
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
        // No token + no cached user usually means a first-time anonymous visit.
        // Skip refresh to avoid expected 401/403 noise in this scenario.
        if (!currentUser) {
          setStarting(false);
          return;
        }

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
