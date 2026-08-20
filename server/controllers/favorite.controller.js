import { supabase } from "../config/supabase.js";
import {
  successResponse,
  errorResponse
} from "../utils/response.js";


// ======================================================
// RESTAURANT SELECT
// ======================================================

const RESTAURANT_SELECT = `
  id,
  name,
  tagline,
  cuisines,
  rating,
  review_count,
  delivery_time_range,
  distance_km,
  cost_for_two,
  location_area,
  discount_tag,
  social_pledge_text,
  image_url,
  is_active,
  created_at,
  is_open
`;


// ======================================================
// MAP RESTAURANT FOR ANDROID RESPONSE
// ======================================================

const mapRestaurant = (
  restaurant
) => {

  if (!restaurant) {
    return null;
  }

  return {
    id:
      restaurant.id ?? null,

    name:
      restaurant.name ?? null,

    image:
      restaurant.image_url ?? null,

    category:
      restaurant.location_area ??
      null,

    rating:
      restaurant.rating ?? null,

    delivery_time:
      restaurant.delivery_time_range ??
      null,

    delivery_fee:
      null,

    is_open:
      restaurant.is_open ??
      null,

    created_at:
      restaurant.created_at ??
      null
  };
};


// ======================================================
// GET FAVORITES
// ======================================================

export const getFavorites = async (
  req,
  res,
  next
) => {

  try {

    const userId =
      req.user.id;


    // ==================================================
    // 1. GET FAVORITES
    // ==================================================

    const {
      data: favorites,
      error: favoritesError
    } = await supabase
      .from("favorites")
      .select(`
        id,
        user_id,
        restaurant_id,
        created_at
      `)
      .eq(
        "user_id",
        userId
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      );


    if (
      favoritesError
    ) {

      console.error(
        "GET FAVORITES ERROR:",
        favoritesError
      );

      return errorResponse(
        res,
        favoritesError.message,
        400
      );
    }


    if (
      !favorites ||
      favorites.length === 0
    ) {

      return successResponse(
        res,
        []
      );
    }


    // ==================================================
    // 2. GET UNIQUE RESTAURANT IDS
    // ==================================================

    const restaurantIds = [
      ...new Set(
        favorites
          .map(
            favorite =>
              favorite.restaurant_id
          )
          .filter(
            id =>
              Number.isInteger(
                Number(id)
              )
          )
          .map(
            Number
          )
      )
    ];


    if (
      restaurantIds.length === 0
    ) {

      return successResponse(
        res,
        favorites.map(
          favorite => ({
            ...favorite,
            restaurants: null
          })
        )
      );
    }


    // ==================================================
    // 3. GET RESTAURANTS
    // ==================================================

    const {
      data: restaurants,
      error: restaurantsError
    } = await supabase
      .from("restaurants")
      .select(
        RESTAURANT_SELECT
      )
      .in(
        "id",
        restaurantIds
      );


    if (
      restaurantsError
    ) {

      console.error(
        "GET FAVORITE RESTAURANTS ERROR:",
        restaurantsError
      );

      return errorResponse(
        res,
        restaurantsError.message,
        400
      );
    }


    // ==================================================
    // 4. MAP RESTAURANTS
    // ==================================================

    const restaurantMap =
      new Map(
        (restaurants || []).map(
          restaurant => [
            restaurant.id,
            mapRestaurant(
              restaurant
            )
          ]
        )
      );


    // ==================================================
    // 5. COMBINE FAVORITES + RESTAURANTS
    // ==================================================

    const result =
      favorites.map(
        favorite => ({

          ...favorite,

          restaurants:
            restaurantMap.get(
              favorite.restaurant_id
            ) || null
        })
      );


    return successResponse(
      res,
      result
    );


  } catch (err) {

    console.error(
      "GET FAVORITES EXCEPTION:",
      err
    );

    next(err);
  }
};


// ======================================================
// ADD FAVORITE
// ======================================================

export const addFavorite = async (
  req,
  res,
  next
) => {

  try {

    const userId =
      req.user.id;

    const restaurantId =
      Number(
        req.params.restaurantId
      );


    // ==================================================
    // VALIDATE ID
    // ==================================================

    if (
      !Number.isInteger(
        restaurantId
      ) ||
      restaurantId <= 0
    ) {

      return errorResponse(
        res,
        "Invalid restaurant ID",
        400
      );
    }


    // ==================================================
    // CHECK RESTAURANT
    // ==================================================

    const {
      data: restaurant,
      error: restaurantError
    } = await supabase
      .from("restaurants")
      .select(
        RESTAURANT_SELECT
      )
      .eq(
        "id",
        restaurantId
      )
      .maybeSingle();


    if (
      restaurantError
    ) {

      console.error(
        "CHECK RESTAURANT ERROR:",
        restaurantError
      );

      return errorResponse(
        res,
        restaurantError.message,
        400
      );
    }


    if (
      !restaurant
    ) {

      return errorResponse(
        res,
        "Restaurant not found",
        404
      );
    }


    // ==================================================
    // CHECK EXISTING FAVORITE
    // ==================================================

    const {
      data: existing,
      error: existingError
    } = await supabase
      .from("favorites")
      .select(
        "id, user_id, restaurant_id, created_at"
      )
      .eq(
        "user_id",
        userId
      )
      .eq(
        "restaurant_id",
        restaurantId
      )
      .maybeSingle();


    if (
      existingError
    ) {

      console.error(
        "CHECK FAVORITE ERROR:",
        existingError
      );

      return errorResponse(
        res,
        existingError.message,
        400
      );
    }


    if (
      existing
    ) {

      return errorResponse(
        res,
        "Restaurant already favorited",
        400
      );
    }


    // ==================================================
    // INSERT FAVORITE
    // ==================================================

    const {
      data,
      error
    } = await supabase
      .from("favorites")
      .insert([
        {
          user_id:
            userId,

          restaurant_id:
            restaurantId
        }
      ])
      .select(`
        id,
        user_id,
        restaurant_id,
        created_at
      `)
      .single();


    if (
      error
    ) {

      console.error(
        "ADD FAVORITE ERROR:",
        error
      );

      return errorResponse(
        res,
        error.message,
        400
      );
    }


    // ==================================================
    // RETURN FAVORITE + RESTAURANT
    // ==================================================

    return successResponse(
      res,
      {
        ...data,

        restaurants:
          mapRestaurant(
            restaurant
          )
      },
      201
    );


  } catch (err) {

    console.error(
      "ADD FAVORITE EXCEPTION:",
      err
    );

    next(err);
  }
};


// ======================================================
// REMOVE FAVORITE
// ======================================================

export const removeFavorite = async (
  req,
  res,
  next
) => {

  try {

    const userId =
      req.user.id;

    const restaurantId =
      Number(
        req.params.restaurantId
      );


    // ==================================================
    // VALIDATE ID
    // ==================================================

    if (
      !Number.isInteger(
        restaurantId
      ) ||
      restaurantId <= 0
    ) {

      return errorResponse(
        res,
        "Invalid restaurant ID",
        400
      );
    }


    // ==================================================
    // DELETE
    // ==================================================

    const {
      data,
      error
    } = await supabase
      .from("favorites")
      .delete()
      .eq(
        "user_id",
        userId
      )
      .eq(
        "restaurant_id",
        restaurantId
      )
      .select(`
        id,
        user_id,
        restaurant_id,
        created_at
      `);


    if (
      error
    ) {

      console.error(
        "REMOVE FAVORITE ERROR:",
        error
      );

      return errorResponse(
        res,
        error.message,
        400
      );
    }


    const removed =
      (data || []).length > 0;


    return successResponse(
      res,
      {
        removed,

        restaurant_id:
          restaurantId
      }
    );


  } catch (err) {

    console.error(
      "REMOVE FAVORITE EXCEPTION:",
      err
    );

    next(err);
  }
};