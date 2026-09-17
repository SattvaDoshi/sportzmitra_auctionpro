const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

async function createTable() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "sportzmitra_auction",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS auction_config_audit_logs (
        id BIGINT NOT NULL AUTO_INCREMENT,
        auction_id BIGINT NOT NULL,
        changed_by_user_id BIGINT DEFAULT NULL,
        change_type VARCHAR(50) NOT NULL,
        field_name VARCHAR(100) NOT NULL,
        old_value TEXT,
        new_value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_audit_auction (auction_id),
        CONSTRAINT fk_audit_auction FOREIGN KEY (auction_id) REFERENCES auctions (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    console.log("Executing query...");
    await pool.query(createTableQuery);
    console.log("Table created successfully.");
  } catch (error) {
    console.error("Error creating table:", error);
  } finally {
    await pool.end();
  }
}

createTable();
