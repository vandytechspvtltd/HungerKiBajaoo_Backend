import express from "express";
import { authenticate } from "../middleware/auth.js";
import { getRestaurants, getRestaurantById, getRestaurantMenu } from "../controllers/restaurant.controller.js";

const router = express.Router();

router.get("/", getRestaurants);
router.get("/:id", getRestaurantById);
router.get("/:id/menu", getRestaurantMenu);

export default router;
