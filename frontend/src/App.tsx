import { BrowserRouter, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { useEffect, lazy, Suspense } from "react";
import { useThemeStore } from "./stores/useThemeStore";
import { useAuthStore } from "./stores/useAuthStore";
import { useSocketStore } from "./stores/useSocketStore";
import { useFriendStore } from "./stores/useFriendStore";
import { useBookmarkStore } from "./stores/useBookmarkStore";
import { useSocialStore } from "./stores/useSocialStore";
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

function AppContent() {
  const { isDark, setTheme } = useThemeStore();
  const { accessToken, user } = useAuthStore();
  const { connectSocket, disconnectSocket } = useSocketStore();
  const { getAllFriendRequests, getFriends } = useFriendStore();
  const { fetchBookmarks } = useBookmarkStore();
  const { fetchNotifications } = useSocialStore();

  useEffect(() => {
    setTheme(isDark);
  }, [isDark, setTheme]);

  useEffect(() => {
    if (accessToken && user) {
      connectSocket();

      // Load non-critical data after first paint to improve TTI on sign-in.
      const cancelDeferred = scheduleAfterFirstPaint(() => {
        void getAllFriendRequests();
        void getFriends();
        void fetchBookmarks({ page: 1, limit: 30 });
        void fetchNotifications();
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
          <Routes>
            {/* public routes */}
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup" element={<SignUpPage />} />

            {/* protectect routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<ChatAppPage />} />
              <Route path="/feed" element={<HomeFeedPage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/post/:postId" element={<PostDetailPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/:userId" element={<ProfilePage />} />
              <Route path="/saved" element={<SavedMessagesPage />} />
            </Route>
          </Routes>
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
