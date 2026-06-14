export class HttpError extends Error {
  constructor(status, message, { details, payload, headers } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = Number(status) || 500;
    this.details = details;
    this.payload = payload;
    this.headers = headers;
  }
}

const looksLikeOptions = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (
    Object.prototype.hasOwnProperty.call(value, "payload") ||
    Object.prototype.hasOwnProperty.call(value, "headers") ||
    Object.prototype.hasOwnProperty.call(value, "details")
  );
};

export const createHttpError = (status, message, detailsOrOptions, options) => {
  if (looksLikeOptions(detailsOrOptions)) {
    return new HttpError(status, message, detailsOrOptions);
  }

  return new HttpError(status, message, {
    details: detailsOrOptions,
    ...(options || {}),
  });
};

export const isHttpError = (error) => {
  if (!error) {
    return false;
  }

  if (error instanceof HttpError) {
    return true;
  }

  return Number.isFinite(Number(error.status || error.statusCode));
};

export const getErrorStatus = (error, fallbackStatus = 500) => {
  const status = Number(error?.status || error?.statusCode);
  if (!Number.isFinite(status) || status < 100 || status > 599) {
    return fallbackStatus;
  }

  return status;
};

export const getErrorMessage = (error, fallbackMessage) => {
  const message = String(error?.message || "").trim();
  return message || fallbackMessage;
};

export const getErrorDetails = (error) => {
  return error?.details;
};

export const getErrorPayload = (error) => {
  return error?.payload;
};

export const getErrorHeaders = (error) => {
  return error?.headers;
};
