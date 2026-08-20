import { supabase } from "../config/supabase.js";
import {
  successResponse,
  errorResponse
} from "../utils/response.js";
import {
  validateRequiredFields
} from "../utils/validation.js";


// ======================================================
// CALCULATE DISCOUNT
// ======================================================

const calculateDiscount = (
  coupon,
  subtotal
) => {

  let discount = 0;

  if (
    coupon.discount_type ===
    "percentage"
  ) {

    discount =
      (
        Number(subtotal) *
        Number(coupon.discount_value)
      ) / 100;

  } else {

    discount =
      Number(
        coupon.discount_value
      );
  }

  if (
    coupon.maximum_discount !== null &&
    coupon.maximum_discount !== undefined &&
    discount >
      Number(coupon.maximum_discount)
  ) {

    discount =
      Number(
        coupon.maximum_discount
      );
  }

  discount =
    Math.min(
      discount,
      subtotal
    );

  return Number(
    discount.toFixed(2)
  );
};


// ======================================================
// CREATE ORDER
// ======================================================

export const createOrder = async (
  req,
  res,
  next
) => {

  try {

    const userId =
      req.user.id;

    const {
      restaurant_id,
      address_id,
      payment_method,
      coupon_code
    } = req.body;


    // ==================================================
    // VALIDATION
    // ==================================================

    if (
      !validateRequiredFields(
        [
          "restaurant_id",
          "address_id",
          "payment_method"
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


    const requestedRestaurantId =
      Number(
        restaurant_id
      );

    const addressId =
      Number(
        address_id
      );


    if (
      !Number.isInteger(
        requestedRestaurantId
      ) ||
      !Number.isInteger(
        addressId
      )
    ) {

      return errorResponse(
        res,
        "restaurant_id and address_id must be valid numbers",
        400
      );
    }


    // ==================================================
    // 1. GET CART
    // ==================================================

    const {
      data: cartItems,
      error: cartError
    } = await supabase
      .from("cart_items")
      .select("*, foods(*)")
      .eq(
        "user_id",
        userId
      );


    if (cartError) {

      console.error(
        "CART ERROR:",
        cartError
      );

      return errorResponse(
        res,
        cartError.message,
        400
      );
    }


    if (
      !cartItems ||
      cartItems.length === 0
    ) {

      return errorResponse(
        res,
        "Cart is empty",
        400
      );
    }


    // ==================================================
    // 2. VALIDATE CART
    // ==================================================

    const missingFoodItem =
      cartItems.find(
        (item) =>
          !item.foods
      );

    if (
      missingFoodItem
    ) {

      return errorResponse(
        res,
        "Cart contains an invalid food item",
        400
      );
    }


    const inactiveItem =
      cartItems.find(
        (item) =>
          item.foods?.is_active === false
      );

    if (
      inactiveItem
    ) {

      return errorResponse(
        res,
        "Cart contains an unavailable food item",
        400
      );
    }


    const cartRestaurantIds = [
      ...new Set(

        cartItems
          .map(
            (item) =>
              Number(
                item.foods?.restaurant_id
              )
          )
          .filter(
            (id) =>
              Number.isInteger(id)
          )
      )
    ];


    if (
      cartRestaurantIds.length === 0
    ) {

      return errorResponse(
        res,
        "Cart has no valid restaurant",
        400
      );
    }


    if (
      cartRestaurantIds.length > 1
    ) {

      return errorResponse(
        res,
        "Cart contains items from different restaurants",
        400
      );
    }


    const restaurantId =
      cartRestaurantIds[0];


    // ==================================================
    // 3. VALIDATE ADDRESS
    // ==================================================

    const {
      data: address,
      error: addressError
    } = await supabase
      .from("addresses")
      .select("*")
      .eq(
        "id",
        addressId
      )
      .single();


    if (
      addressError ||
      !address ||
      address.user_id !== userId
    ) {

      console.error(
        "ADDRESS ERROR:",
        addressError
      );

      return errorResponse(
        res,
        "Address not found",
        404
      );
    }


    // ==================================================
    // 4. VALIDATE RESTAURANT
    // ==================================================

    const {
      data: restaurant,
      error: restaurantError
    } = await supabase
      .from("restaurants")
      .select("*")
      .eq(
        "id",
        restaurantId
      )
      .single();


    if (
      restaurantError ||
      !restaurant
    ) {

      console.error(
        "RESTAURANT ERROR:",
        restaurantError
      );

      return errorResponse(
        res,
        "Restaurant not found",
        404
      );
    }


    if (
      restaurant.is_open === false
    ) {

      return errorResponse(
        res,
        "Restaurant is currently closed",
        400
      );
    }


    // ==================================================
    // 5. CALCULATE SUBTOTAL
    // ==================================================

    let subtotal = 0;


    const orderItems =
      cartItems.map(
        (item) => {

          const price =
            Number(
              item.foods.price || 0
            );

          const quantity =
            Number(
              item.quantity || 0
            );


          if (
            quantity < 1
          ) {

            throw new Error(
              "Invalid cart quantity"
            );
          }


          subtotal +=
            price * quantity;


          return {
            food_id:
              item.food_id,

            quantity,

            price
          };
        }
      );


    subtotal =
      Number(
        subtotal.toFixed(2)
      );


    // ==================================================
    // 6. COUPON
    // ==================================================

    let discount_amount = 0;
    let coupon_id = null;


    if (
      coupon_code &&
      String(
        coupon_code
      ).trim() !== ""
    ) {

      const normalizedCode =
        String(
          coupon_code
        )
          .trim()
          .toUpperCase();


      const now =
        new Date().toISOString();


      const {
        data: coupon,
        error: couponError
      } = await supabase
        .from("coupons")
        .select("*")
        .eq(
          "code",
          normalizedCode
        )
        .single();


      if (
        couponError ||
        !coupon
      ) {

        return errorResponse(
          res,
          "Coupon not found",
          404
        );
      }


      if (
        !coupon.is_active ||
        now < coupon.valid_from ||
        now > coupon.valid_until
      ) {

        return errorResponse(
          res,
          "Coupon is not valid",
          400
        );
      }


      if (
        coupon.minimum_order_amount &&
        subtotal <
          Number(
            coupon.minimum_order_amount
          )
      ) {

        return errorResponse(
          res,
          "Cart total does not meet coupon minimum",
          400
        );
      }


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


      coupon_id =
        coupon.id;


      discount_amount =
        calculateDiscount(
          coupon,
          subtotal
        );
    }


    // ==================================================
    // 7. FINAL TOTAL
    // ==================================================

    const total_amount =
      Number(
        (
          subtotal -
          discount_amount
        ).toFixed(2)
      );


    // ==================================================
    // 8. CREATE ORDER
    // ==================================================

    const {
      data: order,
      error: orderError
    } = await supabase
      .from("orders")
      .insert([
        {
          user_id:
            userId,

          restaurant_id:
            restaurantId,

          address_id:
            addressId,

          total_amount:
            total_amount,

          payment_method:
            payment_method,

          payment_status:
            "pending",

          order_status:
            "placed",

          status_message:
            "Your order has been placed."
        }
      ])
      .select()
      .single();


    if (
      orderError ||
      !order
    ) {

      console.error(
        "ORDER INSERT ERROR:",
        orderError
      );

      return errorResponse(
        res,
        orderError?.message ||
          "Failed to create order",
        500
      );
    }


    // ==================================================
    // 8.1 INITIAL HISTORY
    // ==================================================

    const {
      error: historyError
    } = await supabase
      .from("order_status_history")
      .insert({
        order_id:
          order.id,

        status:
          "placed",

        message:
          "Your order has been placed."
      });


    if (
      historyError
    ) {

      console.error(
        "INITIAL STATUS HISTORY ERROR:",
        historyError
      );


      await supabase
        .from("orders")
        .delete()
        .eq(
          "id",
          order.id
        );


      return errorResponse(
        res,
        historyError.message,
        500
      );
    }


    // ==================================================
    // 9. ORDER ITEMS
    // ==================================================

    const orderItemsToInsert =
      orderItems.map(
        (item) => ({

          order_id:
            order.id,

          food_id:
            item.food_id,

          quantity:
            item.quantity,

          price:
            item.price
        })
      );


    const {
      error: orderItemsError
    } = await supabase
      .from("order_items")
      .insert(
        orderItemsToInsert
      );


    if (
      orderItemsError
    ) {

      console.error(
        "ORDER ITEMS ERROR:",
        orderItemsError
      );


      await supabase
        .from("orders")
        .delete()
        .eq(
          "id",
          order.id
        );


      return errorResponse(
        res,
        orderItemsError.message,
        500
      );
    }


    // ==================================================
    // 10. COUPON USAGE
    // ==================================================

    if (
      coupon_id
    ) {

      const {
        error: couponUsageError
      } = await supabase
        .from("coupon_usage")
        .insert([
          {
            coupon_id:
              coupon_id,

            user_id:
              userId,

            order_id:
              order.id,

            discount_amount:
              discount_amount
          }
        ]);


      if (
        couponUsageError
      ) {

        return errorResponse(
          res,
          couponUsageError.message,
          500
        );
      }


      const {
        data: couponToUpdate,
        error: couponFetchError
      } = await supabase
        .from("coupons")
        .select(
          "used_count"
        )
        .eq(
          "id",
          coupon_id
        )
        .single();


      if (
        couponFetchError ||
        !couponToUpdate
      ) {

        return errorResponse(
          res,
          "Failed to update coupon usage",
          500
        );
      }


      const currentUsedCount =
        Number(
          couponToUpdate.used_count ||
            0
        );


      const {
        error: couponUpdateError
      } = await supabase
        .from("coupons")
        .update({
          used_count:
            currentUsedCount + 1
        })
        .eq(
          "id",
          coupon_id
        );


      if (
        couponUpdateError
      ) {

        return errorResponse(
          res,
          couponUpdateError.message,
          500
        );
      }
    }


    // ==================================================
    // 11. CLEAR CART
    // ==================================================

    const {
      error: clearError
    } = await supabase
      .from("cart_items")
      .delete()
      .eq(
        "user_id",
        userId
      );


    if (
      clearError
    ) {

      return errorResponse(
        res,
        clearError.message,
        500
      );
    }


    // ==================================================
    // 12. FINAL ORDER
    // ==================================================

    const {
      data: finalOrder,
      error: finalError
    } = await supabase
      .from("orders")
      .select("*")
      .eq(
        "id",
        order.id
      )
      .single();


    if (
      finalError ||
      !finalOrder
    ) {

      return errorResponse(
        res,
        finalError?.message ||
          "Order created but could not retrieve final order",
        500
      );
    }


    // ==================================================
    // SUCCESS
    // ==================================================

    return successResponse(
      res,
      {
        order:
          finalOrder,

        order_items:
          orderItemsToInsert,

        subtotal:
          subtotal,

        discount_amount:
          discount_amount,

        total_amount:
          total_amount
      }
    );


  } catch (err) {

    console.error(
      "CREATE ORDER EXCEPTION:",
      err
    );

    next(err);
  }
};


// ======================================================
// GET ALL ORDERS
// ======================================================

// ======================================================
// GET ALL ORDERS
// ======================================================

export const getOrders = async (
  req,
  res,
  next
) => {

  try {

    const userId =
      req.user.id;


    // ==================================================
    // 1. GET ORDERS
    // ==================================================

    const {
      data: orders,
      error: ordersError
    } = await supabase
      .from("orders")
      .select("*")
      .eq(
        "user_id",
        userId
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      );


    if (
      ordersError
    ) {

      console.error(
        "GET ORDERS ERROR:",
        ordersError
      );

      return errorResponse(
        res,
        ordersError.message,
        400
      );
    }


    if (
      !orders ||
      orders.length === 0
    ) {

      return successResponse(
        res,
        []
      );
    }


    // ==================================================
    // 2. GET RESTAURANTS
    // ==================================================

    const restaurantIds = [
      ...new Set(
        orders
          .map(
            order =>
              order.restaurant_id
          )
          .filter(
            id =>
              id !== null &&
              id !== undefined
          )
      )
    ];


    let restaurants = [];


    if (
      restaurantIds.length > 0
    ) {

      const {
        data,
        error
      } = await supabase
        .from("restaurants")
        .select(`
          id,
          name,
          image_url,
          rating,
          delivery_time_range
        `)
        .in(
          "id",
          restaurantIds
        );


      if (
        error
      ) {

        console.error(
          "GET RESTAURANTS ERROR:",
          error
        );

        return errorResponse(
          res,
          error.message,
          400
        );
      }


      restaurants =
        data || [];
    }


    // ==================================================
    // 3. GET ORDER ITEMS
    // ==================================================

    const orderIds =
      orders.map(
        order =>
          order.id
      );


    const {
      data: orderItems,
      error: orderItemsError
    } = await supabase
      .from("order_items")
      .select(`
        id,
        order_id,
        food_id,
        quantity,
        price,
        foods (
          id,
          name,
          image_url,
          price
        )
      `)
      .in(
        "order_id",
        orderIds
      );


    if (
      orderItemsError
    ) {

      console.error(
        "GET ORDER ITEMS ERROR:",
        orderItemsError
      );

      return errorResponse(
        res,
        orderItemsError.message,
        400
      );
    }


    // ==================================================
    // 4. COMBINE RESPONSE
    // ==================================================

    const finalOrders =
      orders.map(
        order => {

          const restaurant =
            restaurants.find(
              item =>
                item.id ===
                order.restaurant_id
            ) || null;


          const items =
            (orderItems || [])
              .filter(
                item =>
                  item.order_id ===
                  order.id
              );


          return {
            ...order,

            restaurants:
              restaurant,

            order_items:
              items
          };
        }
      );


    // ==================================================
    // 5. SUCCESS
    // ==================================================

    return successResponse(
      res,
      finalOrders
    );


  } catch (err) {

    console.error(
      "GET ORDERS EXCEPTION:",
      err
    );

    next(err);
  }
};

// ======================================================
// GET ORDER BY ID
// ======================================================

export const getOrderById = async (
  req,
  res,
  next
) => {

  try {

    const userId =
      req.user.id;


    const id =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {

      return errorResponse(
        res,
        "Invalid order ID",
        400
      );
    }


    // ==================================================
    // ORDER
    // ==================================================

    const {
      data: order,
      error: orderError
    } = await supabase
      .from("orders")
      .select("*")
      .eq(
        "id",
        id
      )
      .single();


    if (
      orderError ||
      !order ||
      order.user_id !== userId
    ) {

      return errorResponse(
        res,
        "Order not found",
        404
      );
    }


    // ==================================================
    // RESTAURANT
    // ==================================================

    const {
      data: restaurant,
      error: restaurantError
    } = await supabase
      .from("restaurants")
      .select("*")
      .eq(
        "id",
        order.restaurant_id
      )
      .single();


    // ==================================================
    // ADDRESS
    // ==================================================

    const {
      data: address,
      error: addressError
    } = await supabase
      .from("addresses")
      .select("*")
      .eq(
        "id",
        order.address_id
      )
      .single();


    // ==================================================
    // ORDER ITEMS
    // ==================================================

    const {
      data: orderItems,
      error: orderItemsError
    } = await supabase
      .from("order_items")
      .select(
        "*, foods(*)"
      )
      .eq(
        "order_id",
        id
      );


    // ==================================================
    // STATUS HISTORY
    // ==================================================

    const {
      data: statusHistory,
      error: statusHistoryError
    } = await supabase
      .from("order_status_history")
      .select(`
        id,
        order_id,
        status,
        message,
        created_at
      `)
      .eq(
        "order_id",
        id
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      );


    // ==================================================
    // ASSIGNMENT + DELIVERY PARTNER
    // ==================================================

    const {
      data: assignment,
      error: assignmentError
    } = await supabase
      .from("order_assignments")
      .select(`
        *,
        delivery_partners (
          id,
          user_id,
          name,
          phone,
          photo,
          rating,
          total_deliveries,
          vehicle_model,
          is_available,
          is_active,
          created_at
        )
      `)
      .eq(
        "order_id",
        id
      )
      .maybeSingle();


    // ==================================================
    // ERROR CHECK
    // ==================================================

    if (
      restaurantError ||
      addressError ||
      orderItemsError ||
      statusHistoryError ||
      assignmentError
    ) {

      console.error(
        "ORDER DETAILS ERROR:",
        {
          restaurantError,
          addressError,
          orderItemsError,
          statusHistoryError,
          assignmentError
        }
      );

      return errorResponse(
        res,
        "Failed to retrieve order details",
        500
      );
    }


    // ==================================================
    // SUCCESS
    // ==================================================

    return successResponse(
      res,
      {
        order:
          order,

        restaurant:
          restaurant,

        address:
          address,

        order_items:
          orderItems || [],

        assignment:
          assignment || null,

        status_history:
          statusHistory || []
      }
    );


  } catch (err) {

    console.error(
      "GET ORDER BY ID EXCEPTION:",
      err
    );

    next(err);
  }
};


// ======================================================
// CANCEL ORDER
// ======================================================

export const cancelOrder = async (
  req,
  res,
  next
) => {

  try {

    const userId =
      req.user.id;

    const id =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {

      return errorResponse(
        res,
        "Invalid order ID",
        400
      );
    }


    const {
      data: order,
      error: orderError
    } = await supabase
      .from("orders")
      .select("*")
      .eq(
        "id",
        id
      )
      .single();


    if (
      orderError ||
      !order ||
      order.user_id !== userId
    ) {

      return errorResponse(
        res,
        "Order not found",
        404
      );
    }


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


    const {
      data,
      error
    } = await supabase
      .from("orders")
      .update({
        order_status:
          "cancelled",

        status_message:
          "Your order has been cancelled."
      })
      .eq(
        "id",
        id
      )
      .select()
      .single();


    if (
      error
    ) {

      console.error(
        "CANCEL ORDER ERROR:",
        error
      );

      return errorResponse(
        res,
        error.message,
        400
      );
    }


    // ==================================================
    // CANCELLED HISTORY
    // ==================================================

    const {
      data: existingHistory
    } = await supabase
      .from("order_status_history")
      .select("id")
      .eq(
        "order_id",
        id
      )
      .eq(
        "status",
        "cancelled"
      )
      .maybeSingle();


    if (
      !existingHistory
    ) {

      const {
        error: historyError
      } = await supabase
        .from("order_status_history")
        .insert({
          order_id:
            id,

          status:
            "cancelled",

          message:
            "Your order has been cancelled."
        });


      if (
        historyError
      ) {

        return errorResponse(
          res,
          historyError.message,
          500
        );
      }
    }


    return successResponse(
      res,
      data
    );


  } catch (err) {

    console.error(
      "CANCEL ORDER EXCEPTION:",
      err
    );

    next(err);
  }
};


// ======================================================
// UPDATE RIDER LOCATION
// ======================================================

export const updateRiderLocation = async (
  req,
  res,
  next
) => {

  try {

    const userId =
      req.user.id;


    const {
      order_id,
      latitude,
      longitude
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


    const orderId =
      Number(
        order_id
      );

    const lat =
      Number(
        latitude
      );

    const lng =
      Number(
        longitude
      );


    if (
      !Number.isInteger(orderId) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
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


    // ==================================================
    // FIND ASSIGNMENT
    // ==================================================

    const {
      data: assignment,
      error: assignmentError
    } = await supabase
      .from("order_assignments")
      .select("*")
      .eq(
        "order_id",
        orderId
      )
      .maybeSingle();


    if (
      assignmentError
    ) {

      return errorResponse(
        res,
        assignmentError.message,
        500
      );
    }


    if (
      !assignment
    ) {

      return errorResponse(
        res,
        "Order assignment not found",
        404
      );
    }


    // ==================================================
    // VERIFY DELIVERY PARTNER
    // ==================================================

    const {
      data: partner,
      error: partnerError
    } = await supabase
      .from("delivery_partners")
      .select("id")
      .eq(
        "user_id",
        userId
      )
      .single();


    if (
      partnerError ||
      !partner
    ) {

      return errorResponse(
        res,
        "Delivery partner not found",
        404
      );
    }


    if (
      assignment.delivery_partner_id !==
      partner.id
    ) {

      return errorResponse(
        res,
        "You are not assigned to this order",
        403
      );
    }


    // ==================================================
    // UPDATE LOCATION
    // ==================================================

    const {
      data: updatedAssignment,
      error: updateError
    } = await supabase
      .from("order_assignments")
      .update({

        rider_latitude:
          lat,

        rider_longitude:
          lng,

        location_updated_at:
          new Date().toISOString()
      })
      .eq(
        "id",
        assignment.id
      )
      .select()
      .single();


    if (
      updateError
    ) {

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