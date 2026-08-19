import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";

export const getDeliveryOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { data: partner, error: partnerError } = await supabase.from("delivery_partners").select("*").eq("user_id", userId).single();
    if (partnerError || !partner) {
      return errorResponse(res, "Delivery partner not found", 404);
    }

    const { data, error } = await supabase.from("order_assignments").select("*, orders(*)").eq("delivery_partner_id", partner.id).order("assigned_at", { ascending: false });
    if (error) {
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const updateDeliveryOrderStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const assignmentId = Number(req.params.id);
    const { status } = req.body;
    if (!status) {
      return errorResponse(res, "Status is required", 400);
    }

    const { data: partner, error: partnerError } = await supabase.from("delivery_partners").select("*").eq("user_id", userId).single();
    if (partnerError || !partner) {
      return errorResponse(res, "Delivery partner not found", 404);
    }

    const { data: assignment, error: assignmentError } = await supabase.from("order_assignments").select("*").eq("id", assignmentId).single();
    if (assignmentError || !assignment || assignment.delivery_partner_id !== partner.id) {
      return errorResponse(res, "Order assignment not found", 404);
    }

    const updates = {};
    if (status === "picked_up") {
      updates.picked_up_at = new Date().toISOString();
    }
    if (status === "delivered") {
      updates.delivered_at = new Date().toISOString();
    }

    const { data, error } = await supabase.from("order_assignments").update(updates).eq("id", assignmentId).single();
    if (error) {
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};
