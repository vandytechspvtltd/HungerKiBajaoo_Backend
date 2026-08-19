import express from "express";
import { authenticate } from "../middleware/auth.js";
import { getFavorites, addFavorite, removeFavorite } from "../controllers/favorite.controller.js";

const router = express.Router();

router.use(authenticate);
router.get("/", getFavorites);
router.post("/:restaurantId", addFavorite);
router.delete("/:restaurantId", removeFavorite);

export default router;
