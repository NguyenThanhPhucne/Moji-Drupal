import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  LoaderCircle,
  RefreshCw,
  Search,
  Target,
  UserMinus,
  Users,
  Compass,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useFriendStore } from "@/stores/useFriendStore";
import { useChatStore } from "@/stores/useChatStore";
import { useSocialStore } from "@/stores/useSocialStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/dialog";

import DialogFriendListSkeleton from "../skeleton/DialogFriendListSkeleton";
import { FriendListItem } from "./FriendListItem";
import { ExploreUserItem } from "./ExploreUserItem";
import { EmptyListState } from "./EmptyListState";

type FriendPresenceFilter = "all" | "online" | "recently-active";

const FRIEND_FILTER_OPTIONS: Array<{ value: FriendPresenceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "online", label: "Online" },
  { value: "recently-active", label: "Recent" },
];

// NOSONAR
const FriendsManagerDialog = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [exploreQuery, setExploreQuery] = useState("");
  const [presenceFilter, setPresenceFilter] = useState<FriendPresenceFilter>("all");
  const [isRefreshingFriends, setIsRefreshingFriends] = useState(false);
  const [processingAction, setProcessingAction] = useState<{
    friendId: string;
    action: "chat" | "remove";
  } | null>(null);
  const [friendPendingRemoval, setFriendPendingRemoval] = useState<{
    friendId: string;
    displayName: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState("all-friends");
  const [hasFetched, setHasFetched] = useState(false);

  const { friends, getFriends, removeFriend, loading: friendLoading } = useFriendStore();
  const { createConversation, loading: chatLoading } = useChatStore();
  const { homeFeed } = useSocialStore();
  const { getUserPresence } = useSocketStore();

  const deferredQuery = useDeferredValue(query);
  const deferredExploreQuery = useDeferredValue(exploreQuery);

  const isInitialFriendsLoading = friendLoading && !hasFetched;

  const fetchFriendsSafely = useCallback(async () => {
    try {
      await getFriends();
    } catch (error) {
      console.error("Failed to fetch friends", error);
      throw error;
    }
  }, [getFriends]);

  const handleRefreshFriends = useCallback(async () => {
    setIsRefreshingFriends(true);
    try {
      await fetchFriendsSafely();
    } catch {
      toast.error("Could not refresh friends right now.");
    } finally {
      setIsRefreshingFriends(false);
    }
  }, [fetchFriendsSafely]);

  useEffect(() => {
    if (open) {
      fetchFriendsSafely().finally(() => setHasFetched(true));
    } else {
      setHasFetched(false);
      setQuery("");
      setExploreQuery("");
      setPresenceFilter("all");
    }
  }, [open, fetchFriendsSafely]);

  const filteredFriends = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    const rank = (presence: "online" | "recently-active" | "offline") => {
      if (presence === "online") {
        return 3;
      }

      if (presence === "recently-active") {
        return 2;
      }

      return 1;
    };

    return friends
      .map((friend) => ({
        ...friend,
        presence: getUserPresence(friend._id),
      }))
      .filter((friend) => {
        if (presenceFilter !== "all" && friend.presence !== presenceFilter) {
          return false;
        }

        if (!normalized) {
          return true;
        }

        const displayName = friend.displayName?.toLowerCase() ?? "";
        const username = friend.username?.toLowerCase() ?? "";
        return displayName.includes(normalized) || username.includes(normalized);
      })
      .sort(
        (left, right) =>
          rank(right.presence) - rank(left.presence) ||
          String(left.displayName || "").localeCompare(String(right.displayName || "")),
      );
  }, [deferredQuery, friends, getUserPresence, presenceFilter]);

  // Suggestions logic leveraging Feed authors completely mapped from DB
  const suggestions = useMemo(() => {
    const friendIds = new Set(friends.map((f) => String(f._id)));
    const map = new Map<string, { _id?: string; displayName?: string; avatarUrl?: string | null; username?: string; }>();
    
    homeFeed.forEach((post) => {
      const authorId = String(post.authorId?._id || "");
      if (!authorId || friendIds.has(authorId)) return;
      if (!map.has(authorId)) {
        map.set(authorId, post.authorId);
      }
    });

    return Array.from(map.values()).slice(0, 10);
  }, [homeFeed, friends]);

  const filteredSuggestions = useMemo(() => {
    const normalized = deferredExploreQuery.trim().toLowerCase();
    if (!normalized) {
      return suggestions;
    }

    return suggestions.filter((person) => {
      const displayName = String(person.displayName || "").toLowerCase();
      const username = String(person.username || "").toLowerCase();
      return displayName.includes(normalized) || username.includes(normalized);
    });
  }, [deferredExploreQuery, suggestions]);

  const handleStartChat = async (friendId: string) => {
    if (processingAction) {
      return;
    }

    try {
      setProcessingAction({ friendId, action: "chat" });
      const ok = await createConversation("direct", "", [friendId]);
      if (!ok) {
        toast.error("Could not open conversation. Please try again.");
        return;
      }
      setOpen(false);
    } catch (error) {
      console.error("Failed to open direct chat", error);
      toast.error("Could not open conversation. Please try again.");
    } finally {
      setProcessingAction(null);
    }
  };

  const requestRemoveFriend = (friendId: string, displayName: string) => {
    setFriendPendingRemoval({ friendId, displayName });
  };

  const handleRemoveFriend = async () => {
    if (!friendPendingRemoval) {
      return;
    }

    const { friendId, displayName } = friendPendingRemoval;

    if (processingAction) {
      return;
    }

    setProcessingAction({ friendId, action: "remove" });
    const result = await removeFriend(friendId);

    if (result.ok) {
      toast.success(result.message || `${displayName} was removed.`);
    } else {
      toast.error(result.message);
    }

    setProcessingAction(null);
    setFriendPendingRemoval(null);
  };

  const hasFriendsFilter =
    presenceFilter !== "all" || deferredQuery.trim().length > 0;
  let exploreContent = (
    <div className="grid gap-1">
      {filteredSuggestions.map((person, index) => (
        <div
          key={person._id}
          className="people-tab-stagger-item people-tab-stagger-item--explore"
          style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
        >
          <ExploreUserItem
            person={person}
            onViewProfile={(id) => {
              setOpen(false);
              navigate(`/profile/${id}`);
            }}
          />
        </div>
      ))}
    </div>
  );

  if (isInitialFriendsLoading) {
    exploreContent = <DialogFriendListSkeleton count={4} className="people-skeleton-morph" />;
  } else if (filteredSuggestions.length === 0) {
    exploreContent = (
      <div className="people-tab-stagger-item" style={{ animationDelay: "40ms" }}>
        <EmptyListState type="no-suggestions" />
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center size-5 rounded-full hover:bg-sidebar-accent/80 cursor-pointer transition-colors"
          aria-label="Open friends list"
          title="Friends"
        >
          <Users className="size-4 text-muted-foreground hover:text-foreground" />
        </button>
      </DialogTrigger>

      <DialogContent className="people-manager-modal people-manager-modal--command sm:max-w-[700px] p-0 overflow-hidden gap-0 flex flex-col bg-card">
        <DialogHeader className="modal-stagger-item px-6 pt-6 pb-2">
          <DialogTitle className="text-xl">Friends Hub</DialogTitle>
          <DialogDescription>
            Manage your network, message connections, and discover new people.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="people-manager-tabs w-full flex-1 flex flex-col min-h-0">
          <div className="px-6 relative">
            <TabsList className="people-manager-tabs-list people-manager-tabs-list--command w-full justify-start rounded-none border-b bg-transparent p-0 h-auto gap-6">
              <TabsTrigger
                value="all-friends"
                className="people-manager-tab-trigger people-manager-tab-trigger--command relative rounded-none border-b-2 border-transparent px-1 pb-3 pt-2 font-semibold text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-[color,border-color,background-color] outline-none"
              >
                <Users className="h-4 w-4 mr-2" />
                My Friends
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                  {friends.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="explore"
                className="people-manager-tab-trigger people-manager-tab-trigger--command relative rounded-none border-b-2 border-transparent px-1 pb-3 pt-2 font-semibold text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-[color,border-color,background-color] outline-none"
              >
                <Compass className="h-4 w-4 mr-2" />
                Explore
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto beautiful-scrollbar bg-card/40 h-[65vh] sm:h-[60vh] pb-4">
            {/* -- TAB 1: ALL FRIENDS -- */}
            <TabsContent value="all-friends" className="people-tab-panel m-0 h-full p-6 outline-none animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col">
              <div className="people-manager-toolbar mb-4 mt-0 shrink-0">
                <div className="relative flex items-center w-full">
                  <Search className="absolute left-3.5 size-[15px] text-muted-foreground/60 pointer-events-none" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by name or username"
                    className="people-manager-search-input people-manager-search-input--command search-input-pill pl-9 h-10 rounded-xl border-border/80 transition-[border-color,box-shadow,background-color] focus-visible:border-primary/50 focus-visible:ring-primary/20"
                  />
                </div>

                <div className="people-manager-summary-row mt-3">
                  <p className="people-manager-summary-text text-sm">
                    Showing {filteredFriends.length} of {friends.length} friends
                  </p>
                  <div className="flex items-center gap-1.5">
                    {FRIEND_FILTER_OPTIONS.map((filterOption) => {
                      const active = presenceFilter === filterOption.value;
                      return (
                        <button
                          key={filterOption.value}
                          type="button"
                          onClick={() => setPresenceFilter(filterOption.value)}
                          className={[
                            "micro-tap-chip rounded-full border px-2 py-1 text-[10.5px] font-semibold transition-colors",
                            active
                              ? "border-primary/45 bg-primary/10 text-primary"
                              : "border-border/70 bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
                          ].join(" ")}
                        >
                          {filterOption.label}
                        </button>
                      );
                    })}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                      disabled={isRefreshingFriends}
                      onClick={() => {
                        handleRefreshFriends().catch((error) => {
                          console.error("Failed to refresh friends", error);
                        });
                      }}
                      title="Refresh friends"
                      aria-label="Refresh friends"
                    >
                      {isRefreshingFriends ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                    </Button>
                  </div>
                  {hasFriendsFilter ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-primary/80 hover:text-primary rounded-lg"
                      onClick={() => {
                        setQuery("");
                        setPresenceFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="people-manager-list-shell bg-transparent border-0 min-h-0 flex-1">
                <div className="people-manager-list-scroll pb-6">
                {isInitialFriendsLoading ? (
                  <DialogFriendListSkeleton count={5} showActions className="people-skeleton-morph" />
                ) : (
                  <>
                    {filteredFriends.length === 0 && (
                      <div className="people-tab-stagger-item" style={{ animationDelay: "40ms" }}>
                        <EmptyListState 
                          type={query.trim() ? "no-match" : "no-friends"} 
                          query={query} 
                          onExploreClick={query.trim() ? undefined : () => setActiveTab("explore")} 
                        />
                      </div>
                    )}

                    {filteredFriends.map((friend, index) => {
                      const friendId = String(friend._id);
                      const busyAction =
                        processingAction?.friendId === friendId
                          ? processingAction.action
                          : null;
                      const disabled = Boolean(processingAction) || chatLoading;

                      return (
                        <div
                          key={friendId}
                          className="people-tab-stagger-item"
                          style={{ animationDelay: `${Math.min(index, 12) * 34}ms` }}
                        >
                          <FriendListItem
                            friend={friend}
                            disabled={disabled}
                            busyAction={busyAction}
                            onChat={handleStartChat}
                            onRemove={requestRemoveFriend}
                            onViewProfile={(id) => {
                              setOpen(false);
                              navigate(`/profile/${id}`);
                            }}
                          />
                        </div>
                      );
                    })}
                  </>
                )}
                </div>
              </div>
            </TabsContent>

            {/* -- TAB 2: EXPLORE (PEOPLE YOU MAY KNOW) -- */}
            <TabsContent value="explore" className="people-tab-panel m-0 h-full p-6 outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="grid gap-2 outline-none">
                 <div className="relative flex items-center w-full mb-1">
                   <Search className="absolute left-3.5 size-[15px] text-muted-foreground/60 pointer-events-none" />
                   <Input
                     value={exploreQuery}
                     onChange={(event) => setExploreQuery(event.target.value)}
                     placeholder="Search suggested people"
                     className="people-manager-search-input people-manager-search-input--command search-input-pill pl-9 h-10 rounded-xl border-border/80 transition-[border-color,box-shadow,background-color] focus-visible:border-primary/50 focus-visible:ring-primary/20"
                   />
                 </div>

                 <div className="bg-primary/5 p-4 rounded-xl border border-primary/15 flex items-center gap-3 w-full shrink-0 mb-3 shadow-inner">
                   <Target className="size-8 text-primary shadow-primary/20" />
                   <div>
                      <p className="text-sm font-semibold text-primary/90 tracking-tight">Expand your network</p>
                      <p className="text-[12px] text-muted-foreground/80 font-medium">Connect with active people from the community</p>
                   </div>
                 </div>

                 {exploreContent}
              </div>
            </TabsContent>
          </div>
        </Tabs>

      </DialogContent>

      <AlertDialog
        open={Boolean(friendPendingRemoval)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !processingAction) {
            setFriendPendingRemoval(null);
          }
        }}
      >
        <AlertDialogContent
          className="chat-modal-shell chat-modal-shell--danger max-w-[340px] p-6 rounded-[28px] overflow-hidden"
          aria-busy={Boolean(processingAction)}
        >
          <AlertDialogHeader className="items-center text-center modal-stagger-item gap-1">
            <div className="dialog-danger-icon size-12 bg-destructive/10 text-destructive mb-2 rounded-full flex items-center justify-center">
              <UserMinus className="size-5" />
            </div>
            <AlertDialogTitle className="text-lg font-bold tracking-tight">Remove friend?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13.5px] leading-snug text-muted-foreground/80 px-2 font-medium">
              {friendPendingRemoval
                ? `You won't be able to quick-chat with ${friendPendingRemoval.displayName} anymore.`
                : "This is a permanent action. The user will be removed from your lists."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="sm:flex-col-reverse gap-2 sm:space-x-0 mt-5 modal-stagger-item">
            <AlertDialogCancel
              className="mt-0 sm:mt-0 font-semibold rounded-xl h-10 border-0 hover:bg-muted/80 transition-colors"
              onClick={() => setFriendPendingRemoval(null)}
              disabled={Boolean(processingAction)}
            >
              Keep Friend
            </AlertDialogCancel>
            <AlertDialogAction
              className="people-manager-danger-action people-manager-danger-action--command bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold focus:ring-destructive rounded-xl h-10 transition-colors"
              onClick={() => {
                handleRemoveFriend().catch((error) => {
                  console.error("Failed to remove friend", error);
                });
              }}
              disabled={Boolean(processingAction)}
            >
              {processingAction?.action === "remove" ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

export default FriendsManagerDialog;
