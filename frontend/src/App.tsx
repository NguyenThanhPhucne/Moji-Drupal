import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { Toaster } from "sonner";
import { useEffect, lazy, Suspense, useRef } from "react";
import { useThemeStore } from "./stores/useThemeStore";
import { useAuthStore } from "./stores/useAuthStore";
import { useSocketStore } from "./stores/useSocketStore";
import { useFriendStore } from "./stores/useFriendStore";
import { useBookmarkStore } from "./stores/useBookmarkStore";
import { useSocialStore } from "./stores/useSocialStore";
import { useChatStore } from "./stores/useChatStore";
import { useSocialMotionStore } from "./stores/useSocialMotionStore";
import { GoogleOAuthProvider } from "@react-oauth/google";
import WorkspaceLoadingSkeleton from "./components/skeleton/WorkspaceLoadingSkeleton";
import ChatAppPage from "./pages/ChatAppPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";

const SignInPage = lazy(() => import("./pages/SignInPage"));
const SignUpPage = lazy(() => import("./pages/SignUpPage"));
const SavedMessagesPage = lazy(() => import("./pages/SavedMessagesPage"));
const HomeFeedPage = lazy(() => import("./pages/HomeFeedPage"));
const ExplorePage = lazy(() => import("./pages/ExplorePage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const PostDetailPage = lazy(() => import("./pages/PostDetailPage"));
const JoinGroupLinkPage = lazy(() => import("./pages/JoinGroupLinkPage"));
const ChatContrastQaPage = lazy(() => import("./pages/ChatContrastQaPage"));
const NotificationSettingsPage = lazy(
  () => import("./pages/NotificationSettingsPage"),
);
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage.tsx"));

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const scheduleAfterFirstPaint = (callback: () => void) => {
  let frameOne = 0;
  let frameTwo = 0;

  frameOne = globalThis.requestAnimationFrame(() => {
    frameTwo = globalThis.requestAnimationFrame(() => {
      callback();
    });
  });

  return () => {
    globalThis.cancelAnimationFrame(frameOne);
    globalThis.cancelAnimationFrame(frameTwo);
  };
};

const reportDeferredTaskFailure = (error: unknown) => {
  console.error("Deferred startup task failed", error);
};

const runDeferredTasks = (tasks: Array<Promise<unknown>>) => {
  tasks.forEach((task) => {
    task.catch(reportDeferredTaskFailure);
  });
};

function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeSceneKey = `${location.pathname}${location.search}`;
  const mainRef = useRef<HTMLElement | null>(null);

  const moveFocusToMain = () => {
    const mainElement =
      mainRef.current ??
      globalThis.document.getElementById("primary-main");

    if (mainElement) {
      mainElement.focus({ preventScroll: true });
      mainElement.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    if (globalThis.location.hash !== "#primary-main") {
      globalThis.location.hash = "#primary-main";
    }
  };

  useEffect(() => {
    const handleBrowserHistorySync = () => {
      const browserPath = `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}`;
      const routerPath = `${location.pathname}${location.search}${location.hash}`;

      if (browserPath === routerPath) {
        return;
      }

      navigate(browserPath, { replace: true });
    };

    globalThis.addEventListener("popstate", handleBrowserHistorySync);

    return () => {
      globalThis.removeEventListener("popstate", handleBrowserHistorySync);
    };
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    // Keep keyboard focus inside the SPA's main landmark after route transitions.
    const frame = globalThis.requestAnimationFrame(() => {
      mainRef.current?.focus({ preventScroll: true });
    });

    return () => {
      globalThis.cancelAnimationFrame(frame);
    };
  }, [routeSceneKey]);

  return (
    <>
      <a
        href="#primary-main"
        className="app-skip-link"
        aria-label="Skip to main content"
        data-testid="skip-to-main-link"
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            moveFocusToMain();
          }
        }}
        onClick={(event) => {
          event.preventDefault();
          moveFocusToMain();
        }}
      >
        Skip to main content
      </a>
      <main
        id="primary-main"
        ref={mainRef}
        tabIndex={-1}
        aria-label="Main content"
        className="route-scene-enter"
        key={routeSceneKey}
      >
        <Routes location={location}>
          {/* public routes */}
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/qa/chat-contrast-light" element={<ChatContrastQaPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/login" element={<Navigate to="/signin" replace />} />
          <Route path="/register" element={<Navigate to="/signup" replace />} />

          {/* protectect routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<ChatAppPage />} />
            <Route path="/home" element={<Navigate to="/feed" replace />} />
            <Route path="/feed/home" element={<Navigate to="/feed" replace />} />
            <Route path="/feed" element={<HomeFeedPage />} />
            <Route path="/chat" element={<Navigate to="/" replace />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/post/:postId" element={<PostDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/me" element={<Navigate to="/profile" replace />} />
            <Route path="/profile/:userId" element={<ProfilePage />} />
            <Route path="/saved" element={<SavedMessagesPage />} />
            <Route
              path="/settings/notifications"
              element={<NotificationSettingsPage />}
            />
            <Route
              path="/settings/notification"
              element={<Navigate to="/settings/notifications" replace />}
            />
            <Route
              path="/notification-settings"
              element={<Navigate to="/settings/notifications" replace />}
            />
            <Route path="/join/group/:conversationId" element={<JoinGroupLinkPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </>
  );
}

function AppContent() {
  const { applyTheme, bindProfileUser } = useThemeStore();
  const { applyMotionPreset } = useSocialMotionStore();
  const { accessToken, user } = useAuthStore();
  const { connectSocket, disconnectSocket } = useSocketStore();
  const { getAllFriendRequests, getFriends } = useFriendStore();
  const { fetchBookmarks } = useBookmarkStore();
  const { fetchNotifications } = useSocialStore();

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    (
      globalThis as typeof globalThis & {
        __MOJI_SMOKE_BRIDGE__?: {
          useAuthStore: typeof useAuthStore;
          useSocketStore: typeof useSocketStore;
          useChatStore: typeof useChatStore;
        };
      }
    ).__MOJI_SMOKE_BRIDGE__ = {
      useAuthStore,
      useSocketStore,
      useChatStore,
    };

    return () => {
      delete (
        globalThis as typeof globalThis & {
          __MOJI_SMOKE_BRIDGE__?: unknown;
        }
      ).__MOJI_SMOKE_BRIDGE__;
    };
  }, []);

  useEffect(() => {
    applyTheme();
  }, [applyTheme]);

  useEffect(() => {
    applyMotionPreset();
  }, [applyMotionPreset]);

  useEffect(() => {
    bindProfileUser(user?._id ? String(user._id) : null);
  }, [bindProfileUser, user?._id]);

  useEffect(() => {
    if (accessToken && user) {
      connectSocket();

      // Load non-critical data after first paint to improve TTI on sign-in.
      const cancelDeferred = scheduleAfterFirstPaint(() => {
        runDeferredTasks([
          useChatStore.getState().fetchConversations(),
          getAllFriendRequests(),
          getFriends(),
          fetchBookmarks({ page: 1, limit: 30 }),
          fetchNotifications(),
        ]);
      });

      return () => {
        cancelDeferred();
      };
    }

    disconnectSocket();
  }, [
    accessToken,
    user,
    connectSocket,
    disconnectSocket,
    getAllFriendRequests,
    getFriends,
    fetchBookmarks,
    fetchNotifications,
  ]);

  // Only clean up when App unmounts.
  useEffect(() => {
    return () => disconnectSocket();
  }, [disconnectSocket]);

  return (
    <>
      <Toaster richColors />
      <BrowserRouter>
        <Suspense fallback={<WorkspaceLoadingSkeleton />}>
          <AppRoutes />
        </Suspense>
      </BrowserRouter>
    </>
  );
}

function App() {
  if (!GOOGLE_CLIENT_ID) {
    return <AppContent />;
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AppContent />
    </GoogleOAuthProvider>
  );
}

export default App;
