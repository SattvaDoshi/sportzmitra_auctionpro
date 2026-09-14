module.exports = {
  up: async (pool) => {
    try {
      console.log("Adding min_players_per_team and max_players_per_team to auctions table...");
      await pool.query(`
        ALTER TABLE auctions 
        ADD COLUMN min_players_per_team INT DEFAULT 0 AFTER total_purse_per_team,
        ADD COLUMN max_players_per_team INT DEFAULT 0 AFTER min_players_per_team;
      `);
      console.log("Columns added successfully.");
    } catch (error) {
      // ER_DUP_FIELDNAME (1060) means the column already exists
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log("Columns already exist, skipping.");
      } else {
        throw error;
      }
    }
  }
};
