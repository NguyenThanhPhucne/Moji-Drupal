import { Button } from "@/components/ui/button";
import UserAvatar from "./UserAvatar";

interface ExploreUserItemProps {
  person: {
    _id?: string;
    displayName?: string;
    avatarUrl?: string | null;
    username?: string;
  };
  onViewProfile?: (userId: string) => void;
  customActions?: React.ReactNode;
}

export const ExploreUserItem = ({ person, onViewProfile, customActions }: ExploreUserItemProps) => {
  return (
    <div className="enterprise-list-item group">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="group-hover:scale-105 transition-transform duration-300">
          <UserAvatar type="sidebar" name={person.displayName || "Unknown"} avatarUrl={person.avatarUrl || undefined} />
        </div>
        <div className="font-medium">
          <p className="text-[15px] tracking-tight">{person.displayName}</p>
          <p className="text-[12.5px] text-muted-foreground">@{person.username}</p>
        </div>
      </div>
      
      <div className="group-focus-within:opacity-100 enterprise-action-reveal gap-2 sm:visible">
        {customActions ? (
          customActions
        ) : onViewProfile ? (
          <Button 
            variant="outline" 
            className="rounded-full shadow-sm group-hover:border-primary/50 group-hover:text-primary transition-colors text-[13px] h-8 px-4 font-semibold active:scale-95"
            onClick={() => {
              if (person._id) onViewProfile(person._id);
            }}
          >
            View
          </Button>
        ) : null}
      </div>
    </div>
  );
};
