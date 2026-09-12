"use strict";

const express = require("express");
const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const compression = require("compression");
const { Server } = require("socket.io");
const pool = require("./config/db");
const { initSocket } = require("./socket");
const rateLimiter = require("./middleware/rateLimiter");

dotenv.config();

const authRoutes = require("./routes/auth.routes");
const superAdminRoutes = require("./routes/superadmin.routes");
const organizationRoutes = require("./routes/organization.routes");
const auctionRoutes = require("./routes/auction.routes");
const teamRoutes = require("./routes/team.routes");
const playerRoutes = require("./routes/player.routes");
const liveRoutes = require("./routes/live.routes");
const publicRoutes = require("./routes/public.routes");

const isProduction = process.env.NODE_ENV === "production";

const app = express();
const server = http.createServer(app);

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
].filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:")
    ) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: corsOptions,
  // Reduce zombie socket accumulation
  pingTimeout: 20_000,
  pingInterval: 25_000,
  // Compress large socket payloads
  perMessageDeflate: {
    threshold: 2048, // bytes
  },
});

initSocket(io);

// ── Middleware ────────────────────────────────────────────────────────────────
// Gzip all HTTP responses
app.use(compression());

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Request logger — verbose in dev, silent in production
if (!isProduction) {
  app.use((req, _res, next) => {
    console.log("REQUEST:", req.method, req.url);
    next();
  });
}

// ── Health & Root ─────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({ message: "SportzMitra Auction API running" });
});

app.get("/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({
      status: "OK",
      db: rows[0].ok === 1 ? "connected" : "unknown",
      pid: process.pid,
      env: process.env.NODE_ENV || "development",
    });
  } catch (error) {
    res.status(500).json({ status: "ERROR", message: error.message });
  }
});

// ── Rate-limited API routes ───────────────────────────────────────────────────
// Auth — tight limit to block brute-force
app.use("/api/auth", rateLimiter({ max: 10, windowMs: 60_000 }), authRoutes);

// Public viewer endpoints — generous but bounded
app.use(
  "/api/public",
  rateLimiter({ max: 60, windowMs: 60_000 }),
  publicRoutes
);

// Live control — admin only (already JWT-guarded), slightly looser
app.use(
  "/api/live",
  rateLimiter({ max: 120, windowMs: 60_000 }),
  liveRoutes
);

// Other internal routes — no public-facing rate limit needed
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/auctions", auctionRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/players", playerRoutes);

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  if (!isProduction) console.error("Unhandled error:", err);
  res.status(500).json({ message: err.message || "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(
    `[PID ${process.pid}] SportzMitra Auction API running on port ${PORT} (${process.env.NODE_ENV || "development"})`
  );
});
