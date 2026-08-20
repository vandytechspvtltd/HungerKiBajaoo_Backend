import { supabase } from "../config/supabase.js";
import {
  successResponse,
  errorResponse
} from "../utils/response.js";


// =====================================================
// GET DELIVERY ORDERS
// =====================================================

export const getDeliveryOrders = async (
  req,
  res,
  next
) => {

  try {

    const userId =
      req.user.id;


    // =================================================
    // FIND DELIVERY PARTNER
    // =================================================

    const {
      data: partner,
      error: partnerError
    } = await supabase
      .from("delivery_partners")
      .select("*")
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


    // =================================================
    // GET ASSIGNED ORDERS
    // =================================================

    const {
      data,
      error
    } = await supabase
      .from("order_assignments")
      .select(`
        *,
        orders (*),
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
        "delivery_partner_id",
        partner.id
      )
      .order(
        "assigned_at",
        {
          ascending: false
        }
      );


    if (error) {

      console.error(
        "GET DELIVERY ORDERS ERROR:",
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
      data || []
    );


  } catch (err) {

    next(err);
  }
};


// =====================================================
// UPDATE DELIVERY ORDER STATUS
// =====================================================

export const updateDeliveryOrderStatus = async (
  req,
  res,
  next
) => {

  try {

    const userId =
      req.user.id;


    const assignmentId =
      Number(
        req.params.id
      );


    const {
      status
    } = req.body;


    // =================================================
    // VALID DELIVERY PARTNER STATUSES
    // =================================================

    const allowedStatuses = [
      "assigned",
      "confirmed",
      "preparing",
      "ready",
      "picked_up",
      "on_the_way",
      "delivered"
    ];


    if (
      !status ||
      !allowedStatuses.includes(
        status
      )
    ) {

      return errorResponse(
        res,
        "Invalid delivery status",
        400
      );
    }


    // =================================================
    // FIND DELIVERY PARTNER
    // =================================================

    const {
      data: partner,
      error: partnerError
    } = await supabase
      .from("delivery_partners")
      .select("*")
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


    // =================================================
    // FIND ASSIGNMENT
    // =================================================

    const {
      data: assignment,
      error: assignmentError
    } = await supabase
      .from("order_assignments")
      .select("*")
      .eq(
        "id",
        assignmentId
      )
      .single();


    if (
      assignmentError ||
      !assignment ||
      assignment.delivery_partner_id !==
        partner.id
    ) {

      return errorResponse(
        res,
        "Order assignment not found",
        404
      );
    }


    // =================================================
    // UPDATE ASSIGNMENT
    // =================================================

    const assignmentUpdates = {
      status
    };


    if (
      status === "picked_up"
    ) {

      assignmentUpdates.picked_up_at =
        new Date().toISOString();
    }


    if (
      status === "delivered"
    ) {

      assignmentUpdates.delivered_at =
        new Date().toISOString();
    }


    const {
      data: updatedAssignment,
      error: updateError
    } = await supabase
      .from("order_assignments")
      .update(
        assignmentUpdates
      )
      .eq(
        "id",
        assignmentId
      )
      .select("*")
      .single();


    if (
      updateError
    ) {

      console.error(
        "UPDATE ASSIGNMENT ERROR:",
        updateError
      );

      return errorResponse(
        res,
        updateError.message,
        400
      );
    }


    // =================================================
    // MAP PARTNER STATUS -> CUSTOMER ORDER STATUS
    // =================================================
    //
    // orders table allows ONLY:
    //
    // placed
    // confirmed
    // preparing
    // out_for_delivery
    // delivered
    // cancelled
    //
    // =================================================

    let orderStatus = null;
    let statusMessage = null;


    switch (status) {

      case "assigned":

        orderStatus =
          null;

        statusMessage =
          "Delivery partner has been assigned.";

        break;


      case "confirmed":

        orderStatus =
          "confirmed";

        statusMessage =
          "Restaurant has confirmed your order.";

        break;


      case "preparing":

        orderStatus =
          "preparing";

        statusMessage =
          "Your food is being prepared.";

        break;


      case "ready":

        // orders table has no "ready" status.
        // Keep the order status as preparing,
        // but save ready in assignment/history.

        orderStatus =
          "preparing";

        statusMessage =
          "Your food is ready for pickup.";

        break;


      case "picked_up":

        orderStatus =
          "out_for_delivery";

        statusMessage =
          "Your order has been picked up by the rider.";

        break;


      case "on_the_way":

        orderStatus =
          "out_for_delivery";

        statusMessage =
          "Your rider is on the way.";

        break;


      case "delivered":

        orderStatus =
          "delivered";

        statusMessage =
          "Order delivered successfully.";

        break;
    }


    // =================================================
    // UPDATE CUSTOMER ORDER
    // =================================================

    if (
      orderStatus
    ) {

      const {
        error: orderUpdateError
      } = await supabase
        .from("orders")
        .update({

          order_status:
            orderStatus,

          status_message:
            statusMessage

        })
        .eq(
          "id",
          assignment.order_id
        );


      if (
        orderUpdateError
      ) {

        console.error(
          "UPDATE ORDER STATUS ERROR:",
          orderUpdateError
        );

        return errorResponse(
          res,
          orderUpdateError.message,
          400
        );
      }
    }


    // =================================================
    // SAVE STATUS HISTORY
    // =================================================

    const historyStatus =
      status === "assigned"
        ? "confirmed"
        : status === "ready"
            ? "preparing"
            : status === "picked_up"
                ? "out_for_delivery"
                : status === "on_the_way"
                    ? "out_for_delivery"
                    : status;


    const historyMessage =
      statusMessage ||
      "Order status updated.";


    // Avoid duplicate history entries
    const {
      data: existingHistory
    } = await supabase
      .from("order_status_history")
      .select("id")
      .eq(
        "order_id",
        assignment.order_id
      )
      .eq(
        "status",
        historyStatus
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
            assignment.order_id,

          status:
            historyStatus,

          message:
            historyMessage
        });


      if (
        historyError
      ) {

        console.error(
          "STATUS HISTORY ERROR:",
          historyError
        );

        return errorResponse(
          res,
          historyError.message,
          400
        );
      }
    }


    // =================================================
    // RESPONSE
    // =================================================

    return successResponse(
      res,
      {

        assignment:
          updatedAssignment,

        order_status:
          orderStatus,

        status_message:
          statusMessage
      }
    );


  } catch (err) {

    console.error(
      "UPDATE DELIVERY STATUS ERROR:",
      err
    );

    next(err);
  }
};


// =====================================================
// UPDATE RIDER LOCATION
// =====================================================

export const updateRiderLocation = async (
  req,
  res,
  next
) => {

  try {

    const userId =
      req.user.id;


    const assignmentId =
      Number(
        req.params.id
      );


    const {
      latitude,
      longitude
    } = req.body;


    const lat =
      Number(latitude);

    const lng =
      Number(longitude);


    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {

      return errorResponse(
        res,
        "Invalid latitude or longitude",
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


    // =================================================
    // FIND PARTNER
    // =================================================

    const {
      data: partner,
      error: partnerError
    } = await supabase
      .from("delivery_partners")
      .select("*")
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


    // =================================================
    // CHECK ASSIGNMENT
    // =================================================

    const {
      data: assignment,
      error: assignmentError
    } = await supabase
      .from("order_assignments")
      .select("*")
      .eq(
        "id",
        assignmentId
      )
      .single();


    if (
      assignmentError ||
      !assignment ||
      assignment.delivery_partner_id !==
        partner.id
    ) {

      return errorResponse(
        res,
        "Order assignment not found",
        404
      );
    }


    // =================================================
    // UPDATE LOCATION
    // =================================================

    const {
      data,
      error
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
        assignmentId
      )
      .select("*")
      .single();


    if (error) {

      console.error(
        "UPDATE RIDER LOCATION ERROR:",
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

    console.error(
      "UPDATE RIDER LOCATION ERROR:",
      err
    );

    next(err);
  }
};