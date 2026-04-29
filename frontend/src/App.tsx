import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { Toaster } from "sonner";
import { useCallback, useEffect, lazy, Suspense, useRef, useMemo } from "react";
import { useThemeStore } from "./stores/useThemeStore";
import { useAuthStore } from "./stores/useAuthStore";
import { useSocketStore } from "./stores/useSocketStore";
import { useFriendStore } from "./stores/useFriendStore";
import { useBookmarkStore } from "./stores/useBookmarkStore";
import { useSocialStore } from "./stores/useSocialStore";
import { useChatStore } from "./stores/useChatStore";
import { useNotificationStore } from "./stores/useNotificationStore";
import { useSocialMotionStore } from "./stores/useSocialMotionStore";
import {
  usePersonalizationStore,
  type StartPagePreference,
  type PersonalizationSnapshot,
  normalizePersonalizationSnapshot,
  arePersonalizationSnapshotsEqual,
} from "./stores/usePersonalizationStore";
import { useA11yAnnouncerStore } from "./stores/useA11yAnnouncerStore";
import { useI18n } from "./lib/i18n";
import { flushVoiceMemoOutbox } from "./lib/voiceMemoDelivery";
import { userService } from "./services/userService";
import { GoogleOAuthProvider } from "@react-oauth/google";
import WorkspaceLoadingSkeleton from "./components/skeleton/WorkspaceLoadingSkeleton";
import GlobalSearchDialog from "./components/chat/GlobalSearchDialog";
import AccessibilityAnnouncer from "./components/a11y/AccessibilityAnnouncer";
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

const START_PAGE_PATH_BY_PREFERENCE: Record<
  Exclude<StartPagePreference, "chat">,
  string
> = {
  feed: "/feed",
  explore: "/explore",
  saved: "/saved",
};

const StartPageRoute = () => {
  const startPagePreference = usePersonalizationStore(
    (state) => state.startPagePreference,
  );

  if (startPagePreference === "chat") {
    return <ChatAppPage />;
  }

  return <Navigate to={START_PAGE_PATH_BY_PREFERENCE[startPagePreference]} replace />;
};

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
  const { t } = useI18n();
  const announcePolite = useA11yAnnouncerStore((state) => state.announcePolite);
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore(
    (state) => Boolean(state.accessToken && state.user),
  );
  const routeSceneKey = `${location.pathname}${location.search}`;
  const mainRef = useRef<HTMLElement | null>(null);
  const didInitialRouteAnnouncement = useRef(false);

  const resolveRouteLabel = useCallback(
    (pathname: string) => {
      if (pathname === "/" || pathname.startsWith("/chat")) {
        return t("route.chat");
      }

      if (pathname.startsWith("/feed")) {
        return t("route.feed");
      }

      if (pathname.startsWith("/explore")) {
        return t("route.explore");
      }

      if (pathname.startsWith("/profile")) {
        return t("route.profile");
      }

      if (pathname.startsWith("/saved")) {
        return t("route.saved");
      }

      if (pathname.startsWith("/settings/notifications")) {
        return t("route.notifications");
      }

      if (pathname.startsWith("/signin")) {
        return t("route.signin");
      }

      if (pathname.startsWith("/signup")) {
        return t("route.signup");
      }

      if (pathname.startsWith("/terms")) {
        return t("route.terms");
      }

      if (pathname.startsWith("/privacy")) {
        return t("route.privacy");
      }

      return t("route.unknown");
    },
    [t],
  );

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

  useEffect(() => {
    if (!didInitialRouteAnnouncement.current) {
      didInitialRouteAnnouncement.current = true;
      return;
    }

    const routeLabel = resolveRouteLabel(location.pathname);
    announcePolite(t("a11y.navigation_to", { route: routeLabel }));
  }, [announcePolite, location.pathname, resolveRouteLabel, t]);

  return (
    <>
      <a
        href="#primary-main"
        className="app-skip-link"
        aria-label={t("app.skip_to_main")}
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
        {t("app.skip_to_main")}
      </a>
      <main
        id="primary-main"
        ref={mainRef}
        tabIndex={-1}
        aria-label={t("app.main_content")}
        className="route-scene-enter"
        key={routeSceneKey}
      >
        {isAuthenticated ? <GlobalSearchDialog globalOnly /> : null}

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
            <Route path="/" element={<StartPageRoute />} />
            <Route path="/home" element={<Navigate to="/feed" replace />} />
            <Route path="/feed/home" element={<Navigate to="/feed" replace />} />
            <Route path="/feed" element={<HomeFeedPage />} />
            <Route path="/chat" element={<ChatAppPage />} />
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
  const applyDocumentSettings = usePersonalizationStore(
    (state) => state.applyDocumentSettings,
  );
  const hydrateFromProfile = usePersonalizationStore(
    (state) => state.hydrateFromProfile,
  );
  const locale = usePersonalizationStore((state) => state.locale);
  const startPagePreference = usePersonalizationStore(
    (state) => state.startPagePreference,
  );
  const timestampStylePreference = usePersonalizationStore(
    (state) => state.timestampStylePreference,
  );
  const notificationGroupingPreference = usePersonalizationStore(
    (state) => state.notificationGroupingPreference,
  );
  const notificationDensityPreference = usePersonalizationStore(
    (state) => state.notificationDensityPreference,
  );
  const { accessToken, user, setUser } = useAuthStore();
  const { connectSocket, disconnectSocket } = useSocketStore();
  const keyboardPowerShortcutsEnabled = useSocketStore(
    (state) => state.featureFlags.keyboard_power_shortcuts,
  );
  const { getAllFriendRequests, getFriends } = useFriendStore();
  const { fetchBookmarks } = useBookmarkStore();
  const { fetchNotifications } = useSocialStore();
  const setIsHubOpen = useNotificationStore((state) => state.setIsHubOpen);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const conversations = useChatStore((state) => state.conversations);
  const flushOutgoingQueue = useChatStore((state) => state.flushOutgoingQueue);
  const outgoingQueueLength = useChatStore((state) => state.outgoingQueue.length);
  const personalizationSyncTimeoutRef = useRef<number | null>(null);

  const localPersonalizationSnapshot = useMemo<PersonalizationSnapshot>(
    () => ({
      locale,
      startPagePreference,
      timestampStylePreference,
      notificationGroupingPreference,
      notificationDensityPreference,
    }),
    [
      locale,
      notificationDensityPreference,
      notificationGroupingPreference,
      startPagePreference,
      timestampStylePreference,
    ],
  );

  const profilePersonalizationSnapshot = useMemo(
    () => normalizePersonalizationSnapshot(user?.personalizationPreferences),
    [user?.personalizationPreferences],
  );

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
          useNotificationStore: typeof useNotificationStore;
          usePersonalizationStore: typeof usePersonalizationStore;
        };
      }
    ).__MOJI_SMOKE_BRIDGE__ = {
      useAuthStore,
      useSocketStore,
      useChatStore,
      useNotificationStore,
      usePersonalizationStore,
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
    applyDocumentSettings();
  }, [applyDocumentSettings]);

  useEffect(() => {
    if (!user?._id) {
      return;
    }

    if (
      arePersonalizationSnapshotsEqual(
        localPersonalizationSnapshot,
        profilePersonalizationSnapshot,
      )
    ) {
      return;
    }

    hydrateFromProfile(profilePersonalizationSnapshot);
  }, [
    hydrateFromProfile,
    localPersonalizationSnapshot,
    profilePersonalizationSnapshot,
    user?._id,
  ]);

  useEffect(() => {
    const userId = String(user?._id || "").trim();
    if (!userId) {
      if (personalizationSyncTimeoutRef.current !== null) {
        globalThis.clearTimeout(personalizationSyncTimeoutRef.current);
        personalizationSyncTimeoutRef.current = null;
      }
      return;
    }

    if (
      arePersonalizationSnapshotsEqual(
        localPersonalizationSnapshot,
        profilePersonalizationSnapshot,
      )
    ) {
      if (personalizationSyncTimeoutRef.current !== null) {
        globalThis.clearTimeout(personalizationSyncTimeoutRef.current);
        personalizationSyncTimeoutRef.current = null;
      }
      return;
    }

    if (personalizationSyncTimeoutRef.current !== null) {
      globalThis.clearTimeout(personalizationSyncTimeoutRef.current);
      personalizationSyncTimeoutRef.current = null;
    }

    const snapshotToSync = localPersonalizationSnapshot;

    personalizationSyncTimeoutRef.current = window.setTimeout(() => {
      void userService
        .updatePersonalizationPreferences(snapshotToSync)
        .then((response) => {
          if (response?.user) {
            const activeUser = useAuthStore.getState().user;
            if (activeUser && String(activeUser._id) === userId) {
              setUser(response.user);
            }
            return;
          }

          const activeUser = useAuthStore.getState().user;
          if (activeUser && String(activeUser._id) === userId) {
            setUser({
              ...activeUser,
              personalizationPreferences: snapshotToSync,
            });
          }
        })
        .catch((error) => {
          console.error(
            "Failed to sync personalization preferences to backend profile",
            error,
          );
        });
    }, 700);

    return () => {
      if (personalizationSyncTimeoutRef.current !== null) {
        globalThis.clearTimeout(personalizationSyncTimeoutRef.current);
        personalizationSyncTimeoutRef.current = null;
      }
    };
  }, [
    localPersonalizationSnapshot,
    profilePersonalizationSnapshot,
    setUser,
    user?._id,
  ]);

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

  useEffect(() => {
    if (!accessToken || !user || outgoingQueueLength <= 0) {
      return;
    }

    void flushOutgoingQueue();
  }, [accessToken, flushOutgoingQueue, outgoingQueueLength, user]);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    void flushVoiceMemoOutbox({ silent: true });
  }, [accessToken, user?._id]);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    const handleOnline = () => {
      void flushOutgoingQueue();
      void flushVoiceMemoOutbox();
    };

    globalThis.addEventListener("online", handleOnline);
    return () => {
      globalThis.removeEventListener("online", handleOnline);
    };
  }, [accessToken, flushOutgoingQueue, user]);

  useEffect(() => {
    if (!accessToken || !user || !keyboardPowerShortcutsEnabled) {
      return;
    }

    const isEditableElement = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) {
        return false;
      }

      if (element.closest("[contenteditable='true']")) {
        return true;
      }

      const tagName = element.tagName?.toLowerCase();
      return ["input", "textarea", "select"].includes(tagName);
    };

    const cycleConversation = (direction: "next" | "prev") => {
      const activeConversationId = String(
        useChatStore.getState().activeConversationId || "",
      ).trim();

      if (conversations.length === 0) {
        return;
      }

      const currentIndex = conversations.findIndex(
        (conversationItem) => String(conversationItem._id) === activeConversationId,
      );

      const offset = direction === "next" ? 1 : -1;
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + offset + conversations.length) % conversations.length;
      const targetConversationId = String(conversations[nextIndex]?._id || "").trim();

      if (targetConversationId) {
        setActiveConversation(targetConversationId);
      }
    };

    const handleGlobalShortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasCommandModifier = event.metaKey || event.ctrlKey;

      if (hasCommandModifier && event.shiftKey && key === "n") {
        event.preventDefault();
        setIsHubOpen(true);
        return;
      }

      if (isEditableElement(event.target)) {
        return;
      }

      if (event.altKey && key === "arrowdown") {
        event.preventDefault();
        cycleConversation("next");
        return;
      }

      if (event.altKey && key === "arrowup") {
        event.preventDefault();
        cycleConversation("prev");
      }
    };

    globalThis.addEventListener("keydown", handleGlobalShortcuts);
    return () => {
      globalThis.removeEventListener("keydown", handleGlobalShortcuts);
    };
  }, [
    accessToken,
    conversations,
    keyboardPowerShortcutsEnabled,
    setActiveConversation,
    setIsHubOpen,
    user,
  ]);

  // Only clean up when App unmounts.
  useEffect(() => {
    return () => disconnectSocket();
  }, [disconnectSocket]);

  return (
    <>
      <AccessibilityAnnouncer />
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
