import express from "express";
import { authenticate } from "../middleware/auth.js";
import { getAddresses, createAddress, updateAddress, deleteAddress } from "../controllers/address.controller.js";

const router = express.Router();

router.use(authenticate);
router.get("/", getAddresses);
router.post("/", createAddress);
router.patch("/:id", updateAddress);
router.delete("/:id", deleteAddress);

export default router;
