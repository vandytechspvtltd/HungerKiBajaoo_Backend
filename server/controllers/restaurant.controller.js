import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";

export const getRestaurants = async (req, res, next) => {
  try {
    const { search, category, is_open } = req.query;
    let query = supabase.from("restaurants").select("*");

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }
    if (category) {
      query = query.eq("category", category);
    }
    if (is_open !== undefined) {
      if (is_open === "true" || is_open === "false") {
        query = query.eq("is_open", is_open === "true");
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

export const getRestaurantById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { data, error } = await supabase.from("restaurants").select("*").eq("id", id).single();
    if (error || !data) {
      return errorResponse(res, "Restaurant not found", 404);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const getRestaurantMenu = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { data: restaurant, error: restaurantError } = await supabase.from("restaurants").select("*").eq("id", id).single();
    if (restaurantError || !restaurant) {
      return errorResponse(res, "Restaurant not found", 404);
    }

    const { data: foods, error: foodsError } = await supabase.from("foods").select("*").eq("restaurant_id", id).order("created_at", { ascending: true });
    if (foodsError) {
      return errorResponse(res, foodsError.message, 400);
    }

    return successResponse(res, { restaurant, foods });
  } catch (err) {
    next(err);
  }
};
