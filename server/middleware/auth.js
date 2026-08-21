import crypto from "crypto";
import { supabase } from "../config/supabase.js";

const DEV_ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const DEV_REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const devSessionStore = new Map();

const getDevSessionFromToken = (token) => {
  const exactMatch = devSessionStore.get(token);
  if (exactMatch) {
    return exactMatch;
  }

  for (const session of devSessionStore.values()) {
    if (session.accessToken === token || session.refreshToken === token) {
      return session;
    }
  }

  return null;
};

const isDevSessionExpired = (session, type = "access") => {
  if (!session) return true;
  const now = Date.now();
  if (type === "refresh") {
    return now > session.refreshExpiresAt;
  }

  return now > session.accessExpiresAt;
};

export const createDevSessionForUser = (userId) => {
  const accessToken = `dev-${crypto.randomBytes(24).toString("hex")}`;
  const refreshToken = `dev-refresh-${crypto.randomBytes(32).toString("hex")}`;
  const now = Date.now();
  const session = {
    userId,
    accessToken,
    refreshToken,
    accessExpiresAt: now + DEV_ACCESS_TOKEN_TTL_MS,
    refreshExpiresAt: now + DEV_REFRESH_TOKEN_TTL_MS,
    createdAt: now,
  };

  devSessionStore.set(accessToken, session);
  devSessionStore.set(refreshToken, session);

  return {
    accessToken,
    refreshToken,
  };
};

export const rotateDevRefreshToken = (refreshToken) => {
  const session = getDevSessionFromToken(refreshToken);
  if (!session || session.refreshToken !== refreshToken) {
    return null;
  }

  if (isDevSessionExpired(session, "refresh")) {
    revokeDevSession(refreshToken);
    return null;
  }

  const nextAccessToken = `dev-${crypto.randomBytes(24).toString("hex")}`;
  const nextRefreshToken = `dev-refresh-${crypto.randomBytes(32).toString("hex")}`;
  const now = Date.now();
  const nextSession = {
    userId: session.userId,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    accessExpiresAt: now + DEV_ACCESS_TOKEN_TTL_MS,
    refreshExpiresAt: now + DEV_REFRESH_TOKEN_TTL_MS,
    createdAt: now,
  };

  devSessionStore.delete(session.accessToken);
  devSessionStore.delete(session.refreshToken);
  devSessionStore.set(nextAccessToken, nextSession);
  devSessionStore.set(nextRefreshToken, nextSession);

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    userId: session.userId,
  };
};

export const revokeDevSession = (token) => {
  const session = getDevSessionFromToken(token);
  if (!session) {
    return null;
  }

  devSessionStore.delete(session.accessToken);
  devSessionStore.delete(session.refreshToken);
  return session;
};

export const isDevSessionRevoked = (token) => {
  return !getDevSessionFromToken(token);
};

export const getDevUserIdFromAccessToken = (token) => {
  const session = getDevSessionFromToken(token);
  if (!session || session.accessToken !== token || isDevSessionExpired(session, "access")) {
    if (session) {
      revokeDevSession(token);
    }
    return null;
  }

  return session.userId ?? null;
};

export const getDevUserIdFromRefreshToken = (token) => {
  const session = getDevSessionFromToken(token);
  if (!session || session.refreshToken !== token || isDevSessionExpired(session, "refresh")) {
    if (session) {
      revokeDevSession(token);
    }
    return null;
  }

  return session.userId ?? null;
};

export const getDevUserIdFromToken = (token) => {
  if (String(token).startsWith("dev-refresh-")) {
    return getDevUserIdFromRefreshToken(token);
  }

  return getDevUserIdFromAccessToken(token);
};

export const deleteDevSessionsForUser = (userId) => {
  for (const [token, session] of devSessionStore.entries()) {
    if (session.userId === userId) {
      devSessionStore.delete(token);
    }
  }
};

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authorization header missing or invalid" });
    }

    const token = authHeader.split(" ")[1];
    if (process.env.NODE_ENV !== "production" && token.startsWith("dev-")) {
      const userId = getDevUserIdFromAccessToken(token);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
      }

      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (error || !data?.user) {
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
      }

      req.user = data.user;
      return next();
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }

    req.user = data.user;
    next();
  } catch (err) {
    next(err);
  }
};

export const requireRole = (roleName) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { data, error } = await supabase.from("profiles").select("role").eq("id", req.user.id).single();
      if (error || !data) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      if (data.role !== roleName) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      req.userRole = data.role;
      next();
    } catch (err) {
      next(err);
    }
  };
};
