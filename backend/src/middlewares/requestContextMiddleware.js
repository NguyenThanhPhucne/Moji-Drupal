import { randomUUID } from "node:crypto";

const getHeaderValue = (value) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

export const requestContext = (req, res, next) => {
  const rawHeader = getHeaderValue(req.headers["x-request-id"]);
  const incomingId = String(rawHeader || "").trim();
  const requestId = incomingId || randomUUID();

  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  next();
};
