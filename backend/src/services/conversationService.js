import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";

/**
 * Normalizes user A and B ID to form a unique direct conversation key
 */
export const buildDirectConversationKey = (userA, userB) => {
  return [String(userA), String(userB)]
    .sort((left, right) => left.localeCompare(right))
    .join(":");
};

/**
 * Gets MongoDB user ID from Drupal ID
 * Useful for syncing across architecture where legacy Drupal IDs are still passed
 */
export const getMongoUserIdFromDrupalId = async (drupalId) => {
  if (/^[0-9a-fA-F]{24}$/.test(drupalId)) {
    return drupalId;
  }
  const drupalIdInt = Number.parseInt(drupalId, 10);
  try {
    let user = await User.findOne({ drupalId: drupalIdInt });
    if (user) {
      return user._id.toString();
    }
    user = await User.findOne({
      $or: [
        { username: `drupal_${drupalId}` },
        { email: `drupal_${drupalId}@temp.local` },
      ],
    });
    if (user) {
      return user._id.toString();
    }
    throw new Error(
      `User with Drupal ID "${drupalId}" not found in MongoDB. Ensure the user is properly synced before creating conversations.`,
    );
  } catch (error) {
    console.error("Error mapping Drupal ID to MongoDB:", error.message);
    throw error;
  }
};

/**
 * Resolves Participant object IDs and formats to consistent structure
 */
export const formatConversationForEmit = async (conversation) => {
  await conversation.populate([
    { path: "participants.userId", select: "displayName avatarUrl" },
    { path: "seenBy", select: "displayName avatarUrl" },
    { path: "lastMessage.senderId", select: "displayName avatarUrl" },
  ]);

  const participants = (conversation.participants || []).map((p) => ({
    _id: p.userId?._id,
    displayName: p.userId?.displayName,
    avatarUrl: p.userId?.avatarUrl ?? null,
    joinedAt: p.joinedAt,
  }));

  return {
    ...conversation.toObject(),
    participants,
  };
};
