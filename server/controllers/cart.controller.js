import { supabase } from "../config/supabase.js";
import {
  successResponse,
  errorResponse
} from "../utils/response.js";


// =====================================================
// GET CART
// =====================================================

export const getCart = async (req, res, next) => {
  try {

    const userId = req.user.id;

    console.log(
      "getCart: userId=",
      userId
    );

    const { data, error } =
      await supabase
        .from("cart_items")
        .select(`
          *,
          foods (
            id,
            name,
            price,
            original_price,
            restaurant_id,
            image_url,
            is_veg,
            is_customizable,
            is_active
          )
        `)
        .eq("user_id", userId)
        .order("created_at", {
          ascending: false
        });

    if (error) {

      console.error(
        "getCart supabase error:",
        error
      );

      return errorResponse(
        res,
        error.message,
        400
      );
    }

    console.log(
      "getCart response:",
      JSON.stringify(data, null, 2)
    );

    return successResponse(
      res,
      data || []
    );

  } catch (err) {

    next(err);
  }
};

// =====================================================
// ADD CART ITEM
// =====================================================

export const addCartItem = async (
  req,
  res,
  next
) => {

  try {

    const userId = req.user.id;

    const {
      food_id,
      quantity
    } = req.body;

    if (
      !food_id ||
      !quantity ||
      quantity < 1
    ) {

      return errorResponse(
        res,
        "Invalid request data",
        400
      );
    }

    console.log(
      "addCartItem:",
      userId,
      food_id,
      quantity
    );


    // =================================================
    // CHECK FOOD
    // =================================================

    const {
      data: food,
      error: foodError
    } =
      await supabase
        .from("foods")
        .select("*")
        .eq("id", food_id)
        .single();

    if (
      foodError ||
      !food
    ) {

      return errorResponse(
        res,
        "Food item not found",
        404
      );
    }


    // Food active check

    if (food.is_active === false) {

      return errorResponse(
        res,
        "Food is unavailable",
        400
      );
    }


    // =================================================
    // CHECK EXISTING CART ITEM
    // =================================================

    const {
      data: existing,
      error: existingError
    } =
      await supabase
        .from("cart_items")
        .select("*")
        .eq("user_id", userId)
        .eq("food_id", food_id)
        .maybeSingle();

    if (existingError) {

      console.error(
        "Existing cart check error:",
        existingError
      );

      return errorResponse(
        res,
        existingError.message,
        400
      );
    }


    // =================================================
    // EXISTING ITEM → INCREASE QUANTITY
    // =================================================

    if (existing) {

      const newQuantity =
        (existing.quantity || 0) +
        quantity;

      const {
        data,
        error
      } =
        await supabase
          .from("cart_items")
          .update({
            quantity: newQuantity
          })
          .eq("id", existing.id)
          .eq("user_id", userId)
          .select("*")
          .single();

      if (error) {

        console.error(
          "Cart update error:",
          error
        );

        return errorResponse(
          res,
          error.message,
          400
        );
      }

      return successResponse(
        res,
        data
      );
    }


    // =================================================
    // NEW CART ITEM
    // =================================================

    const {
      data,
      error
    } =
      await supabase
        .from("cart_items")
        .insert({
          user_id: userId,
          food_id: food_id,
          quantity: quantity
        })
        .select("*")
        .single();

    if (error) {

      console.error(
        "Cart insert error:",
        error
      );

      return errorResponse(
        res,
        error.message,
        400
      );
    }

    console.log(
      "Cart item inserted:",
      data
    );

    return successResponse(
      res,
      data,
      201
    );

  } catch (err) {

    next(err);
  }
};


// =====================================================
// UPDATE CART ITEM
// =====================================================

export const updateCartItem = async (
  req,
  res,
  next
) => {

  try {

    const userId = req.user.id;

    const id =
      Number(req.params.id);

    const {
      quantity
    } = req.body;

    if (
      quantity === undefined ||
      quantity < 1
    ) {

      return errorResponse(
        res,
        "Invalid quantity",
        400
      );
    }


    // =================================================
    // CHECK ITEM
    // =================================================

    const {
      data: item,
      error: itemError
    } =
      await supabase
        .from("cart_items")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

    if (
      itemError ||
      !item
    ) {

      return errorResponse(
        res,
        "Cart item not found",
        404
      );
    }


    // =================================================
    // UPDATE
    // =================================================

    const {
      data,
      error
    } =
      await supabase
        .from("cart_items")
        .update({
          quantity
        })
        .eq("id", id)
        .eq("user_id", userId)
        .select("*")
        .single();

    if (error) {

      console.error(
        "updateCartItem error:",
        error
      );

      return errorResponse(
        res,
        error.message,
        400
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


// =====================================================
// DELETE CART ITEM
// =====================================================

export const deleteCartItem = async (
  req,
  res,
  next
) => {

  try {

    const userId = req.user.id;

    const id =
      Number(req.params.id);


    // =================================================
    // CHECK ITEM
    // =================================================

    const {
      data: item,
      error: itemError
    } =
      await supabase
        .from("cart_items")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

    if (
      itemError ||
      !item
    ) {

      return errorResponse(
        res,
        "Cart item not found",
        404
      );
    }


    // =================================================
    // DELETE
    // =================================================

    const {
      error
    } =
      await supabase
        .from("cart_items")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

    if (error) {

      console.error(
        "deleteCartItem error:",
        error
      );

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
          "Cart item deleted"
      }
    );

  } catch (err) {

    next(err);
  }
};


// =====================================================
// CLEAR CART
// =====================================================

export const clearCart = async (
  req,
  res,
  next
) => {

  try {

    const userId = req.user.id;

    console.log(
      "clearCart: userId=",
      userId
    );

    const {
      error
    } =
      await supabase
        .from("cart_items")
        .delete()
        .eq("user_id", userId);

    if (error) {

      console.error(
        "clearCart error:",
        error
      );

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
          "Cart cleared"
      }
    );

  } catch (err) {

    next(err);
  }
};