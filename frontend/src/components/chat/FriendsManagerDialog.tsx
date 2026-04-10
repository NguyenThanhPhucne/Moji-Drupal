import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserMinus, Users, Search, Target, Compass } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useFriendStore } from "@/stores/useFriendStore";
import { useChatStore } from "@/stores/useChatStore";
import { useSocialStore } from "@/stores/useSocialStore";
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

const FriendsManagerDialog = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [processingFriendId, setProcessingFriendId] = useState<string | null>(null);
  const [friendPendingRemoval, setFriendPendingRemoval] = useState<{
    friendId: string;
    displayName: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState("all-friends");
  const [hasFetched, setHasFetched] = useState(false);

  const { friends, getFriends, removeFriend, loading: friendLoading } = useFriendStore();
  const { createConversation, loading: chatLoading } = useChatStore();
  const { homeFeed } = useSocialStore();
  
  const isInitialFriendsLoading = friendLoading && !hasFetched;

  useEffect(() => {
    if (open) {
      void getFriends().finally(() => setHasFetched(true));
    } else {
      setHasFetched(false);
    }
  }, [open, getFriends]);

  const filteredFriends = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return friends;
    }

    return friends.filter((friend) => {
      const displayName = friend.displayName?.toLowerCase() ?? "";
      const username = friend.username?.toLowerCase() ?? "";
      return displayName.includes(normalized) || username.includes(normalized);
    });
  }, [friends, query]);

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

  const handleStartChat = async (friendId: string) => {
    try {
      setProcessingFriendId(friendId);
      const ok = await createConversation("direct", "", [friendId]);
      if (!ok) {
        toast.error("Could not open conversation. Please try again.");
        return;
      }
      setOpen(false);
    } finally {
      setProcessingFriendId(null);
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

    setProcessingFriendId(friendId);
    const result = await removeFriend(friendId);

    if (result.ok) {
      toast.success(result.message || `${displayName} was removed.`);
    } else {
      toast.error(result.message);
    }

    setProcessingFriendId(null);
    setFriendPendingRemoval(null);
  };

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

      <DialogContent className="people-manager-modal sm:max-w-[700px] p-0 overflow-hidden gap-0 flex flex-col bg-card">
        <DialogHeader className="modal-stagger-item px-6 pt-6 pb-2">
          <DialogTitle className="text-xl">Friends Hub</DialogTitle>
          <DialogDescription>
            Manage your network, message connections, and discover new people.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col min-h-0">
          <div className="px-6 relative">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 h-auto gap-6">
              <TabsTrigger
                value="all-friends"
                className="relative rounded-none border-b-2 border-transparent px-1 pb-3 pt-2 font-semibold text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all outline-none"
              >
                <Users className="h-4 w-4 mr-2" />
                My Friends
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                  {friends.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="explore"
                className="relative rounded-none border-b-2 border-transparent px-1 pb-3 pt-2 font-semibold text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all outline-none"
              >
                <Compass className="h-4 w-4 mr-2" />
                Explore
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto beautiful-scrollbar bg-card/40 h-[65vh] sm:h-[60vh] pb-4">
            {/* -- TAB 1: ALL FRIENDS -- */}
            <TabsContent value="all-friends" className="m-0 h-full p-6 outline-none animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col">
              <div className="people-manager-toolbar mb-4 mt-0 shrink-0">
                <div className="relative flex items-center w-full">
                  <Search className="absolute left-3.5 size-[15px] text-muted-foreground/60 pointer-events-none" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by name or username"
                    className="search-input-pill pl-9 h-10 border-border/80 focus-visible:ring-primary/20 focus-visible:border-primary/50 transition-all rounded-xl"
                  />
                </div>

                <div className="people-manager-summary-row mt-3">
                  <p className="people-manager-summary-text text-sm">
                    Showing {filteredFriends.length} of {friends.length} friends
                  </p>
                  {query.trim() ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-primary/80 hover:text-primary rounded-lg"
                      onClick={() => setQuery("")}
                    >
                      Clear search
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="people-manager-list-shell bg-transparent border-0 min-h-0 flex-1">
                <div className="people-manager-list-scroll pb-6">
                {isInitialFriendsLoading ? (
                  <DialogFriendListSkeleton count={5} showActions />
                ) : (
                  <>
                    {filteredFriends.length === 0 && (
                      <EmptyListState 
                        type={query.trim() ? "no-match" : "no-friends"} 
                        query={query} 
                        onExploreClick={query.trim() ? undefined : () => setActiveTab("explore")} 
                      />
                    )}

                    {filteredFriends.map((friend) => {
                      const busy = processingFriendId === friend._id;
                      const disabled = busy || chatLoading;

                      return (
                        <FriendListItem
                          key={String(friend._id)}
                          friend={friend}
                          disabled={disabled}
                          onChat={handleStartChat}
                          onRemove={requestRemoveFriend}
                          onViewProfile={(id) => {
                            setOpen(false);
                            navigate(`/profile/${id}`);
                          }}
                        />
                      );
                    })}
                  </>
                )}
                </div>
              </div>
            </TabsContent>

            {/* -- TAB 2: EXPLORE (PEOPLE YOU MAY KNOW) -- */}
            <TabsContent value="explore" className="m-0 h-full p-6 outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="grid gap-2 outline-none">
                 <div className="bg-primary/5 p-4 rounded-xl border border-primary/15 flex items-center gap-3 w-full shrink-0 mb-3 shadow-inner">
                   <Target className="size-8 text-primary shadow-primary/20" />
                   <div>
                      <p className="text-sm font-semibold text-primary/90 tracking-tight">Expand your network</p>
                      <p className="text-[12px] text-muted-foreground/80 font-medium">Connect with active people from the community</p>
                   </div>
                 </div>

                 {suggestions.length === 0 ? (
                   <EmptyListState type="no-suggestions" />
                 ) : (
                   <div className="grid gap-1">
                     {suggestions.map((person) => (
                       <ExploreUserItem 
                         key={person._id} 
                         person={person} 
                         onViewProfile={(id) => {
                           setOpen(false);
                           navigate(`/profile/${id}`);
                         }} 
                       />
                     ))}
                   </div>
                 )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

      </DialogContent>

      <AlertDialog
        open={Boolean(friendPendingRemoval)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !processingFriendId) {
            setFriendPendingRemoval(null);
          }
        }}
      >
        <AlertDialogContent
          className="chat-modal-shell chat-modal-shell--danger max-w-[340px] p-6 rounded-[28px] overflow-hidden"
          aria-busy={Boolean(processingFriendId)}
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
              disabled={Boolean(processingFriendId)}
            >
              Keep Friend
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-md font-semibold focus:ring-destructive rounded-xl h-10 transition-all active:scale-[0.98]"
              onClick={() => void handleRemoveFriend()}
              disabled={Boolean(processingFriendId)}
            >
              {processingFriendId ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

export default FriendsManagerDialog;
