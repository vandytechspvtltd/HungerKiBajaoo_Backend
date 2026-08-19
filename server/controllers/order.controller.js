import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { validateRequiredFields } from "../utils/validation.js";

const calculateDiscount = (coupon, subtotal) => {
  let discount = 0;

  if (coupon.discount_type === "percentage") {
    discount = (subtotal * coupon.discount_value) / 100;
  } else {
    discount = coupon.discount_value;
  }

  if (
    coupon.maximum_discount !== null &&
    coupon.maximum_discount !== undefined &&
    discount > coupon.maximum_discount
  ) {
    discount = coupon.maximum_discount;
  }

  return discount;
};

export const createOrder = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const {
      restaurant_id,
      address_id,
      payment_method,
      coupon_code,
    } = req.body;

    // Validate required fields
    if (
      !validateRequiredFields(
        ["restaurant_id", "address_id", "payment_method"],
        req.body
      )
    ) {
      return errorResponse(res, "Invalid request data", 400);
    }

    const restaurantId = Number(restaurant_id);
    const addressId = Number(address_id);

    if (isNaN(restaurantId) || isNaN(addressId)) {
      return errorResponse(
        res,
        "restaurant_id and address_id must be valid numbers",
        400
      );
    }

    // --------------------------------------------------
    // 1. Get cart items
    // --------------------------------------------------

    const {
      data: cartItems,
      error: cartError,
    } = await supabase
      .from("cart_items")
      .select("*, foods(*)")
      .eq("user_id", userId);

    if (cartError) {
      console.error("CART ERROR:", cartError);

      return errorResponse(res, cartError.message, 400);
    }

    if (!cartItems || cartItems.length === 0) {
      return errorResponse(res, "Cart is empty", 400);
    }

    // --------------------------------------------------
    // 2. Validate cart items
    // --------------------------------------------------

    const invalidItem = cartItems.find(
      (item) =>
        !item.foods ||
        !item.foods.is_available ||
        Number(item.foods.restaurant_id) !== restaurantId
    );

    if (invalidItem) {
      return errorResponse(
        res,
        "Cart contains invalid or unavailable items",
        400
      );
    }

    // --------------------------------------------------
    // 3. Validate address
    // --------------------------------------------------

    const {
      data: address,
      error: addressError,
    } = await supabase
      .from("addresses")
      .select("*")
      .eq("id", addressId)
      .single();

    if (addressError || !address || address.user_id !== userId) {
      console.error("ADDRESS ERROR:", addressError);

      return errorResponse(res, "Address not found", 404);
    }

    // --------------------------------------------------
    // 4. Validate restaurant
    // --------------------------------------------------

    const {
      data: restaurant,
      error: restaurantError,
    } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", restaurantId)
      .single();

    if (restaurantError || !restaurant) {
      console.error("RESTAURANT ERROR:", restaurantError);

      return errorResponse(res, "Restaurant not found", 404);
    }

    // --------------------------------------------------
    // 5. Calculate subtotal
    // --------------------------------------------------

    let subtotal = 0;

    const orderItems = cartItems.map((item) => {
      const price = Number(item.foods.price);
      const quantity = Number(item.quantity);

      subtotal += price * quantity;

      return {
        food_id: item.food_id,
        quantity,
        price,
      };
    });

    // --------------------------------------------------
    // 6. Apply coupon
    // --------------------------------------------------

    let discount_amount = 0;
    let coupon_id = null;

    if (coupon_code) {
      const now = new Date().toISOString();

      const {
        data: coupon,
        error: couponError,
      } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", coupon_code)
        .single();

      if (couponError || !coupon) {
        console.error("COUPON ERROR:", couponError);

        return errorResponse(res, "Coupon not found", 404);
      }

      if (
        !coupon.is_active ||
        now < coupon.valid_from ||
        now > coupon.valid_until
      ) {
        return errorResponse(res, "Coupon is not valid", 400);
      }

      if (
        coupon.minimum_order_amount &&
        subtotal < Number(coupon.minimum_order_amount)
      ) {
        return errorResponse(
          res,
          "Cart total does not meet coupon minimum",
          400
        );
      }

      if (
        coupon.usage_limit &&
        Number(coupon.used_count) >= Number(coupon.usage_limit)
      ) {
        return errorResponse(res, "Coupon usage limit reached", 400);
      }

      coupon_id = coupon.id;

      discount_amount = calculateDiscount(coupon, subtotal);

      // Discount should never be greater than subtotal
      if (discount_amount > subtotal) {
        discount_amount = subtotal;
      }
    }

    // --------------------------------------------------
    // 7. Calculate final total
    // --------------------------------------------------

    const total_amount = subtotal - discount_amount;

    // --------------------------------------------------
    // 8. Create order
    // --------------------------------------------------

    const {
      data: order,
      error: orderError,
    } = await supabase
      .from("orders")
      .insert([
        {
          user_id: userId,
          restaurant_id: restaurantId,
          address_id: addressId,
          total_amount,
          payment_method,
          payment_status: "pending",
        },
      ])
      .select()
      .single();

    if (orderError || !order) {
      console.error("ORDER INSERT ERROR:", orderError);

      return errorResponse(
        res,
        orderError?.message || "Failed to create order",
        500
      );
    }

    // --------------------------------------------------
    // 9. Create order items
    // --------------------------------------------------

    const orderItemsToInsert = orderItems.map((item) => ({
      order_id: order.id,
      food_id: item.food_id,
      quantity: item.quantity,
      price: item.price,
    }));

    const {
      error: orderItemsError,
    } = await supabase
      .from("order_items")
      .insert(orderItemsToInsert);

    if (orderItemsError) {
      console.error("ORDER ITEMS ERROR:", orderItemsError);

      return errorResponse(
        res,
        orderItemsError.message,
        500
      );
    }

    // --------------------------------------------------
    // 10. Save coupon usage
    // --------------------------------------------------

    if (coupon_id) {
      const {
        error: couponUsageError,
      } = await supabase
        .from("coupon_usage")
        .insert([
          {
            coupon_id,
            user_id: userId,
            order_id: order.id,
            discount_amount,
          },
        ]);

      if (couponUsageError) {
        console.error(
          "COUPON USAGE ERROR:",
          couponUsageError
        );

        return errorResponse(
          res,
          couponUsageError.message,
          500
        );
      }

      // Get current used count
      const {
        data: couponToUpdate,
        error: couponFetchError,
      } = await supabase
        .from("coupons")
        .select("used_count")
        .eq("id", coupon_id)
        .single();

      if (couponFetchError || !couponToUpdate) {
        console.error(
          "COUPON FETCH ERROR:",
          couponFetchError
        );

        return errorResponse(
          res,
          "Failed to update coupon usage",
          500
        );
      }

      const currentUsedCount =
        Number(couponToUpdate.used_count) || 0;

      const {
        error: couponUpdateError,
      } = await supabase
        .from("coupons")
        .update({
          used_count: currentUsedCount + 1,
        })
        .eq("id", coupon_id);

      if (couponUpdateError) {
        console.error(
          "COUPON UPDATE ERROR:",
          couponUpdateError
        );

        return errorResponse(
          res,
          couponUpdateError.message,
          500
        );
      }
    }

    // --------------------------------------------------
    // 11. Clear cart
    // --------------------------------------------------

    const {
      error: clearError,
    } = await supabase
      .from("cart_items")
      .delete()
      .eq("user_id", userId);

    if (clearError) {
      console.error("CLEAR CART ERROR:", clearError);

      return errorResponse(
        res,
        clearError.message,
        500
      );
    }

    // --------------------------------------------------
    // 12. Get final order
    // --------------------------------------------------

    const {
      data: finalOrder,
      error: finalError,
    } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order.id)
      .single();

    if (finalError || !finalOrder) {
      console.error("FINAL ORDER ERROR:", finalError);

      return errorResponse(
        res,
        finalError?.message ||
          "Order created but could not retrieve final order",
        500
      );
    }

    // --------------------------------------------------
    // 13. Success response
    // --------------------------------------------------

    return successResponse(res, {
      order: finalOrder,
      order_items: orderItemsToInsert,
      subtotal,
      discount_amount,
      total_amount,
    });
  } catch (err) {
    console.error("CREATE ORDER EXCEPTION:", err);
    next(err);
  }
};

// ======================================================
// GET ALL ORDERS
// ======================================================

export const getOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const {
      data,
      error,
    } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error("GET ORDERS ERROR:", error);

      return errorResponse(res, error.message, 400);
    }

    return successResponse(res, data);
  } catch (err) {
    console.error("GET ORDERS EXCEPTION:", err);
    next(err);
  }
};

// ======================================================
// GET ORDER BY ID
// ======================================================

export const getOrderById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);

    if (isNaN(id)) {
      return errorResponse(res, "Invalid order ID", 400);
    }

    // Get order
    const {
      data: order,
      error: orderError,
    } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (
      orderError ||
      !order ||
      order.user_id !== userId
    ) {
      return errorResponse(res, "Order not found", 404);
    }

    // Get restaurant
    const {
      data: restaurant,
      error: restaurantError,
    } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", order.restaurant_id)
      .single();

    // Get address
    const {
      data: address,
      error: addressError,
    } = await supabase
      .from("addresses")
      .select("*")
      .eq("id", order.address_id)
      .single();

    // Get order items
    const {
      data: orderItems,
      error: orderItemsError,
    } = await supabase
      .from("order_items")
      .select("*, foods(*)")
      .eq("order_id", id);

    // Get assignment
    const {
      data: assignment,
      error: assignmentError,
    } = await supabase
      .from("order_assignments")
      .select("*")
      .eq("order_id", id)
      .maybeSingle();

    if (
      restaurantError ||
      addressError ||
      orderItemsError
    ) {
      console.error("ORDER DETAILS ERROR:", {
        restaurantError,
        addressError,
        orderItemsError,
      });

      return errorResponse(
        res,
        "Failed to retrieve order details",
        500
      );
    }

    return successResponse(res, {
      order,
      restaurant,
      address,
      order_items: orderItems,
      assignment: assignment || null,
    });
  } catch (err) {
    console.error("GET ORDER BY ID EXCEPTION:", err);
    next(err);
  }
};

// ======================================================
// CANCEL ORDER
// ======================================================

export const cancelOrder = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);

    if (isNaN(id)) {
      return errorResponse(res, "Invalid order ID", 400);
    }

    // Get order
    const {
      data: order,
      error: orderError,
    } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (
      orderError ||
      !order ||
      order.user_id !== userId
    ) {
      return errorResponse(res, "Order not found", 404);
    }

    // Check status
    if (
      order.order_status !== "placed" &&
      order.order_status !== "confirmed"
    ) {
      return errorResponse(
        res,
        "Order cannot be cancelled",
        400
      );
    }

    // Cancel order
    const {
      data,
      error,
    } = await supabase
      .from("orders")
      .update({
        order_status: "cancelled",
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("CANCEL ORDER ERROR:", error);

      return errorResponse(res, error.message, 400);
    }

    return successResponse(res, data);
  } catch (err) {
    console.error("CANCEL ORDER EXCEPTION:", err);
    next(err);
  }
};

export const updateRiderLocation = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const {
      order_id,
      latitude,
      longitude,
    } = req.body;

    if (
      order_id === undefined ||
      latitude === undefined ||
      longitude === undefined
    ) {
      return errorResponse(
        res,
        "order_id, latitude and longitude are required",
        400
      );
    }

    const orderId = Number(order_id);
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (
      isNaN(orderId) ||
      isNaN(lat) ||
      isNaN(lng)
    ) {
      return errorResponse(
        res,
        "Invalid order_id, latitude or longitude",
        400
      );
    }

    if (
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return errorResponse(
        res,
        "Invalid latitude or longitude",
        400
      );
    }

    /*
     * Check assignment
     *
     * IMPORTANT:
     * Yahan rider authentication ke according
     * rider_id verification karni hogi.
     */
    const {
      data: assignment,
      error: assignmentError,
    } = await supabase
      .from("order_assignments")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (assignmentError) {
      return errorResponse(
        res,
        assignmentError.message,
        500
      );
    }

    if (!assignment) {
      return errorResponse(
        res,
        "Order assignment not found",
        404
      );
    }

    /*
     * TODO:
     * Agar rider JWT me rider/user ID available hai,
     * to yahan assignment.rider_id === userId verify karo.
     */

    const {
      data: updatedAssignment,
      error: updateError,
    } = await supabase
      .from("order_assignments")
      .update({
        rider_latitude: lat,
        rider_longitude: lng,
        location_updated_at: new Date().toISOString(),
      })
      .eq("id", assignment.id)
      .select()
      .single();

    if (updateError) {
      console.error(
        "RIDER LOCATION UPDATE ERROR:",
        updateError
      );

      return errorResponse(
        res,
        updateError.message,
        500
      );
    }

    return successResponse(
      res,
      updatedAssignment
    );

  } catch (err) {
    console.error(
      "UPDATE RIDER LOCATION EXCEPTION:",
      err
    );

    next(err);
  }
};