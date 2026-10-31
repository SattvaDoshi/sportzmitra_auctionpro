module.exports = {
  up: async (pool) => {
    // Convert action_type from restrictive ENUM to VARCHAR(50)
    // to prevent 'Data truncated for column action_type' errors permanently
    // across all environments when player corrections, edits, or new actions are logged.
    await pool.query(`
      ALTER TABLE auction_action_logs 
      MODIFY COLUMN action_type VARCHAR(50) NOT NULL
    `);
  },
  down: async (pool) => {
    await pool.query(`
      ALTER TABLE auction_action_logs 
      MODIFY COLUMN action_type ENUM(
        'AUCTION_CREATED',
        'AUCTION_RESTORED',
        'AUCTION_INACTIVATED',
        'PLAYER_SELECTED',
        'BID_PLACED',
        'PLAYER_SOLD',
        'PLAYER_UNSOLD',
        'PLAYER_FINAL_UNSOLD',
        'UNDO',
        'AUCTION_PAUSED',
        'AUCTION_COMPLETED',
        'PLAYER_CORRECTION'
      ) NOT NULL
    `);
  }
};

