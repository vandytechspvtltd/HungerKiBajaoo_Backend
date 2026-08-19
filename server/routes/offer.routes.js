import express from "express";
import { getOffers, getOfferById } from "../controllers/offer.controller.js";

const router = express.Router();

router.get("/", getOffers);
router.get("/:id", getOfferById);

export default router;
