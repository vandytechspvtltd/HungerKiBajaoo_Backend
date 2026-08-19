import { errorResponse } from "../utils/response.js";

export const errorHandler = (err, req, res, next) => {
  console.error(err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || 500;
  const message = err.message || "Something went wrong";
  return errorResponse(res, message, status);
};
