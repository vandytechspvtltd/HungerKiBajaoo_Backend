import express from "express";
import { authenticate } from "../middleware/auth.js";
import { getCoupons, validateCoupon } from "../controllers/coupon.controller.js";

const router = express.Router();

router.use(authenticate);
router.get("/", getCoupons);
router.post("/validate", validateCoupon);

export default router;
