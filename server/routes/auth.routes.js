import express from "express";
import { register, login, refreshToken, me, logout, deleteAccount } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh-token", refreshToken);
router.get("/me", authenticate, me);
router.post("/logout", authenticate, logout);
router.delete("/account", authenticate, deleteAccount);

export default router;
