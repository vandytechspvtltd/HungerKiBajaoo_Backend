import express from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import { getDeliveryOrders, updateDeliveryOrderStatus } from "../controllers/delivery.controller.js";

const router = express.Router();

router.use(authenticate);
router.use(requireRole("delivery_partner"));
router.get("/orders", getDeliveryOrders);
router.patch("/orders/:id/status", updateDeliveryOrderStatus);

export default router;
