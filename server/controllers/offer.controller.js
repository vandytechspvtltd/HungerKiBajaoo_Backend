import { supabase } from "../config/supabase.js";
import {
  successResponse,
  errorResponse
} from "../utils/response.js";


// =====================================================
// GET ACTIVE OFFERS
// =====================================================

export const getOffers = async (
  req,
  res,
  next
) => {

  try {

    const now =
      new Date().toISOString();

    const {
      data,
      error
    } = await supabase
      .from("offers")
      .select("*")
      .eq(
        "is_active",
        true
      )
      .lte(
        "valid_from",
        now
      )
      .gte(
        "valid_until",
        now
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      );

    if (error) {

      return errorResponse(
        res,
        error.message,
        400
      );
    }

    return successResponse(
      res,
      data || []
    );

  } catch (err) {

    next(err);
  }
};


// =====================================================
// GET OFFER BY ID
// =====================================================

export const getOfferById = async (
  req,
  res,
  next
) => {

  try {

    const id =
      Number(req.params.id);

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {

      return errorResponse(
        res,
        "Invalid offer id",
        400
      );
    }

    const {
      data,
      error
    } = await supabase
      .from("offers")
      .select("*")
      .eq(
        "id",
        id
      )
      .single();

    if (
      error ||
      !data
    ) {

      return errorResponse(
        res,
        "Offer not found",
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