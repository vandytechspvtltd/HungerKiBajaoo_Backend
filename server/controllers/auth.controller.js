import crypto from "crypto";
import twilio from "twilio";
import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";
import {
  validateEmail,
  validatePhone,
  validateRequiredFields
} from "../utils/validation.js";

import {
  createDevSessionForUser,
  revokeDevSession,
  rotateDevRefreshToken,
  getDevUserIdFromRefreshToken,
} from "../middleware/auth.js";


const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const OTP_TTL_MS = 5 * 60 * 1000;
const otpStore = new Map();


const storeOtp = (phone, otp) => {
  otpStore.set(phone, {
    otp,
    expiresAt: Date.now() + OTP_TTL_MS,
  });
};


const validateOtp = (phone, token) => {
  const stored = otpStore.get(phone);

  if (!stored) {
    return false;
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(phone);
    return false;
  }

  return stored.otp === token;
};


const findAuthUserByPhone = async (phone) => {
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } =
      await supabase.auth.admin.listUsers({
        page,
        perPage
      });

    if (error) {
      throw error;
    }

    const users = Array.isArray(data)
      ? data
      : data?.users || data?.users || [];

    const found = users.find(
      (u) =>
        u?.phone === phone ||
        u?.user_metadata?.phone === phone
    );

    if (found) {
      return found;
    }

    const lastPage =
      data?.lastPage ??
      data?.last_page ??
      page;

    if (page >= lastPage) {
      break;
    }

    page += 1;
  }

  return null;
};


const ensureProfileForUser = async (user, phone) => {
  const {
    data: profileData,
    error: profileError
  } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profileData) {
    const { error: insertError } =
      await supabase
        .from("profiles")
        .insert([
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


const buildAuthSessionPayload = ({
  access_token,
  refresh_token,
  user,
  session
}) => {
  const payload = {
    success: true
  };

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
  const password =
    crypto.randomBytes(16).toString("hex");

  const { data, error } =
    await supabase.auth.admin.createUser({
      phone,
      password,
      phone_confirm: true,
      user_metadata: {
        phone
      },
    });

  if (error) {
    throw error;
  }

  return data?.user ?? null;
};


export const register = async (req, res, next) => {
  try {
    const {
      email,
      password,
      name,
      phone
    } = req.body;

    if (
      !validateRequiredFields(
        ["email", "password", "name", "phone"],
        req.body
      ) ||
      !validateEmail(email)
    ) {
      return errorResponse(
        res,
        "Invalid request data",
        400
      );
    }

    const {
      data: signUpData,
      error: signUpError
    } = await supabase.auth.signUp({
      email,
      password
    });

    if (signUpError) {
      return errorResponse(
        res,
        signUpError.message,
        400
      );
    }

    const user = signUpData.user;
    const session = signUpData.session;

    if (!user) {
      return errorResponse(
        res,
        "Registration failed",
        500
      );
    }

    const {
      error: profileError
    } = await supabase
      .from("profiles")
      .insert([
        {
          id: user.id,
          email,
          name,
          phone,
          role: "customer",
        },
      ]);

    if (profileError) {
      return errorResponse(
        res,
        profileError.message,
        500
      );
    }

    return res.status(201).json(
      buildAuthSessionPayload({
        access_token:
          session?.access_token,
        refresh_token:
          session?.refresh_token,
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
    const { phone } = req.body;

    if (
      !validateRequiredFields(
        ["phone"],
        req.body
      ) ||
      !validatePhone(phone)
    ) {
      return errorResponse(
        res,
        "Invalid phone number",
        400
      );
    }

    await twilioClient.messages.create({
      body: "sms_2fa",
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });

    return res.json({
      success: true,
      message: "OTP sent successfully",
    });

  } catch (err) {
    next(err);
  }
};

export const verifyOtp = async (req, res, next) => {
  try {
    const {
      phone,
      token
    } = req.body;

    if (
      !validateRequiredFields(
        ["phone", "token"],
        req.body
      ) ||
      !validatePhone(phone)
    ) {
      return errorResponse(
        res,
        "Invalid request data",
        400
      );
    }

    if (!validateOtp(phone, token)) {
      return errorResponse(
        res,
        "Invalid or expired OTP",
        401
      );
    }

    otpStore.delete(phone);

    let user =
      await findAuthUserByPhone(phone);

    let created = false;

    if (!user) {
      user =
        await createAuthUserByPhone(phone);

      created = true;
    }

    if (!user) {
      return errorResponse(
        res,
        "Unable to locate or create user",
        500
      );
    }

    await ensureProfileForUser(
      user,
      phone
    );

    const devSession =
      createDevSessionForUser(user.id);

    const access_token =
      devSession.accessToken;

    const refresh_token =
      devSession.refreshToken;

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

  } catch (err) {
    next(err);
  }
};


export const login = async (req, res, next) => {
  try {
    const {
      email,
      password
    } = req.body;

    if (
      !validateRequiredFields(
        ["email", "password"],
        req.body
      ) ||
      !validateEmail(email)
    ) {
      return errorResponse(
        res,
        "Invalid request data",
        400
      );
    }

    const {
      data,
      error
    } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return errorResponse(
        res,
        error.message,
        401
      );
    }

    return res.json(
      buildAuthSessionPayload({
        access_token:
          data.session?.access_token,
        refresh_token:
          data.session?.refresh_token,
        user: data.user,
        session: data.session,
      })
    );

  } catch (err) {
    next(err);
  }
};


export const refreshToken = async (
  req,
  res,
  next
) => {
  try {
    const refreshTokenValue =
      req.body?.refresh_token;

    if (
      !refreshTokenValue ||
      !String(refreshTokenValue).trim()
    ) {
      return errorResponse(
        res,
        "Refresh token is required",
        400
      );
    }

    if (
      String(refreshTokenValue)
        .startsWith("dev-refresh-")
    ) {
      const userId =
        getDevUserIdFromRefreshToken(
          refreshTokenValue
        );

      if (!userId) {
        return errorResponse(
          res,
          "Invalid or expired refresh token",
          401
        );
      }

      const rotated =
        rotateDevRefreshToken(
          refreshTokenValue
        );

      if (!rotated) {
        return errorResponse(
          res,
          "Invalid or expired refresh token",
          401
        );
      }

      const {
        data: userData,
        error: userError
      } =
        await supabase.auth.admin.getUserById(
          userId
        );

      if (
        userError ||
        !userData?.user
      ) {
        return errorResponse(
          res,
          "Invalid or expired refresh token",
          401
        );
      }

      return res.json(
        buildAuthSessionPayload({
          access_token:
            rotated.accessToken,
          refresh_token:
            rotated.refreshToken,
          user: userData.user,
          session: {
            token:
              rotated.accessToken,
            provider: "development",
          },
        })
      );
    }

    const {
      data,
      error
    } =
      await supabase.auth.refreshSession({
        refresh_token:
          refreshTokenValue
      });

    if (
      error ||
      !data?.session
    ) {
      return errorResponse(
        res,
        error?.message ||
          "Invalid or expired refresh token",
        401
      );
    }

    return res.json(
      buildAuthSessionPayload({
        access_token:
          data.session.access_token,
        refresh_token:
          data.session.refresh_token,
        user: data.user,
        session: data.session,
      })
    );

  } catch (err) {
    next(err);
  }
};


export const me = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.user;

    const {
      data,
      error
    } =
      await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

    if (error) {
      return errorResponse(
        res,
        error.message,
        404
      );
    }

    return successResponse(
      res,
      data
    );

  } catch (err) {
    next(err);
  }
};


export const logout = async (
  req,
  res,
  next
) => {
  try {
    const authorization =
      req.headers.authorization || "";

    const token =
      authorization.startsWith("Bearer ")
        ? authorization
            .substring(7)
            .trim()
        : null;

    if (!token) {
      return errorResponse(
        res,
        "Authorization token required",
        401
      );
    }

    if (token.startsWith("dev-")) {
      revokeDevSession(token);

      return successResponse(
        res,
        {
          message:
            "Logged out successfully"
        }
      );
    }

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

    return successResponse(
      res,
      {
        message:
          "Logged out successfully"
      }
    );

  } catch (err) {
    next(err);
  }
};


export const deleteAccount = async (
  req,
  res,
  next
) => {
  try {
    const userId =
      req.user?.id;

    if (!userId) {
      return errorResponse(
        res,
        "Unauthorized",
        401
      );
    }

    const {
      data: userData,
      error: userLookupError
    } =
      await supabase.auth.admin.getUserById(
        userId
      );

    if (
      userLookupError ||
      !userData?.user
    ) {
      return errorResponse(
        res,
        "Account not found",
        404
      );
    }

    const cleanupDeletes = [
      supabase
        .from("addresses")
        .delete()
        .eq("user_id", userId),

      supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId),

      supabase
        .from("cart_items")
        .delete()
        .eq("user_id", userId),

      supabase
        .from("profiles")
        .delete()
        .eq("id", userId),
    ];

    for (
      const cleanupDelete
      of cleanupDeletes
    ) {
      const { error } =
        await cleanupDelete;

      if (error) {
        return errorResponse(
          res,
          error.message ||
            "Failed to delete account data",
          500
        );
      }
    }

    const {
      error: deleteUserError
    } =
      await supabase.auth.admin.deleteUser(
        userId
      );

    if (deleteUserError) {
      return errorResponse(
        res,
        deleteUserError.message ||
          "Failed to delete account",
        500
      );
    }

    return successResponse(
      res,
      {
        message:
          "Account deleted successfully"
      }
    );

  } catch (err) {
    next(err);
  }
};