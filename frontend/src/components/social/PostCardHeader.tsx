import { Ellipsis, Globe2 } from "lucide-react";
import type { SocialPost } from "@/types/social";

interface PostCardHeaderProps {
  post: SocialPost;
  postedAgo: string;
  isOwnPost: boolean;
  canDeletePost: boolean;
  onOpenProfile?: (userId: string) => void;
  onRequestDeletePost: () => void;
}

const PostCardHeader = ({
  post,
  postedAgo,
  isOwnPost,
  canDeletePost,
  onOpenProfile,
  onRequestDeletePost,
}: PostCardHeaderProps) => {
  return (
    <header className="social-post-header flex items-start justify-between gap-3" data-testid="post-card-header">
      <button
        type="button"
        className="flex items-center gap-3 text-left"
        onClick={() => onOpenProfile?.(post.authorId._id)}
        data-testid="post-card-author-trigger"
      >
        <div className="social-avatar-badge social-post-avatar flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-xs font-semibold">
          {post.authorId.avatarUrl ? (
            <img src={post.authorId.avatarUrl} alt={post.authorId.displayName} className="h-full w-full object-cover" />
          ) : (
            (post.authorId.displayName || "U").slice(0, 1).toUpperCase()
          )}
        </div>
        <div>
          <p className="social-text-main social-post-author text-sm font-semibold">{post.authorId.displayName}</p>
          <p className="social-text-muted social-post-meta social-post-meta-row text-xs">
            <span>{postedAgo}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Globe2 className="h-3.5 w-3.5" />
              Public
            </span>
          </p>
        </div>
      </button>

      {isOwnPost && canDeletePost ? (
        <button
          type="button"
          className="social-post-option-btn rounded-full p-1.5"
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
          className="social-post-option-btn rounded-full p-1.5"
          aria-label="Post options"
          data-testid="post-options-button"
        >
          <Ellipsis className="h-4 w-4" />
        </button>
      )}
    </header>
  );
};

export default PostCardHeader;
