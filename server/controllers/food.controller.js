import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";

export const getFoods = async (req, res, next) => {
  try {
    const { restaurant_id, category, search, is_available } = req.query;
    let query = supabase.from("foods").select("*");

    if (restaurant_id) {
      query = query.eq("restaurant_id", Number(restaurant_id));
    }
    if (category) {
      query = query.eq("category", category);
    }
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }
    if (is_available !== undefined) {
      if (is_available === "true" || is_available === "false") {
        query = query.eq("is_available", is_available === "true");
      }
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) {
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const getFoodById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { data, error } = await supabase.from("foods").select("*").eq("id", id).single();
    if (error || !data) {
      return errorResponse(res, "Food item not found", 404);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};
