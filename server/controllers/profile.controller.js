import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { validateRequiredFields } from "../utils/validation.js";

export const getProfile = async (req, res, next) => {
  try {
    const { id } = req.user;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
    if (error) {
      return errorResponse(res, error.message, 404);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { id } = req.user;
    const { name, phone, profile_image } = req.body;
    if (!name && !phone && !profile_image) {
      return errorResponse(res, "At least one field is required to update", 400);
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (profile_image !== undefined) updates.profile_image = profile_image;

    const { data, error } = await supabase.from("profiles").update(updates).eq("id", id).single();
    if (error) {
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};
