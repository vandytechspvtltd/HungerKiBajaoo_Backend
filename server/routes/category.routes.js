import express from "express";
import { getCategories, getCategoryFoods } from "../controllers/category.controller.js";

const router = express.Router();

router.get("/", getCategories);
router.get("/:id/foods", getCategoryFoods);

export default router;
