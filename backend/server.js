require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const connectDB = require("./src/config/database");

// Import routes
const authRoutes = require("./src/routes/authRoutes");
const memberRoutes = require("./src/routes/memberRoutes");
const expenseRoutes = require("./src/routes/expenseRoutes");
const balanceRoutes = require("./src/routes/balanceRoutes");
const settlementRoutes = require("./src/routes/settlements");

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration - Allow all origins
const corsOptions = {
  origin: "*", // Allow all origins
  credentials: false, // Note: credentials must be false when using wildcard origin
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Body parser middleware with size limits
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// Logging middleware
if (NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: "Too many login attempts, please try again later.",
  skipSuccessfulRequests: true,
});

// Apply rate limiting
app.use("/api/", generalLimiter);
app.use("/api/auth/login", authLimiter);

// Connect to MongoDB
connectDB();

// Health check (no auth required)
app.get("/health", (req, res) => {
  const healthcheck = {
    status: "OK",
    uptime: process.uptime(),
    timestamp: Date.now(),
    environment: NODE_ENV,
  };
  res.status(200).json(healthcheck);
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/balances", balanceRoutes);
app.use("/api/settlements", settlementRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Error:", {
    message: err.message,
    stack: NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Don't leak error details in production
  const message =
    NODE_ENV === "production"
      ? "Something went wrong on the server"
      : err.message;

  res.status(err.status || 500).json({
    success: false,
    message,
    ...(NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Start server only if not in test mode or if explicitly required
let server;

if (process.env.NODE_ENV !== "test") {
  server = app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║   CostSplit API Server                ║
║   Environment: ${NODE_ENV.padEnd(23)}║
║   Port: ${PORT.toString().padEnd(30)}║
║   Status: Running                     ║
╚═══════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM signal received: closing HTTP server");
    server.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });
  });

  process.on("unhandledRejection", (err) => {
    console.error("Unhandled Rejection:", err);
    server.close(() => process.exit(1));
  });
}

module.exports = { app, server };
