const mysql = require("mysql2/promise");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  console.log("DB CONFIG:", {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || "3306",
    user: process.env.DB_USER || "root",
    database: process.env.DB_NAME || "sportzmitra_auction",
  });
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "sportzmitra@123",
  database: process.env.DB_NAME || "sportzmitra_auction",
  waitForConnections: true,
  // 40 total: 4 PM2 workers × 10 connections each.
  // Stays well under MySQL's default max_connections=151.
  connectionLimit: Number(process.env.DB_POOL_LIMIT || 40),
  queueLimit: 100,          // queue up to 100 requests before erroring
  connectTimeout: 10_000,   // 10s to establish connection
  enableKeepAlive: true,
  keepAliveInitialDelay: 30_000, // 30s before first keepalive probe
  decimalNumbers: true,
});

module.exports = pool;
