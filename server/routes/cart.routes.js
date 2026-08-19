import express from "express";
import { authenticate } from "../middleware/auth.js";
import { getCart, addCartItem, updateCartItem, deleteCartItem, clearCart } from "../controllers/cart.controller.js";

const router = express.Router();

router.use(authenticate);
router.get("/", getCart);
router.post("/items", addCartItem);
router.patch("/items/:id", updateCartItem);
router.delete("/items/:id", deleteCartItem);
router.delete("/", clearCart);

export default router;
