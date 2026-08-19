import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { validateRequiredFields } from "../utils/validation.js";

const calculateDiscount = (coupon, cartTotal) => {
  let discount = 0;
  if (coupon.discount_type === "percentage") {
    discount = (cartTotal * coupon.discount_value) / 100;
  } else {
    discount = coupon.discount_value;
  }
  if (coupon.maximum_discount && discount > coupon.maximum_discount) {
    discount = coupon.maximum_discount;
  }
  return discount;
};

export const getCoupons = async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("coupons").select("*").eq("is_active", true).lte("valid_from", now).gte("valid_until", now).order("created_at", { ascending: false });
    if (error) {
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const validateCoupon = async (req, res, next) => {
  try {
    const { code, cart_total } = req.body;
    if (!validateRequiredFields(["code", "cart_total"], req.body)) {
      return errorResponse(res, "Invalid request data", 400);
    }
    const userId = req.user.id;
    const now = new Date().toISOString();

    const { data: coupon, error } = await supabase.from("coupons").select("*").eq("code", code).single();
    if (error || !coupon) {
      return errorResponse(res, "Coupon not found", 404);
    }
    if (!coupon.is_active || now < coupon.valid_from || now > coupon.valid_until) {
      return errorResponse(res, "Coupon is not valid", 400);
    }
    if (coupon.minimum_order_amount && cart_total < coupon.minimum_order_amount) {
      return errorResponse(res, "Cart total does not meet coupon minimum", 400);
    }
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      return errorResponse(res, "Coupon usage limit reached", 400);
    }

    const discount_amount = calculateDiscount(coupon, cart_total);
    return successResponse(res, { coupon, discount_amount });
  } catch (err) {
    next(err);
  }
};
