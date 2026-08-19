import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { validateRequiredFields } from "../utils/validation.js";

export const getAddresses = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase.from("addresses").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) {
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const createAddress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { title, address, latitude, longitude, is_default } = req.body;
    if (!validateRequiredFields(["title", "address", "latitude", "longitude"], req.body)) {
      return errorResponse(res, "Invalid request data", 400);
    }

    if (is_default) {
      await supabase.from("addresses").update({ is_default: false }).eq("user_id", userId);
    }

    const { data, error } = await supabase.from("addresses").insert([{ user_id: userId, title, address, latitude, longitude, is_default: !!is_default }]).single();
    if (error) {
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, data, 201);
  } catch (err) {
    next(err);
  }
};

export const updateAddress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    const { title, address, latitude, longitude, is_default } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (address !== undefined) updates.address = address;
    if (latitude !== undefined) updates.latitude = latitude;
    if (longitude !== undefined) updates.longitude = longitude;
    if (is_default !== undefined) updates.is_default = !!is_default;

    if (Object.keys(updates).length === 0) {
      return errorResponse(res, "At least one field is required to update", 400);
    }

    const { data: existing, error: existingError } = await supabase.from("addresses").select("*").eq("id", id).single();
    if (existingError || !existing || existing.user_id !== userId) {
      return errorResponse(res, "Address not found", 404);
    }

    if (updates.is_default) {
      await supabase.from("addresses").update({ is_default: false }).eq("user_id", userId);
    }

    const { data, error } = await supabase.from("addresses").update(updates).eq("id", id).single();
    if (error) {
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const deleteAddress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    const { data: existing, error: existingError } = await supabase.from("addresses").select("*").eq("id", id).single();
    if (existingError || !existing || existing.user_id !== userId) {
      return errorResponse(res, "Address not found", 404);
    }

    const { error } = await supabase.from("addresses").delete().eq("id", id);
    if (error) {
      return errorResponse(res, error.message, 400);
    }
    return successResponse(res, { message: "Address deleted" });
  } catch (err) {
    next(err);
  }
};
