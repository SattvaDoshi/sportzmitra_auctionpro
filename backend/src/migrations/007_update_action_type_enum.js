module.exports = {
  up: async (pool) => {
    // Modify the action_type enum to include 'PLAYER_CORRECTION'
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
