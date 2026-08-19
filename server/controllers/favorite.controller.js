import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";

export const getFavorites = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase.from("favorites").select("*, restaurants(*)").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) {
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const addFavorite = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const restaurantId = Number(req.params.restaurantId);

    const { data: existing, error: existingError } = await supabase.from("favorites").select("*").eq("user_id", userId).eq("restaurant_id", restaurantId).single();
    if (existingError && existingError.code !== "PGRST116") {
      return errorResponse(res, existingError.message, 400);
    }
    if (existing) {
      return errorResponse(res, "Restaurant already favorited", 400);
    }

    const { data, error } = await supabase.from("favorites").insert([{ user_id: userId, restaurant_id: restaurantId }]).single();
    if (error) {
      return errorResponse(res, error.message, 400);
    }

    return successResponse(res, data, 201);
  } catch (err) {
    next(err);
  }
};

export const removeFavorite = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const restaurantId = Number(req.params.restaurantId);
    const { data, error } = await supabase.from("favorites").delete().eq("user_id", userId).eq("restaurant_id", restaurantId);
    if (error) {
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, { message: "Favorite removed" });
  } catch (err) {
    next(err);
  }
};
