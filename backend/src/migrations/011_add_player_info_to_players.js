const pool = require('../config/db');

async function up(pool) {
  // Check if player_info column exists in players table
  const [columns] = await pool.query(`
    SELECT COUNT(*) as count 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE table_schema = DATABASE() 
    AND table_name = 'players' 
    AND column_name = 'player_info'
  `);

  if (columns[0].count === 0) {
    console.log('Adding player_info column to players table...');
    await pool.query(`
      ALTER TABLE players 
      ADD COLUMN player_info TEXT DEFAULT NULL AFTER previous_team
    `);
    console.log('player_info column added to players table successfully.');
  } else {
    console.log('player_info column already exists in players table.');
  }
}

async function down(pool) {
  // Check if player_info column exists
  const [columns] = await pool.query(`
    SELECT COUNT(*) as count 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE table_schema = DATABASE() 
    AND table_name = 'players' 
    AND column_name = 'player_info'
  `);

  if (columns[0].count > 0) {
    console.log('Removing player_info column from players table...');
    await pool.query(`
      ALTER TABLE players 
      DROP COLUMN player_info
    `);
    console.log('player_info column removed from players table successfully.');
  }
}

module.exports = { up, down };
