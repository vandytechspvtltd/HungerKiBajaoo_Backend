import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.routes.js";
import authDevRoutes from "./routes/auth.dev.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import restaurantRoutes from "./routes/restaurant.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import foodRoutes from "./routes/food.routes.js";
import favoriteRoutes from "./routes/favorite.routes.js";
import addressRoutes from "./routes/address.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import orderRoutes from "./routes/order.routes.js";
import couponRoutes from "./routes/coupon.routes.js";
import offerRoutes from "./routes/offer.routes.js";
import deliveryRoutes from "./routes/delivery.routes.js";
import { swaggerUiSetup } from "./swagger.js";
import bannerRoutes from "./routes/banner.routes.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());

// CORS configuration for development: reflect request origin and allow credentials
const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl)
    callback(null, true);
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(morgan("combined"));

// Request debug logging for troubleshooting Swagger/browser requests
app.use((req, res, next) => {
  console.log(`REQ: ${req.method} ${req.originalUrl} Origin=${req.headers.origin || "-"} Auth=${req.headers.authorization ? "present" : "missing"}`);
  next();
});

swaggerUiSetup(app);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "HungerKiBajaoo API is running" });
});

app.use("/api/auth", authLimiter, authRoutes);
// if (process.env.NODE_ENV !== "production") {
  app.use("/api/auth", authLimiter, authDevRoutes);
// }
app.use("/api/profile", profileRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/foods", foodRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/banners", bannerRoutes);
app.use(errorHandler);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "HungerKiBajaoo API is running",
    docs: "/api-docs",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
