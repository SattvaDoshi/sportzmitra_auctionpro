const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

async function updateProcedures() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "sportzmitra_auction",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true,
  });

  try {
    const sql = fs.readFileSync(path.join(__dirname, "../database/sp_live_auction_procedures.sql"), "utf8");
    
    // We need to change delimiter $$ back to ; for the node mysql connection since it doesn't support custom delimiters natively this way, or we just split by $$ and execute one by one.
    const statements = sql.split("$$").filter(s => s.trim().length > 0);
    
    console.log("Executing procedures...");
    for (const stmt of statements) {
      if (stmt.trim().startsWith("DELIMITER")) continue;
      await pool.query(stmt);
    }
    
    console.log("Procedures updated successfully.");
  } catch (error) {
    console.error("Error updating procedures:", error);
  } finally {
    await pool.end();
  }
}

updateProcedures();
