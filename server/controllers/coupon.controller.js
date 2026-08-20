import { supabase } from "../config/supabase.js";
import {
  successResponse,
  errorResponse
} from "../utils/response.js";
import {
  validateRequiredFields
} from "../utils/validation.js";


// =====================================================
// CALCULATE DISCOUNT
// =====================================================

const calculateDiscount = (
  coupon,
  cartTotal
) => {

  let discount = 0;

  if (
    coupon.discount_type === "percentage"
  ) {

    discount =
      (cartTotal *
        Number(coupon.discount_value)) /
      100;

  } else {

    discount =
      Number(coupon.discount_value);
  }

  // Maximum discount limit
  if (
    coupon.maximum_discount &&
    discount >
      Number(coupon.maximum_discount)
  ) {

    discount =
      Number(coupon.maximum_discount);
  }

  // Discount cannot exceed cart total
  discount =
    Math.min(
      discount,
      cartTotal
    );

  return Number(
    discount.toFixed(2)
  );
};


// =====================================================
// GET ACTIVE COUPONS
// =====================================================

export const getCoupons = async (
  req,
  res,
  next
) => {

  try {

    const now =
      new Date().toISOString();

    const {
      data,
      error
    } = await supabase
      .from("coupons")
      .select("*")
      .eq(
        "is_active",
        true
      )
      .lte(
        "valid_from",
        now
      )
      .gte(
        "valid_until",
        now
      )
      .order(
        "created_at",
        {
          ascending: false
        }
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
      data || []
    );

  } catch (err) {

    next(err);
  }
};


// =====================================================
// VALIDATE COUPON
// =====================================================

export const validateCoupon = async (
  req,
  res,
  next
) => {

  try {

    if (
      !validateRequiredFields(
        [
          "code",
          "cart_total"
        ],
        req.body
      )
    ) {

      return errorResponse(
        res,
        "Invalid request data",
        400
      );
    }

    const code =
      String(
        req.body.code
      )
        .trim()
        .toUpperCase();

    const cartTotal =
      Number(
        req.body.cart_total
      );

    if (
      !Number.isFinite(
        cartTotal
      ) ||
      cartTotal < 0
    ) {

      return errorResponse(
        res,
        "Invalid cart total",
        400
      );
    }

    const now =
      new Date().toISOString();

    // ---------------------------------------------
    // Find coupon
    // ---------------------------------------------

    const {
      data: coupon,
      error
    } = await supabase
      .from("coupons")
      .select("*")
      .eq(
        "code",
        code
      )
      .single();

    if (
      error ||
      !coupon
    ) {

      return errorResponse(
        res,
        "Coupon not found",
        404
      );
    }

    // ---------------------------------------------
    // Active check
    // ---------------------------------------------

    if (
      !coupon.is_active
    ) {

      return errorResponse(
        res,
        "Coupon is not active",
        400
      );
    }

    // ---------------------------------------------
    // Date check
    // ---------------------------------------------

    if (
      now < coupon.valid_from ||
      now > coupon.valid_until
    ) {

      return errorResponse(
        res,
        "Coupon is not valid",
        400
      );
    }

    // ---------------------------------------------
    // Minimum order
    // ---------------------------------------------

    if (
      coupon.minimum_order_amount &&
      cartTotal <
        Number(
          coupon.minimum_order_amount
        )
    ) {

      return errorResponse(
        res,
        `Minimum order amount is ₹${
          coupon.minimum_order_amount
        }`,
        400
      );
    }

    // ---------------------------------------------
    // Usage limit
    // ---------------------------------------------

    if (
      coupon.usage_limit &&
      Number(
        coupon.used_count || 0
      ) >=
        Number(
          coupon.usage_limit
        )
    ) {

      return errorResponse(
        res,
        "Coupon usage limit reached",
        400
      );
    }

    // ---------------------------------------------
    // Calculate discount
    // ---------------------------------------------

    const discount_amount =
      calculateDiscount(
        coupon,
        cartTotal
      );

    const final_total =
      Number(
        (
          cartTotal -
          discount_amount
        ).toFixed(2)
      );

    return successResponse(
      res,
      {
        coupon,
        discount_amount,
        final_total
      }
    );

  } catch (err) {

    next(err);
  }
};