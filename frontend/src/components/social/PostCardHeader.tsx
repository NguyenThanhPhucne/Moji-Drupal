import { Ellipsis, Globe2 } from "lucide-react";
import type { SocialPost } from "@/types/social";

interface PostCardHeaderProps {
  post: SocialPost;
  postedAgo: string;
  isOwnPost: boolean;
  canDeletePost: boolean;
  canReportPost?: boolean;
  onOpenProfile?: (userId: string) => void;
  onRequestDeletePost: () => void;
  onRequestReportPost?: () => void;
}

const PostCardHeader = ({
  post,
  postedAgo,
  isOwnPost,
  canDeletePost,
  canReportPost,
  onOpenProfile,
  onRequestDeletePost,
  onRequestReportPost,
}: PostCardHeaderProps) => {
  return (
    <header className="social-post-header flex items-start justify-between gap-3" data-testid="post-card-header">
      <button
        type="button"
        className="flex items-center gap-3 text-left group"
        onClick={() => onOpenProfile?.(post.authorId._id)}
        data-testid="post-card-author-trigger"
      >
        {/* Avatar with gradient ring on hover */}
        <div className="author-avatar-wrap flex-shrink-0">
          <div className="social-avatar-badge social-post-avatar flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-xs font-semibold ring-2 ring-transparent group-hover:ring-primary/25 transition-all duration-200">
            {post.authorId.avatarUrl ? (
              <img src={post.authorId.avatarUrl} alt={post.authorId.displayName} className="h-full w-full object-cover" />
            ) : (
              (post.authorId.displayName || "U").slice(0, 1).toUpperCase()
            )}
          </div>
        </div>

        <div>
          <p className="social-text-main social-post-author text-sm font-semibold group-hover:text-primary transition-colors duration-150">
            {post.authorId.displayName}
          </p>
          <p className="social-text-muted social-post-meta social-post-meta-row text-xs flex items-center gap-1.5">
            <span>{postedAgo}</span>
            <span aria-hidden="true" className="text-muted-foreground/40">|</span>
            <span className="inline-flex items-center gap-1">
              <Globe2 className="h-3 w-3" />
              Public
            </span>
          </p>
        </div>
      </button>

      {isOwnPost && canDeletePost ? (
        <button
          type="button"
          className="social-post-option-btn rounded-full p-2 hover:bg-primary/8 hover:text-primary transition-all duration-150 hover:rotate-90 active:scale-90"
          onClick={onRequestDeletePost}
          title="Delete post"
          aria-label="Delete post"
          data-testid="delete-post-button"
        >
          <Ellipsis className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          className="social-post-option-btn rounded-full p-2 hover:bg-muted/60 transition-all duration-150 hover:rotate-90 active:scale-90"
          onClick={onRequestReportPost}
          disabled={!canReportPost}
          aria-label="Post options"
          title={canReportPost ? "Report post" : "Post options"}
          data-testid="post-options-button"
        >
          <Ellipsis className="h-4 w-4" />
        </button>
      )}
    </header>
  );
};

export default PostCardHeader;
