import {
  getErrorDetails,
  getErrorHeaders,
  getErrorMessage,
  getErrorPayload,
  getErrorStatus,
} from "../utils/httpErrors.js";
import { logger } from "../utils/logger.js";

const IS_PRODUCTION =
  String(process.env.NODE_ENV || "").toLowerCase() === "production";

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = getErrorStatus(err, 500);
  const requestId = req.requestId || res.locals.requestId || null;

  const logMeta = {
    requestId,
    status,
    method: req.method,
    path: req.originalUrl,
    error: String(err?.message || "Unknown error"),
  };

  if (status >= 500) {
    logger.error("Unhandled request error", {
      ...logMeta,
      stack: err?.stack,
    });
  } else {
    logger.warn("Request rejected", logMeta);
  }

  const message = getErrorMessage(
    err,
    status >= 500 ? "Server error" : "Invalid request",
  );

  const payload = getErrorPayload(err);
  const responsePayload =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? { ...payload }
      : { message };

  if (!Object.prototype.hasOwnProperty.call(responsePayload, "message")) {
    responsePayload.message = message;
  }

  if (
    requestId &&
    !Object.prototype.hasOwnProperty.call(responsePayload, "requestId")
  ) {
    responsePayload.requestId = requestId;
  }

  const details = getErrorDetails(err);
  if (
    !IS_PRODUCTION &&
    details !== undefined &&
    !Object.prototype.hasOwnProperty.call(responsePayload, "details")
  ) {
    responsePayload.details = details;
  }

  const errorHeaders = getErrorHeaders(err);
  if (errorHeaders && typeof errorHeaders === "object" && !Array.isArray(errorHeaders)) {
    Object.entries(errorHeaders).forEach(([key, value]) => {
      if (value !== undefined) {
        res.setHeader(key, String(value));
      }
    });
  }

  res.status(status).json(responsePayload);
};
