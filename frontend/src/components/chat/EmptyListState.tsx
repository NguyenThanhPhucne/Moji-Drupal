import { Button } from "@/components/ui/button";
import { Compass, UserMinus } from "lucide-react";

interface EmptyListStateProps {
  type: "no-match" | "no-friends" | "no-suggestions";
  query?: string;
  onExploreClick?: () => void;
}

export const EmptyListState = ({ type, query, onExploreClick }: EmptyListStateProps) => {
  if (type === "no-suggestions") {
    return (
      <div className="enterprise-empty-state animate-in fade-in slide-in-from-bottom-1 duration-400">
        <div className="enterprise-empty-icon relative">
          <Compass className="size-5 text-primary/70" />
          <span className="absolute inset-0 rounded-full border border-primary/20 animate-ping opacity-25" />
        </div>
        <p className="text-[13.5px] font-medium text-foreground/80 mt-1">No suggestions right now</p>
        <p className="text-xs text-muted-foreground/70 mt-1 max-w-[200px] leading-relaxed">
          Interact with posts occasionally to get better suggestions.
        </p>
      </div>
    );
  }

  return (
    <div className="enterprise-empty-state animate-in fade-in slide-in-from-bottom-1 duration-400">
      <div className="enterprise-empty-icon relative">
        <UserMinus className="size-6 text-muted-foreground/70" />
      </div>
      <p className="text-[14px] font-semibold text-foreground/80 mt-1">
        {type === "no-match" ? "No matches found" : "No friends yet"}
      </p>
      <p className="text-[12.5px] text-muted-foreground/70 mt-1 max-w-[240px] leading-relaxed">
        {type === "no-match"
          ? `Try adjusting your search for "${query}"`
          : "Connect with people in the Explore tab to start chatting."}
      </p>
      {type === "no-friends" && onExploreClick && (
        <Button
          className="mt-5 rounded-full shadow-sm hover:shadow-md active:scale-95 transition-all profile-action-gradient"
          onClick={onExploreClick}
        >
          <Compass className="size-4 mr-1.5" />
          Find People
        </Button>
      )}
    </div>
  );
};
