export interface PersonalizationPreferences {
  locale?: "en" | "vi";
  startPagePreference?: "chat" | "feed" | "explore" | "saved";
  timestampStylePreference?: "relative" | "absolute";
  notificationGroupingPreference?: "auto" | "priority" | "time";
  notificationDensityPreference?: "comfortable" | "compact";
}

export interface User {
  _id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  phone?: string;
  showOnlineStatus?: boolean;
  notificationPreferences?: {
    message: boolean;
    sound: boolean;
    desktop: boolean;
    social?: {
      muted: boolean;
      follow: boolean;
      like: boolean;
      comment: boolean;
      mention: boolean;
      friendAccepted: boolean;
      system: boolean;
      mutedUserIds?: string[];
      mutedConversationIds?: string[];
      digestEnabled?: boolean;
      digestWindowHours?: number;
    };
  };
  personalizationPreferences?: PersonalizationPreferences;
  createdAt?: string;
  updatedAt?: string;
}

export interface Friend {
  _id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

export interface FriendRequest {
  _id: string;
  from?: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  to?: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  message: string;
  createdAt: string;
  updatedAt: string;
}
