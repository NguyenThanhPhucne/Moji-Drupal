import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { Toaster } from "sonner";
import { useEffect, lazy, Suspense } from "react";
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

const SignInPage = lazy(() => import("./pages/SignInPage"));
const SignUpPage = lazy(() => import("./pages/SignUpPage"));
const ChatAppPage = lazy(() => import("./pages/ChatAppPage"));
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
const ProtectedRoute = lazy(() => import("./components/auth/ProtectedRoute"));

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
  const routeSceneKey = `${location.pathname}${location.search}`;

  return (
    <div className="route-scene-enter" key={routeSceneKey}>
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
    </div>
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
