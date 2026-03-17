import { useAuthStore } from "@/stores/useAuthStore";
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { authService } from "@/services/authService";

const ProtectedRoute = () => {
  const { accessToken, user, loading, refresh, fetchMe, setAccessToken } =
    useAuthStore();
  const [starting, setStarting] = useState(true);

  const tryDrupalSso = async () => {
    const params = new URLSearchParams(globalThis.location.search);
    if (params.get("crm_sso") !== "1") {
      return false;
    }

    const uid = params.get("uid") || "";
    const username = params.get("username") || "";
    const email = params.get("email") || "";
    const displayName = params.get("displayName") || "";
    const ts = params.get("ts") || "";
    const sig = params.get("sig") || "";

    if (!uid || !username || !ts || !sig) {
      return false;
    }

    try {
      const data = await authService.drupalSso({
        uid,
        username,
        email,
        displayName,
        ts,
        sig,
      });

      if (data?.accessToken) {
        setAccessToken(data.accessToken);
        await fetchMe();
      }
    } catch (error) {
      console.error("Drupal SSO bootstrap failed:", error);
    } finally {
      globalThis.history.replaceState({}, "", globalThis.location.pathname);
    }

    return Boolean(useAuthStore.getState().accessToken);
  };

  const init = async () => {
    // có thể xảy ra khi refresh trang
    if (!accessToken) {
      await tryDrupalSso();
    }

    if (!useAuthStore.getState().accessToken) {
      await refresh();
    }

    if (useAuthStore.getState().accessToken && !user) {
      await fetchMe();
    }

    setStarting(false);
  };

  useEffect(() => {
    init();
  }, []);

  if (starting || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        Đang tải trang...
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/signin" replace />;
  }

  return <Outlet></Outlet>;
};

export default ProtectedRoute;
