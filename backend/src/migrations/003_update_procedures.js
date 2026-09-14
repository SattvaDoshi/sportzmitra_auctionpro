const fs = require("fs");
const path = require("path");

module.exports = {
  up: async (pool) => {
    const sqlPath = path.join(__dirname, "../../../database/sp_live_auction_procedures.sql");
    if (!fs.existsSync(sqlPath)) {
      console.warn("sp_live_auction_procedures.sql not found, skipping migration.");
      return;
    }
    
    const sql = fs.readFileSync(sqlPath, "utf8");
    
    // Remove DELIMITER statements entirely
    const cleanSql = sql
      .replace(/DELIMITER\s+\$\$/gi, '')
      .replace(/DELIMITER\s+;/gi, '');
      
    // Split by $$ (the procedure delimiter)
    const blocks = cleanSql.split('$$');
    
    // The first block contains ALTER TABLE and other standard queries separated by ;
    const initialStatements = blocks[0].split(';').filter(s => s.trim().length > 0);
    
    console.log("Executing initial statements (ALTER TABLEs)...");
    for (const stmt of initialStatements) {
      await pool.query(stmt);
    }
    
    console.log("Executing procedures...");
    // The remaining blocks are individual stored procedures
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i].trim().length > 0) {
        await pool.query(blocks[i]);
      }
    }
    
    console.log("Procedures updated successfully.");
  }
};
