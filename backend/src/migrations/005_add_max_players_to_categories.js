module.exports = {
  up: async (pool) => {
    try {
      console.log("Adding max_players_per_team to auction_categories table...");
      await pool.query(`
        ALTER TABLE auction_categories 
        ADD COLUMN max_players_per_team INT DEFAULT 0 AFTER bid_increment;
      `);
      console.log("Column added successfully.");
    } catch (error) {
      // ER_DUP_FIELDNAME (1060) means the column already exists
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log("Column already exists, skipping.");
      } else {
        throw error;
      }
    }
  }
};
