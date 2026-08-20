import { supabase } from "../config/supabase.js";
import {
  successResponse,
  errorResponse
} from "../utils/response.js";


// =====================================================
// GET ALL RESTAURANTS
// =====================================================

export const getRestaurants = async (req, res, next) => {
  try {
    const {
      search,
      category,
      is_open,
      page = 1,
      limit = 20
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);

    const limitNumber = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const from = (pageNumber - 1) * limitNumber;
    const to = from + limitNumber - 1;

    let query = supabase
      .from("restaurants")
      .select("*", { count: "exact" });

    // Search
    if (search && search.trim() !== "") {
      query = query.ilike(
        "name",
        `%${search.trim()}%`
      );
    }

    // Category
    // restaurants table me "category" column nahi hai.
    // cuisines ARRAY hai.
    if (category && category.trim() !== "") {
      query = query.contains(
        "cuisines",
        [category.trim()]
      );
    }

    // Open / Closed
    if (is_open !== undefined) {
      if (is_open === "true") {
        query = query.eq("is_open", true);
      } else if (is_open === "false") {
        query = query.eq("is_open", false);
      }
    }

    const {
      data,
      error,
      count
    } = await query
      .order("created_at", {
        ascending: false
      })
      .range(from, to);

    if (error) {
      return errorResponse(
        res,
        error.message,
        400
      );
    }

    // Convert Supabase DB fields
    // to Android API response fields
    const restaurants = (data || []).map(
      (restaurant) => ({
        id: restaurant.id,

        name: restaurant.name,

        tagline:
          restaurant.tagline || "",

        rating:
          Number(restaurant.rating || 0),

        reviewCount:
          restaurant.review_count ||
          "0 reviews",

        deliveryTimeRange:
          restaurant.delivery_time_range ||
          "20-30 min",

        distanceKm:
          restaurant.distance_km ||
          "2 km",

        costForTwo:
          restaurant.cost_for_two ||
          "₹400 for two",

        locationArea:
          restaurant.location_area ||
          "Nearby",

        discountTag:
          restaurant.discount_tag ||
          "Special Offer",

        socialPledgeText:
          restaurant.social_pledge_text ||
          "Supporting Zero Hunger",

        image:
          restaurant.image_url || "",

        category:
          restaurant.cuisines?.[0] ||
          "Food",

        is_open:
          restaurant.is_open ?? true,

        cuisines:
          restaurant.cuisines || [],

        isVegOnly: false,

        offer:
          restaurant.discount_tag || ""
      })
    );

    return successResponse(
      res,
      restaurants
    );

  } catch (err) {
    next(err);
  }
};


// =====================================================
// GET RESTAURANT BY ID
// =====================================================

export const getRestaurantById = async (
  req,
  res,
  next
) => {
  try {
    const id = Number(req.params.id);

    const {
      data,
      error
    } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return errorResponse(
        res,
        "Restaurant not found",
        404
      );
    }

    const restaurant = {
      id: data.id,

      name: data.name,

      tagline:
        data.tagline || "",

      rating:
        Number(data.rating || 0),

      reviewCount:
        data.review_count ||
        "0 reviews",

      deliveryTimeRange:
        data.delivery_time_range ||
        "20-30 min",

      distanceKm:
        data.distance_km ||
        "2 km",

      costForTwo:
        data.cost_for_two ||
        "₹400 for two",

      locationArea:
        data.location_area ||
        "Nearby",

      discountTag:
        data.discount_tag ||
        "Special Offer",

      socialPledgeText:
        data.social_pledge_text ||
        "Supporting Zero Hunger",

      image:
        data.image_url || "",

      category:
        data.cuisines?.[0] ||
        "Food",

      is_open:
        data.is_open ?? true,

      cuisines:
        data.cuisines || [],

      isVegOnly: false,

      offer:
        data.discount_tag || ""
    };

    return successResponse(
      res,
      restaurant
    );

  } catch (err) {
    next(err);
  }
};


// =====================================================
// GET RESTAURANT MENU
// =====================================================

export const getRestaurantMenu = async (
  req,
  res,
  next
) => {
  try {
    const id = Number(req.params.id);

    // Restaurant
    const {
      data: restaurantData,
      error: restaurantError
    } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", id)
      .single();

    if (
      restaurantError ||
      !restaurantData
    ) {
      return errorResponse(
        res,
        "Restaurant not found",
        404
      );
    }

    // Foods
    const {
      data: foods,
      error: foodsError
    } = await supabase
      .from("foods")
      .select("*")
      .eq("restaurant_id", id)
      .order("created_at", {
        ascending: true
      });

    if (foodsError) {
      return errorResponse(
        res,
        foodsError.message,
        400
      );
    }

    const restaurant = {
      id: restaurantData.id,

      name: restaurantData.name,

      tagline:
        restaurantData.tagline || "",

      rating:
        Number(
          restaurantData.rating || 0
        ),

      reviewCount:
        restaurantData.review_count ||
        "0 reviews",

      deliveryTimeRange:
        restaurantData.delivery_time_range ||
        "20-30 min",

      distanceKm:
        restaurantData.distance_km ||
        "2 km",

      costForTwo:
        restaurantData.cost_for_two ||
        "₹400 for two",

      locationArea:
        restaurantData.location_area ||
        "Nearby",

      discountTag:
        restaurantData.discount_tag ||
        "Special Offer",

      socialPledgeText:
        restaurantData.social_pledge_text ||
        "Supporting Zero Hunger",

      image:
        restaurantData.image_url || "",

      category:
        restaurantData.cuisines?.[0] ||
        "Food",

      is_open:
        restaurantData.is_open ?? true,

      cuisines:
        restaurantData.cuisines || [],

      isVegOnly: false,

      offer:
        restaurantData.discount_tag || ""
    };

    return successResponse(
      res,
      {
        restaurant,
        foods
      }
    );

  } catch (err) {
    next(err);
  }
};