import express from "express";

import {
    sendOtp,
    verifyOtp,
    deleteAccount
} from "../controllers/auth.controller.js";

import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Send OTP
router.post("/send-otp", sendOtp);

// Verify OTP
router.post("/verify-otp", verifyOtp);

// Delete Account
router.delete(
    "/delete-account",
    authenticate,
    deleteAccount
);

export default router;