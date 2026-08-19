import express from "express";
import { authenticate } from "../middleware/auth.js";
import { createOrder, getOrders, getOrderById, cancelOrder } from "../controllers/order.controller.js";

const router = express.Router();

router.use(authenticate);
router.post("/", createOrder);
router.get("/", getOrders);
router.get("/:id", getOrderById);
router.post("/:id/cancel", cancelOrder);

export default router;
