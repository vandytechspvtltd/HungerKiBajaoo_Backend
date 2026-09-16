import crypto from "crypto";
import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { validateEmail, validatePhone, validateRequiredFields } from "../utils/validation.js";
import {
  createDevSessionForUser,
  revokeDevSession,
  rotateDevRefreshToken,
  getDevUserIdFromRefreshToken,
} from "../middleware/auth.js";

const DEV_OTP = "1234";
const DEV_OTP_TTL_MS = 5 * 60 * 1000;
const devOtpStore = new Map();

const storeDevOtp = (phone) => {
  devOtpStore.set(phone, Date.now());
};

const validateDevOtp = (phone, token) => {
  if (token !== DEV_OTP) return false;
  const timestamp = devOtpStore.get(phone);
  if (!timestamp) return false;
  return Date.now() - timestamp <= DEV_OTP_TTL_MS;
};

const findAuthUserByPhone = async (phone) => {
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const users = Array.isArray(data)
      ? data
      : data?.users || data?.users || [];

    const found = users.find((u) => u?.phone === phone || u?.user_metadata?.phone === phone);
    if (found) {
      return found;
    }

    const lastPage = data?.lastPage ?? data?.last_page ?? page;
    if (page >= lastPage) break;
    page += 1;
  }

  return null;
};

const ensureProfileForUser = async (user, phone) => {
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profileData) {
    const { error: insertError } = await supabase.from("profiles").insert([
      {
        id: user.id,
        email: user.email || null,
        name: null,
        phone,
        role: "customer",
      },
    ]);

    if (insertError) {
      throw insertError;
    }
  }
};

const buildAuthSessionPayload = ({ access_token, refresh_token, user, session }) => {
  const payload = { success: true };

  if (access_token) {
    payload.access_token = access_token;
  }

  if (refresh_token) {
    payload.refresh_token = refresh_token;
  }

  if (user) {
    payload.user = user;
  }

  if (session) {
    payload.session = session;
  }

  return payload;
};

const createAuthUserByPhone = async (phone) => {
  const password = crypto.randomBytes(16).toString("hex");
  const { data, error } = await supabase.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
    user_metadata: { phone },
  });

  if (error) {
    throw error;
  }

  return data?.user ?? null;
};

export const register = async (req, res, next) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!validateRequiredFields(["email", "password", "name", "phone"], req.body) || !validateEmail(email)) {
      return errorResponse(res, "Invalid request data", 400);
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      return errorResponse(res, signUpError.message, 400);
    }

    const user = signUpData.user;
    const session = signUpData.session;
    if (!user) {
      return errorResponse(res, "Registration failed", 500);
    }

    const { error: profileError } = await supabase.from("profiles").insert([
      {
        id: user.id,
        email,
        name,
        phone,
        role: "customer",
      },
    ]);

    if (profileError) {
      return errorResponse(res, profileError.message, 500);
    }

    return res.status(201).json(
      buildAuthSessionPayload({
        access_token: session?.access_token,
        refresh_token: session?.refresh_token,
        user,
        session,
      })
    );
  } catch (err) {
    next(err);
  }
};

export const sendOtp = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return errorResponse(res, "Phone OTP is only available in development mode", 404);
    }

    const { phone } = req.body;
    if (!validateRequiredFields(["phone"], req.body) || !validatePhone(phone)) {
      return errorResponse(res, "Invalid phone number", 400);
    }

    storeDevOtp(phone);
    return res.json({ success: true, message: "Test OTP sent successfully" });
  } catch (err) {
    next(err);
  }
};

export const verifyOtp = async (req, res, next) => {
  try {
    console.log("[AUTH] VERIFY OTP START");

    if (process.env.NODE_ENV === "production") {
      return errorResponse(
        res,
        "Phone OTP is only available in development mode",
        404
      );
    }

    const { phone, token } = req.body || {};

    // STEP 1: Validate request
    if (
      !validateRequiredFields(
        ["phone", "token"],
        req.body
      ) ||
      !validatePhone(phone)
    ) {
      console.error(
        "[AUTH] STEP 1 FAILED: Invalid request data"
      );

      return errorResponse(
        res,
        "Invalid request data",
        400
      );
    }

    console.log("[AUTH] STEP 1 SUCCESS");

    // STEP 2: Validate OTP
    if (!validateDevOtp(phone, token)) {
      console.error(
        "[AUTH] STEP 2 FAILED: Invalid or expired OTP"
      );

      return errorResponse(
        res,
        "Invalid or expired OTP",
        401
      );
    }

    console.log("[AUTH] STEP 2 SUCCESS: OTP valid");

    // STEP 3: Find existing user
    let user = null;

    try {
      console.log(
        "[AUTH] STEP 3: Finding Supabase user"
      );

      user = await findAuthUserByPhone(phone);

      console.log(
        "[AUTH] STEP 3 SUCCESS:",
        user?.id || "User not found"
      );
    } catch (error) {
      console.error(
        "[AUTH] STEP 3 FAILED: Supabase listUsers"
      );

      console.error(
        "Message:",
        error?.message
      );

      console.error(
        "Code:",
        error?.code
      );

      console.error(
        "Details:",
        error?.details
      );

      console.error(
        "Hint:",
        error?.hint
      );

      console.error(
        "Stack:",
        error?.stack
      );

      return errorResponse(
        res,
        `Authentication service error: ${
          error?.message || "Unable to fetch users"
        }`,
        500
      );
    }

    // STEP 4: Create user if not found
    let created = false;

    if (!user) {
      try {
        console.log(
          "[AUTH] STEP 4: Creating Supabase user"
        );

        user = await createAuthUserByPhone(phone);
        created = true;

        console.log(
          "[AUTH] STEP 4 SUCCESS:",
          user?.id
        );
      } catch (error) {
        console.error(
          "[AUTH] STEP 4 FAILED: Supabase createUser"
        );

        console.error(
          "Message:",
          error?.message
        );

        console.error(
          "Code:",
          error?.code
        );

        console.error(
          "Details:",
          error?.details
        );

        console.error(
          "Hint:",
          error?.hint
        );

        console.error(
          "Stack:",
          error?.stack
        );

        return errorResponse(
          res,
          `Unable to create user: ${
            error?.message || "Unknown error"
          }`,
          500
        );
      }
    }

    if (!user?.id) {
      return errorResponse(
        res,
        "Unable to locate or create user",
        500
      );
    }

    // STEP 5: Ensure profile
    try {
      console.log(
        "[AUTH] STEP 5: Ensuring profile"
      );

      await ensureProfileForUser(
        user,
        phone
      );

      console.log(
        "[AUTH] STEP 5 SUCCESS: Profile ready"
      );
    } catch (error) {
      console.error(
        "[AUTH] STEP 5 FAILED: Profile operation"
      );

      console.error(
        "Message:",
        error?.message
      );

      console.error(
        "Code:",
        error?.code
      );

      console.error(
        "Details:",
        error?.details
      );

      console.error(
        "Hint:",
        error?.hint
      );

      console.error(
        "Stack:",
        error?.stack
      );

      return errorResponse(
        res,
        `Profile operation failed: ${
          error?.message || "Unknown error"
        }`,
        500
      );
    }

    // STEP 6: Consume OTP
    devOtpStore.delete(phone);

    // STEP 7: Create development session
    try {
      console.log(
        "[AUTH] STEP 7: Creating development session"
      );

      const devSession =
        createDevSessionForUser(user.id);

      if (
        !devSession?.accessToken ||
        !devSession?.refreshToken
      ) {
        throw new Error(
          "Invalid development session generated"
        );
      }

      const access_token =
        devSession.accessToken;

      const refresh_token =
        devSession.refreshToken;

      // STEP 8: Success response
      console.log(
        "[AUTH] VERIFY OTP SUCCESS"
      );

      return res.json(
        buildAuthSessionPayload({
          access_token,
          refresh_token,
          user,
          session: {
            token: access_token,
            provider: "development",
            created,
          },
        })
      );
    } catch (error) {
      console.error(
        "[AUTH] STEP 7 FAILED: Session creation"
      );

      console.error(
        "Message:",
        error?.message
      );

      console.error(
        "Stack:",
        error?.stack
      );

      return errorResponse(
        res,
        `Unable to create authentication session: ${
          error?.message || "Unknown error"
        }`,
        500
      );
    }
  } catch (err) {
    console.error(
      "[AUTH] VERIFY OTP UNHANDLED ERROR"
    );

    console.error(
      "Message:",
      err?.message
    );

    console.error(
      "Code:",
      err?.code
    );

    console.error(
      "Details:",
      err?.details
    );

    console.error(
      "Hint:",
      err?.hint
    );

    console.error(
      "Stack:",
      err?.stack
    );

    next(err);
  }
};


export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!validateRequiredFields(["email", "password"], req.body) || !validateEmail(email)) {
      return errorResponse(res, "Invalid request data", 400);
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return errorResponse(res, error.message, 401);
    }

    return res.json(
      buildAuthSessionPayload({
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        user: data.user,
        session: data.session,
      })
    );
  } catch (err) {
    next(err);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const refreshTokenValue = req.body?.refresh_token;
    if (!refreshTokenValue || !String(refreshTokenValue).trim()) {
      return errorResponse(res, "Refresh token is required", 400);
    }

    if (String(refreshTokenValue).startsWith("dev-refresh-")) {
      const userId = getDevUserIdFromRefreshToken(refreshTokenValue);
      if (!userId) {
        return errorResponse(res, "Invalid or expired refresh token", 401);
      }

      const rotated = rotateDevRefreshToken(refreshTokenValue);
      if (!rotated) {
        return errorResponse(res, "Invalid or expired refresh token", 401);
      }

      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
      if (userError || !userData?.user) {
        return errorResponse(res, "Invalid or expired refresh token", 401);
      }

      return res.json(
        buildAuthSessionPayload({
          access_token: rotated.accessToken,
          refresh_token: rotated.refreshToken,
          user: userData.user,
          session: {
            token: rotated.accessToken,
            provider: "development",
          },
        })
      );
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshTokenValue });
    if (error || !data?.session) {
      return errorResponse(res, error?.message || "Invalid or expired refresh token", 401);
    }

    return res.json(
      buildAuthSessionPayload({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: data.user,
        session: data.session,
      })
    );
  } catch (err) {
    next(err);
  }
};

export const me = async (req, res, next) => {
  try {
    const { id } = req.user;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
    if (error) {
      return errorResponse(res, error.message, 404);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const logout = async (req, res, next) => {
  try {

    const authorization =
      req.headers.authorization || "";

    const token =
      authorization.startsWith("Bearer ")
        ? authorization.substring(7).trim()
        : null;

    if (!token) {
      return errorResponse(
        res,
        "Authorization token required",
        401
      );
    }


    // ================================
    // DEVELOPMENT SESSION
    // ================================

    if (token.startsWith("dev-")) {
      revokeDevSession(token);

      return successResponse(res, {
        message: "Logged out successfully"
      });
    }


    // ================================
    // REAL SUPABASE SESSION
    // ================================

    const { error } =
      await supabase.auth.admin.signOut(
        token,
        "global"
      );

    if (error) {
      return errorResponse(
        res,
        error.message,
        400
      );
    }

    return successResponse(res, {
      message: "Logged out successfully"
    });

  } catch (err) {
    next(err);
  }
};

export const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return errorResponse(res, "Unauthorized", 401);
    }

    const { data: userData, error: userLookupError } = await supabase.auth.admin.getUserById(userId);
    if (userLookupError || !userData?.user) {
      return errorResponse(res, "Account not found", 404);
    }

    const cleanupDeletes = [
      supabase.from("addresses").delete().eq("user_id", userId),
      supabase.from("favorites").delete().eq("user_id", userId),
      supabase.from("cart_items").delete().eq("user_id", userId),
      supabase.from("profiles").delete().eq("id", userId),
    ];

    for (const cleanupDelete of cleanupDeletes) {
      const { error } = await cleanupDelete;
      if (error) {
        return errorResponse(res, error.message || "Failed to delete account data", 500);
      }
    }

    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      return errorResponse(res, deleteUserError.message || "Failed to delete account", 500);
    }

    return successResponse(res, {
      message: "Account deleted successfully",
    });
  } catch (err) {
    next(err);
  }
};