import mongoose from "mongoose";
import { logger } from "./logger.js";

const isTransactionsUnsupportedError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("transaction numbers are only allowed") ||
    message.includes("replica set") ||
    message.includes("transaction is not supported")
  );
};

export const runWithMongoSession = async (
  work,
  { allowFallback = true, label = "mongo-transaction" } = {},
) => {
  const session = await mongoose.startSession();

  try {
    return await session.withTransaction(() => work(session));
  } catch (error) {
    if (allowFallback && isTransactionsUnsupportedError(error)) {
      logger.warn(
        `[${label}] Transactions unavailable, falling back to non-transactional flow.`,
        { error: error?.message || error },
      );
      return await work(null);
    }

    throw error;
  } finally {
    session.endSession();
  }
};
