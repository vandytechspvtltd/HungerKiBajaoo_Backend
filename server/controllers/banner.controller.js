import { supabase } from "../config/supabase.js";
import {
  successResponse,
  errorResponse
} from "../utils/response.js";

export const getBanners = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("banners")
      .select("*")
      .eq("is_active", true)
      .order("created_at", {
        ascending: false
      });

    if (error) {
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