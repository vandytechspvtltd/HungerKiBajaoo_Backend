import express from "express";
import { authenticate } from "../middleware/auth.js";
import { getProfile, updateProfile } from "../controllers/profile.controller.js";

const router = express.Router();

router.use(authenticate);
router.get("/", getProfile);
router.patch("/", updateProfile);

export default router;
