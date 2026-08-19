import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";

export const getCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    console.log("getCart: userId=", userId);
    const { data, error } = await supabase.from("cart_items").select("*, foods(*, restaurants(*))").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) {
      console.error("getCart supabase error:", error);
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const addCartItem = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { food_id, quantity } = req.body;
    if (!food_id || !quantity || quantity < 1) {
      return errorResponse(res, "Invalid request data", 400);
    }
    console.log("addCartItem: userId=", userId, "food_id=", food_id, "quantity=", quantity);

    const { data: food, error: foodError } = await supabase.from("foods").select("*").eq("id", food_id).single();
    if (foodError || !food) {
      return errorResponse(res, "Food item not found", 404);
    }
    if (!food.is_available) {
      return errorResponse(res, "Food is unavailable", 400);
    }

    const { data: existing, error: existingError } = await supabase.from("cart_items").select("*").eq("user_id", userId).eq("food_id", food_id).single();
    if (existingError && existingError.code !== "PGRST116") {
      console.error("addCartItem existing check error:", existingError);
      return errorResponse(res, existingError.message, 400);
    }

    if (existing) {
      const { data, error } = await supabase
        .from("cart_items")
        .update({ quantity: existing.quantity + quantity })
        .eq("id", existing.id)
        .select("*, foods(*, restaurants(*))")
        .single();
      console.log("addCartItem: updated existing cart item id=", existing.id);
      if (error) {
        console.error("addCartItem update error:", error);
        return errorResponse(res, error.message, 400);
      }
      return successResponse(res, data);
    }

    const { data, error } = await supabase
      .from("cart_items")
      .insert([{ user_id: userId, food_id, quantity }])
      .select("*, foods(*, restaurants(*))")
      .single();
    if (error) {
      console.error("addCartItem insert error:", error);
      return errorResponse(res, error.message, 400);
    }
    console.log("addCartItem: inserted cart item id=", data?.id);
    return successResponse(res, data, 201);
  } catch (err) {
    next(err);
  }
};

export const updateCartItem = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    const { quantity } = req.body;
    if (quantity === undefined || quantity < 1) {
      return errorResponse(res, "Invalid quantity", 400);
    }

    const { data: item, error: itemError } = await supabase.from("cart_items").select("*").eq("id", id).single();
    if (itemError || !item || item.user_id !== userId) {
      return errorResponse(res, "Cart item not found", 404);
    }

    console.log("updateCartItem: userId=", userId, "id=", id, "quantity=", quantity);
    const { data, error } = await supabase
      .from("cart_items")
      .update({ quantity })
      .eq("id", id)
      .select("*, foods(*, restaurants(*))")
      .single();
    if (error) {
      console.error("updateCartItem supabase error:", error);
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const deleteCartItem = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    const { data: item, error: itemError } = await supabase.from("cart_items").select("*").eq("id", id).single();
    if (itemError || !item || item.user_id !== userId) {
      return errorResponse(res, "Cart item not found", 404);
    }

    const { error } = await supabase.from("cart_items").delete().eq("id", id);
    if (error) {
      console.error("deleteCartItem supabase error:", error);
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, { message: "Cart item deleted" });
  } catch (err) {
    next(err);
  }
};

export const clearCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    console.log("clearCart: userId=", userId);
    const { error } = await supabase.from("cart_items").delete().eq("user_id", userId);
    if (error) {
      console.error("clearCart supabase error:", error);
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, { message: "Cart cleared" });
  } catch (err) {
    next(err);
  }
};
