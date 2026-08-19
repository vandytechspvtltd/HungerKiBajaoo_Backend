import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";

export const getCategories = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from("categories").select("*").order("created_at", { ascending: false });
    if (error) {
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const getCategoryFoods = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { data: category, error: categoryError } = await supabase.from("categories").select("*").eq("id", id).single();
    if (categoryError || !category) {
      return errorResponse(res, "Category not found", 404);
    }

    const { data: foods, error: foodsError } = await supabase.from("foods").select("*").eq("category", category.name).order("created_at", { ascending: true });
    if (foodsError) {
      return errorResponse(res, foodsError.message, 400);
    }
    return successResponse(res, { category, foods });
  } catch (err) {
    next(err);
  }
};
