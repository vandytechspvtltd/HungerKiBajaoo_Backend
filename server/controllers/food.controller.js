import { supabase } from "../config/supabase.js";
import {
  successResponse,
  errorResponse
} from "../utils/response.js";


// =====================================================
// GET ALL FOODS
// =====================================================

export const getFoods = async (req, res, next) => {
  try {

    const {
      restaurant_id,
      category_id,
      search,
      is_active,
      is_veg,
      is_best_seller,
      is_spicy,
      page = 1,
      limit = 20
    } = req.query;


    const pageNumber =
      Math.max(
        Number(page) || 1,
        1
      );


    const limitNumber =
      Math.min(
        Math.max(
          Number(limit) || 20,
          1
        ),
        100
      );


    const from =
      (pageNumber - 1) *
      limitNumber;


    const to =
      from +
      limitNumber -
      1;


    let query =
      supabase
        .from("foods")
        .select("*", {
          count: "exact"
        });


    // -------------------------------------------------
    // RESTAURANT
    // -------------------------------------------------

    if (restaurant_id) {

      query =
        query.eq(
          "restaurant_id",
          Number(restaurant_id)
        );
    }


    // -------------------------------------------------
    // CATEGORY
    // -------------------------------------------------

    if (category_id) {

      query =
        query.eq(
          "category_id",
          Number(category_id)
        );
    }


    // -------------------------------------------------
    // SEARCH
    // -------------------------------------------------

    if (
      search &&
      search.trim() !== ""
    ) {

      query =
        query.ilike(
          "name",
          `%${search.trim()}%`
        );
    }


    // -------------------------------------------------
    // ACTIVE
    // -------------------------------------------------

    if (is_active !== undefined) {

      if (
        is_active === "true" ||
        is_active === "false"
      ) {

        query =
          query.eq(
            "is_active",
            is_active === "true"
          );
      }
    }


    // -------------------------------------------------
    // VEG
    // -------------------------------------------------

    if (is_veg !== undefined) {

      if (
        is_veg === "true" ||
        is_veg === "false"
      ) {

        query =
          query.eq(
            "is_veg",
            is_veg === "true"
          );
      }
    }


    // -------------------------------------------------
    // BEST SELLER
    // -------------------------------------------------

    if (is_best_seller !== undefined) {

      if (
        is_best_seller === "true" ||
        is_best_seller === "false"
      ) {

        query =
          query.eq(
            "is_best_seller",
            is_best_seller === "true"
          );
      }
    }


    // -------------------------------------------------
    // SPICY
    // -------------------------------------------------

    if (is_spicy !== undefined) {

      if (
        is_spicy === "true" ||
        is_spicy === "false"
      ) {

        query =
          query.eq(
            "is_spicy",
            is_spicy === "true"
          );
      }
    }


    // -------------------------------------------------
    // EXECUTE
    // -------------------------------------------------

    const {
      data,
      error,
      count
    } =
      await query
        .order(
          "created_at",
          {
            ascending: false
          }
        )
        .range(
          from,
          to
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
// GET FOOD BY ID
// =====================================================

export const getFoodById = async (
  req,
  res,
  next
) => {

  try {

    const id =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(id)
    ) {

      return errorResponse(
        res,
        "Invalid food id",
        400
      );
    }


    const {
      data,
      error
    } =
      await supabase
        .from("foods")
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
        "Food item not found",
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