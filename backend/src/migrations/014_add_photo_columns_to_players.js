const pool = require('../config/db');

async function up(pool) {
  // Check if original_photo_url column exists in players table
  const [columns] = await pool.query(`
    SELECT COUNT(*) as count 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE table_schema = DATABASE() 
    AND table_name = 'players' 
    AND column_name = 'original_photo_url'
  `);

  if (columns[0].count === 0) {
    console.log('Adding photo columns to players table...');
    await pool.query(`
      ALTER TABLE players 
      ADD COLUMN original_photo_url VARCHAR(500) DEFAULT NULL AFTER photo_url,
      ADD COLUMN photo_processing_status VARCHAR(50) DEFAULT NULL AFTER original_photo_url,
      ADD COLUMN photo_processing_mode VARCHAR(80) DEFAULT NULL AFTER photo_processing_status
    `);
    console.log('photo columns added to players table successfully.');
  } else {
    console.log('photo columns already exist in players table.');
  }
}

async function down(pool) {
  // Check if original_photo_url column exists
  const [columns] = await pool.query(`
    SELECT COUNT(*) as count 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE table_schema = DATABASE() 
    AND table_name = 'players' 
    AND column_name = 'original_photo_url'
  `);

  if (columns[0].count > 0) {
    console.log('Removing photo columns from players table...');
    await pool.query(`
      ALTER TABLE players 
      DROP COLUMN original_photo_url,
      DROP COLUMN photo_processing_status,
      DROP COLUMN photo_processing_mode
    `);
    console.log('photo columns removed from players table successfully.');
  }
}

module.exports = { up, down };
