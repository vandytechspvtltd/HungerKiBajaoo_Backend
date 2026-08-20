import { supabase } from "../config/supabase.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { validateRequiredFields } from "../utils/validation.js";

// =====================================================
// GET ADDRESSES
// =====================================================

export const getAddresses = async (req, res, next) => {
  try {

    const userId = req.user.id;

    const {
      data,
      error
    } = await supabase
      .from("addresses")
      .select("*")
      .eq("user_id", userId)
      .order("is_default", {
        ascending: false
      })
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


// =====================================================
// CREATE ADDRESS
// =====================================================
// =====================================================
// CREATE ADDRESS
// =====================================================

export const createAddress = async (req, res, next) => {

  try {

    const userId = req.user.id;

    const {
      label,
      address_line1,
      address_line2,
      city,
      state,
      pincode,
      latitude,
      longitude,
      is_default
    } = req.body;


    // -----------------------------------------------
    // REQUIRED FIELDS
    // -----------------------------------------------

    if (
      !validateRequiredFields(
        [
          "label",
          "address_line1",
          "city",
          "state",
          "pincode"
        ],
        req.body
      )
    ) {

      return errorResponse(
        res,
        "Invalid request data",
        400
      );
    }


    // -----------------------------------------------
    // BUILD FULL ADDRESS
    // -----------------------------------------------

    const fullAddress = [
      address_line1,
      address_line2,
      city,
      state,
      pincode
    ]
      .filter(
        value =>
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
      )
      .map(value => String(value).trim())
      .join(", ");


    // -----------------------------------------------
    // DEFAULT ADDRESS
    // -----------------------------------------------

    if (is_default) {

      const {
        error: defaultError
      } = await supabase
        .from("addresses")
        .update({
          is_default: false
        })
        .eq("user_id", userId);

      if (defaultError) {

        return errorResponse(
          res,
          defaultError.message,
          400
        );
      }
    }


    // -----------------------------------------------
    // CREATE
    // -----------------------------------------------

    const {
      data,
      error
    } = await supabase
      .from("addresses")
      .insert([
        {
          user_id: userId,

          // Existing NOT NULL column
          address: fullAddress,

          // Structured address fields
          label: label,
          address_line1: address_line1,
          address_line2:
            address_line2 || null,

          city: city,
          state: state,
          pincode: pincode,

          latitude:
            latitude ?? null,

          longitude:
            longitude ?? null,

          is_default:
            !!is_default
        }
      ])
      .select("*")
      .single();


    if (error) {

      console.error(
        "createAddress Supabase error:",
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
      data,
      201
    );

  } catch (err) {

    next(err);
  }
};

// =====================================================
// UPDATE ADDRESS
// =====================================================

export const updateAddress = async (
  req,
  res,
  next
) => {

  try {

    const userId =
      req.user.id;

    const id =
      Number(req.params.id);


    const {
      label,
      address_line1,
      address_line2,
      city,
      state,
      pincode,
      latitude,
      longitude,
      is_default
    } = req.body;


    // -----------------------------------------------
    // CHECK EXISTING ADDRESS
    // -----------------------------------------------

    const {
      data: existing,
      error: existingError
    } = await supabase
      .from("addresses")
      .select("*")
      .eq("id", id)
      .single();


    if (
      existingError ||
      !existing ||
      existing.user_id !== userId
    ) {

      return errorResponse(
        res,
        "Address not found",
        404
      );
    }


    // -----------------------------------------------
    // BUILD UPDATE
    // -----------------------------------------------

    const updates = {};


    if (label !== undefined) {
      updates.label =
        label;
    }

    if (
      address_line1 !== undefined
    ) {
      updates.address_line1 =
        address_line1;
    }

    if (
      address_line2 !== undefined
    ) {
      updates.address_line2 =
        address_line2;
    }

    if (city !== undefined) {
      updates.city =
        city;
    }

    if (state !== undefined) {
      updates.state =
        state;
    }

    if (pincode !== undefined) {
      updates.pincode =
        pincode;
    }

    if (latitude !== undefined) {
      updates.latitude =
        latitude;
    }

    if (longitude !== undefined) {
      updates.longitude =
        longitude;
    }

    if (is_default !== undefined) {
      updates.is_default =
        !!is_default;
    }


    // -----------------------------------------------
    // NOTHING TO UPDATE
    // -----------------------------------------------

    if (
      Object.keys(updates).length === 0
    ) {

      return errorResponse(
        res,
        "At least one field is required to update",
        400
      );
    }


    // -----------------------------------------------
    // DEFAULT ADDRESS
    // -----------------------------------------------

    if (updates.is_default === true) {

      const {
        error: defaultError
      } = await supabase
        .from("addresses")
        .update({
          is_default: false
        })
        .eq("user_id", userId);

      if (defaultError) {

        return errorResponse(
          res,
          defaultError.message,
          400
        );
      }
    }


    // -----------------------------------------------
    // UPDATE
    // -----------------------------------------------

    const {
      data,
      error
    } = await supabase
      .from("addresses")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
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


// =====================================================
// DELETE ADDRESS
// =====================================================

export const deleteAddress = async (
  req,
  res,
  next
) => {

  try {

    const userId =
      req.user.id;

    const id =
      Number(req.params.id);


    // -----------------------------------------------
    // CHECK EXISTING
    // -----------------------------------------------

    const {
      data: existing,
      error: existingError
    } = await supabase
      .from("addresses")
      .select("*")
      .eq("id", id)
      .single();


    if (
      existingError ||
      !existing ||
      existing.user_id !== userId
    ) {

      return errorResponse(
        res,
        "Address not found",
        404
      );
    }


    // -----------------------------------------------
    // DELETE
    // -----------------------------------------------

    const {
      error
    } = await supabase
      .from("addresses")
      .delete()
      .eq("id", id);


    if (error) {

      return errorResponse(
        res,
        error.message,
        400
      );
    }


    return successResponse(
      res,
      {
        message:
          "Address deleted"
      }
    );

  } catch (err) {

    next(err);
  }
};