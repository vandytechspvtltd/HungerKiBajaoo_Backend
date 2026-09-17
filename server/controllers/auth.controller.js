import crypto from "crypto";
import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";
import {
  validateEmail,
  validatePhone,
  validateRequiredFields,
} from "../utils/validation.js";

import {
  createDevSessionForUser,
  revokeDevSession,
  rotateDevRefreshToken,
  getDevUserIdFromRefreshToken,
} from "../middleware/auth.js";

/* ============================================================
   MSG91 CONFIG
   ============================================================ */

const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;

const MSG91_OTP_TEMPLATE_ID =
  process.env.MSG91_OTP_TEMPLATE_ID;


/* ============================================================
   PHONE HELPERS
   ============================================================ */

/**
 * Convert Indian number to MSG91 format.
 *
 * 9876543210
 * 919876543210
 * +919876543210
 *
 * => 919876543210
 */
const normalizePhoneForMsg91 = (phone) => {
  const value = String(phone || "").trim();

  // +919876543210
  if (value.startsWith("+91")) {
    const number = value.substring(3);

    if (/^\d{10}$/.test(number)) {
      return `91${number}`;
    }

    return null;
  }

  // 919876543210
  if (
    value.startsWith("91") &&
    value.length === 12 &&
    /^91\d{10}$/.test(value)
  ) {
    return value;
  }

  // 9876543210
  if (/^\d{10}$/.test(value)) {
    return `91${value}`;
  }

  return null;
};


/**
 * Convert phone to Supabase format.
 *
 * 9876543210
 *      ↓
 * +919876543210
 */
const normalizePhoneForSupabase = (phone) => {
  const msg91Phone =
    normalizePhoneForMsg91(phone);

  if (!msg91Phone) {
    return null;
  }

  return `+${msg91Phone}`;
};


/* ============================================================
   MSG91 SEND OTP
   ============================================================ */

const sendMsg91Otp = async (phone) => {
  if (!MSG91_AUTH_KEY) {
    throw new Error(
      "MSG91_AUTH_KEY is not configured"
    );
  }

  if (!MSG91_OTP_TEMPLATE_ID) {
    throw new Error(
      "MSG91_OTP_TEMPLATE_ID is not configured"
    );
  }

  const mobile =
    normalizePhoneForMsg91(phone);

  if (!mobile) {
    throw new Error(
      "Invalid Indian phone number"
    );
  }

  const url = new URL(
    "https://control.msg91.com/api/v5/otp"
  );

  url.searchParams.set(
    "template_id",
    MSG91_OTP_TEMPLATE_ID
  );

  url.searchParams.set(
    "mobile",
    mobile
  );

  url.searchParams.set(
    "authkey",
    MSG91_AUTH_KEY
  );

  const response = await fetch(
    url.toString(),
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({}),
    }
  );

  const data = await response.json();

  console.log(
    "MSG91 Send OTP Response:",
    data
  );

  if (
    !response.ok ||
    data?.type !== "success"
  ) {
    throw new Error(
      data?.message ||
        "MSG91 failed to send OTP"
    );
  }

  return data;
};


/* ============================================================
   MSG91 VERIFY OTP
   ============================================================ */

const verifyMsg91Otp = async (
  phone,
  otp
) => {
  if (!MSG91_AUTH_KEY) {
    throw new Error(
      "MSG91_AUTH_KEY is not configured"
    );
  }

  const mobile =
    normalizePhoneForMsg91(phone);

  if (!mobile) {
    throw new Error(
      "Invalid Indian phone number"
    );
  }

  const otpValue =
    String(otp || "").trim();

  if (!otpValue) {
    return false;
  }

  const url = new URL(
    "https://control.msg91.com/api/v5/otp/verify"
  );

  url.searchParams.set(
    "otp",
    otpValue
  );

  url.searchParams.set(
    "mobile",
    mobile
  );

  const response = await fetch(
    url.toString(),
    {
      method: "GET",

      headers: {
        authkey: MSG91_AUTH_KEY,
      },
    }
  );

  const data = await response.json();

  console.log(
    "MSG91 Verify OTP Response:",
    data
  );

  if (
    response.ok &&
    (
      data?.message ===
        "OTP verified success" ||
      data?.type === "success"
    )
  ) {
    return true;
  }

  return false;
};


/* ============================================================
   FIND AUTH USER BY PHONE
   ============================================================ */

const findAuthUserByPhone = async (
  phone
) => {
  let page = 1;

  const perPage = 100;

  while (true) {
    const {
      data,
      error,
    } =
      await supabase.auth.admin.listUsers(
        {
          page,
          perPage,
        }
      );

    if (error) {
      throw error;
    }

    const users =
      Array.isArray(data)
        ? data
        : data?.users || [];

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


/* ============================================================
   ENSURE PROFILE
   ============================================================ */

const ensureProfileForUser = async (
  user,
  phone
) => {
  const {
    data: profileData,
    error: profileError,
  } =
    await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profileData) {
    const {
      error: insertError,
    } =
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


/* ============================================================
   BUILD AUTH SESSION PAYLOAD
   ============================================================ */

const buildAuthSessionPayload = ({
  access_token,
  refresh_token,
  user,
  session,
}) => {
  const payload = {
    success: true,
  };

  if (access_token) {
    payload.access_token =
      access_token;
  }

  if (refresh_token) {
    payload.refresh_token =
      refresh_token;
  }

  if (user) {
    payload.user = user;
  }

  if (session) {
    payload.session = session;
  }

  return payload;
};


/* ============================================================
   CREATE AUTH USER BY PHONE
   ============================================================ */

const createAuthUserByPhone = async (
  phone
) => {
  const password =
    crypto
      .randomBytes(16)
      .toString("hex");

  const {
    data,
    error,
  } =
    await supabase.auth.admin.createUser(
      {
        phone,
        password,
        phone_confirm: true,

        user_metadata: {
          phone,
        },
      }
    );

  if (error) {
    throw error;
  }

  return data?.user ?? null;
};


/* ============================================================
   REGISTER
   ============================================================ */

export const register = async (
  req,
  res,
  next
) => {
  try {
    const {
      email,
      password,
      name,
      phone,
    } = req.body;

    if (
      !validateRequiredFields(
        [
          "email",
          "password",
          "name",
          "phone",
        ],
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
      error: signUpError,
    } =
      await supabase.auth.signUp({
        email,
        password,
      });

    if (signUpError) {
      return errorResponse(
        res,
        signUpError.message,
        400
      );
    }

    const user =
      signUpData.user;

    const session =
      signUpData.session;

    if (!user) {
      return errorResponse(
        res,
        "Registration failed",
        500
      );
    }

    const {
      error: profileError,
    } =
      await supabase
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

    return res
      .status(201)
      .json(
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


/* ============================================================
   SEND OTP - MSG91 + DLT
   ============================================================ */

export const sendOtp = async (
  req,
  res,
  next
) => {
  try {
    const { phone } =
      req.body;

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

    const normalizedPhone =
      normalizePhoneForSupabase(
        phone
      );

    if (!normalizedPhone) {
      return errorResponse(
        res,
        "Invalid phone number",
        400
      );
    }

    /**
     * MSG91 generates OTP
     * and sends it using the
     * approved DLT mapped template.
     */
    await sendMsg91Otp(
      normalizedPhone
    );

    return res.json({
      success: true,
      message:
        "OTP sent successfully",
    });
  } catch (err) {
    console.error(
      "Send OTP error:",
      err
    );

    return errorResponse(
      res,
      err.message ||
        "Failed to send OTP",
      500
    );
  }
};


/* ============================================================
   VERIFY OTP - MSG91
   ============================================================ */

export const verifyOtp = async (
  req,
  res,
  next
) => {
  try {
    const {
      phone,
      token,
    } = req.body;

    if (
      !validateRequiredFields(
        [
          "phone",
          "token",
        ],
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

    const normalizedPhone =
      normalizePhoneForSupabase(
        phone
      );

    if (!normalizedPhone) {
      return errorResponse(
        res,
        "Invalid phone number",
        400
      );
    }

    /**
     * Verify OTP using MSG91.
     */
    const isValidOtp =
      await verifyMsg91Otp(
        normalizedPhone,
        token
      );

    if (!isValidOtp) {
      return errorResponse(
        res,
        "Invalid or expired OTP",
        401
      );
    }

    /* ========================================================
       EXISTING USER / PROFILE LOGIC
       ======================================================== */

    let user =
      await findAuthUserByPhone(
        normalizedPhone
      );

    let created = false;

    if (!user) {
      user =
        await createAuthUserByPhone(
          normalizedPhone
        );

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
      normalizedPhone
    );

    /* ========================================================
       EXISTING SESSION LOGIC
       ======================================================== */

    const devSession =
      createDevSessionForUser(
        user.id
      );

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
          provider:
            "development",
          created,
        },
      })
    );
  } catch (err) {
    console.error(
      "Verify OTP error:",
      err
    );

    next(err);
  }
};


/* ============================================================
   LOGIN
   ============================================================ */

export const login = async (
  req,
  res,
  next
) => {
  try {
    const {
      email,
      password,
    } = req.body;

    if (
      !validateRequiredFields(
        [
          "email",
          "password",
        ],
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
      error,
    } =
      await supabase.auth.signInWithPassword(
        {
          email,
          password,
        }
      );

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
          data.session
            ?.access_token,

        refresh_token:
          data.session
            ?.refresh_token,

        user:
          data.user,

        session:
          data.session,
      })
    );
  } catch (err) {
    next(err);
  }
};


/* ============================================================
   REFRESH TOKEN
   ============================================================ */

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
      !String(
        refreshTokenValue
      ).trim()
    ) {
      return errorResponse(
        res,
        "Refresh token is required",
        400
      );
    }

    if (
      String(
        refreshTokenValue
      ).startsWith(
        "dev-refresh-"
      )
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
        error: userError,
      } =
        await supabase
          .auth.admin
          .getUserById(
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

          user:
            userData.user,

          session: {
            token:
              rotated.accessToken,

            provider:
              "development",
          },
        })
      );
    }

    const {
      data,
      error,
    } =
      await supabase.auth.refreshSession(
        {
          refresh_token:
            refreshTokenValue,
        }
      );

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

        user:
          data.user,

        session:
          data.session,
      })
    );
  } catch (err) {
    next(err);
  }
};


/* ============================================================
   ME
   ============================================================ */

export const me = async (
  req,
  res,
  next
) => {
  try {
    const { id } =
      req.user;

    const {
      data,
      error,
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


/* ============================================================
   LOGOUT
   ============================================================ */

export const logout = async (
  req,
  res,
  next
) => {
  try {
    const authorization =
      req.headers.authorization ||
      "";

    const token =
      authorization.startsWith(
        "Bearer "
      )
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

    /* ========================================================
       DEVELOPMENT SESSION
       ======================================================== */

    if (
      token.startsWith("dev-")
    ) {
      revokeDevSession(
        token
      );

      return successResponse(
        res,
        {
          message:
            "Logged out successfully",
        }
      );
    }

    /* ========================================================
       REAL SUPABASE SESSION
       ======================================================== */

    const {
      error,
    } =
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
          "Logged out successfully",
      }
    );
  } catch (err) {
    next(err);
  }
};


/* ============================================================
   DELETE ACCOUNT
   ============================================================ */

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
      error:
        userLookupError,
    } =
      await supabase
        .auth.admin
        .getUserById(
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
        .eq(
          "user_id",
          userId
        ),

      supabase
        .from("favorites")
        .delete()
        .eq(
          "user_id",
          userId
        ),

      supabase
        .from("cart_items")
        .delete()
        .eq(
          "user_id",
          userId
        ),

      supabase
        .from("profiles")
        .delete()
        .eq(
          "id",
          userId
        ),
    ];

    for (
      const cleanupDelete
      of cleanupDeletes
    ) {
      const {
        error,
      } = await cleanupDelete;

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
      error:
        deleteUserError,
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
          "Account deleted successfully",
      }
    );
  } catch (err) {
    next(err);
  }
};