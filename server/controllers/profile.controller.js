import { supabase } from "../config/supabase.js";
import {
  successResponse,
  errorResponse
} from "../utils/response.js";

export const getProfile = async (req, res, next) => {
  try {

    const { id } = req.user;

    const {
      data,
      error
    } = await supabase
      .from("profiles")
      .select(`
        id,
        name,
        phone,
        email,
        profile_image,
        created_at,
        role,
        badge,
        total_meals_donated
      `)
      .eq("id", id)
      .single();

    if (error) {

      return errorResponse(
        res,
        error.message,
        404
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


export const updateProfile = async (req, res, next) => {
  try {

    const { id } = req.user;

    const {
      name,
      phone,
      profile_image,
      badge,
      total_meals_donated
    } = req.body;


    if (
      name === undefined &&
      phone === undefined &&
      profile_image === undefined &&
      badge === undefined &&
      total_meals_donated === undefined
    ) {

      return errorResponse(
        res,
        "At least one field is required to update",
        400
      );
    }


    const updates = {};


    if (name !== undefined) {
      updates.name = name;
    }


    if (phone !== undefined) {
      updates.phone = phone;
    }


    if (profile_image !== undefined) {
      updates.profile_image = profile_image;
    }


    if (badge !== undefined) {
      updates.badge = badge;
    }


    if (total_meals_donated !== undefined) {
      updates.total_meals_donated =
        total_meals_donated;
    }


    const {
      data,
      error
    } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", id)
      .select(`
        id,
        name,
        phone,
        email,
        profile_image,
        created_at,
        role,
        badge,
        total_meals_donated
      `)
      .single();


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