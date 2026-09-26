const pool = require('../config/db');

async function up() {
  const promisePool = pool.promise();

  // Check if player_limit column exists in teams table
  const [columns] = await promisePool.query(`
    SELECT COUNT(*) as count 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE table_schema = DATABASE() 
    AND table_name = 'teams' 
    AND column_name = 'player_limit'
  `);

  if (columns[0].count === 0) {
    console.log('Adding player_limit column to teams table...');
    await promisePool.query(`
      ALTER TABLE teams 
      ADD COLUMN player_limit INT DEFAULT NULL AFTER remaining_purse
    `);
    console.log('player_limit column added to teams table successfully.');
  } else {
    console.log('player_limit column already exists in teams table.');
  }
}

async function down() {
  const promisePool = pool.promise();

  // Check if player_limit column exists
  const [columns] = await promisePool.query(`
    SELECT COUNT(*) as count 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE table_schema = DATABASE() 
    AND table_name = 'teams' 
    AND column_name = 'player_limit'
  `);

  if (columns[0].count > 0) {
    console.log('Removing player_limit column from teams table...');
    await promisePool.query(`
      ALTER TABLE teams 
      DROP COLUMN player_limit
    `);
    console.log('player_limit column removed from teams table successfully.');
  }
}

module.exports = { up, down };
