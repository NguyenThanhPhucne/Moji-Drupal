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
      <div className="enterprise-empty-state">
        <div className="enterprise-empty-icon">
          <Compass className="size-5 text-muted-foreground/70" />
        </div>
        <p className="text-[13.5px] font-medium text-foreground/80">No suggestions right now</p>
        <p className="text-xs text-muted-foreground/70 mt-1 max-w-[200px]">
          Interact with posts occasionally to get better suggestions.
        </p>
      </div>
    );
  }

  return (
    <div className="enterprise-empty-state">
      <div className="enterprise-empty-icon">
        <UserMinus className="size-6 text-muted-foreground/80" />
      </div>
      <p className="text-[14px] font-semibold text-foreground/80">
        {type === "no-match" ? "No matches found" : "No friends yet"}
      </p>
      <p className="text-[12.5px] text-muted-foreground/70 mt-1 max-w-[240px]">
        {type === "no-match"
          ? `Try adjusting your search for "${query}"`
          : "Connect with people in the Explore tab to start chatting."}
      </p>
      {type === "no-friends" && onExploreClick && (
        <Button 
          className="mt-6 rounded-full shadow-sm hover:shadow active:scale-95 transition-all" 
          onClick={onExploreClick}
        >
          <Compass className="size-4 mr-1.5" />
          Find People
        </Button>
      )}
    </div>
  );
};
