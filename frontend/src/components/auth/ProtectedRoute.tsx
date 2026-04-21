import { useAuthStore } from "@/stores/useAuthStore";
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { authService } from "@/services/authService";
import WorkspaceLoadingSkeleton from "@/components/skeleton/WorkspaceLoadingSkeleton";

const CRM_SSO_SESSION_KEY = "crm_sso_payload";

let authBootstrapInFlight: Promise<void> | null = null;

type AuthPersistApi = {
  hasHydrated: () => boolean;
  onFinishHydration: (listener: () => void) => () => void;
};

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
  const { accessToken, setAccessToken, fetchMe, refresh } = useAuthStore();
  const authPersist = (
    useAuthStore as typeof useAuthStore & { persist?: AuthPersistApi }
  ).persist;

  const [hydrated, setHydrated] = useState(
    authPersist?.hasHydrated?.() ?? true,
  );
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (hydrated || !authPersist) {
      return;
    }

    const unsubscribe = authPersist.onFinishHydration(() => {
      setHydrated(true);
    });

    return () => {
      unsubscribe();
    };
  }, [authPersist, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    let cancelled = false;

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

    const runBootstrap = async () => {
      const initialToken = useAuthStore.getState().accessToken;

      if (!initialToken) {
        await tryDrupalSso();
      }

      const tokenBeforeRefresh = useAuthStore.getState().accessToken;

      if (!tokenBeforeRefresh) {
        // Attempt silent refresh from cookie session on each protected-route bootstrap.
        try {
          await withTimeout(refresh(), 10000);
        } catch {
          // refresh timed out or failed – user must sign in.
        }
      }

      const currentToken = useAuthStore.getState().accessToken;
      const currentUser = useAuthStore.getState().user;

      if (currentToken && !currentUser) {
        // Token exists but user not loaded yet — fetch in parallel with a timeout.
        try {
          await withTimeout(fetchMe(), 6000);
        } catch {
          console.warn("fetchMe timed out");
        }
      }

      if (!cancelled) {
        setStarting(false);
      }
    };

    authBootstrapInFlight ??= runBootstrap().finally(() => {
      authBootstrapInFlight = null;
    });

    void authBootstrapInFlight.finally(() => {
      if (!cancelled) {
        setStarting(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fetchMe, hydrated, refresh, setAccessToken]);

  if (!hydrated || starting) {
    return <WorkspaceLoadingSkeleton />;
  }

  if (!accessToken) {
    return <Navigate to="/signin" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
