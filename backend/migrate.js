const fs = require('fs');
const path = require('path');
const pool = require('./src/config/db');

const MIGRATIONS_DIR = path.join(__dirname, 'src', 'migrations');

async function runMigrations() {
  try {
    // 1. Ensure migrations table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Read all files in migrations directory
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    }
    
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.js'))
      .sort();

    // 3. Get executed migrations
    const [rows] = await pool.query('SELECT name FROM migrations');
    const executedMigrations = rows.map(r => r.name);

    // 4. Run pending migrations
    let pendingCount = 0;
    for (const file of files) {
      if (!executedMigrations.includes(file)) {
        console.log(`Running migration: ${file}`);
        const migrationPath = path.join(MIGRATIONS_DIR, file);
        const migration = require(migrationPath);
        
        try {
          if (typeof migration.up === 'function') {
            await migration.up(pool);
          } else {
            console.warn(`Migration ${file} doesn't export an 'up' function. Skipping execution.`);
            continue;
          }
          
          await pool.query('INSERT INTO migrations (name) VALUES (?)', [file]);
          console.log(`Successfully executed: ${file}`);
          pendingCount++;
        } catch (err) {
          console.error(`Failed to execute migration: ${file}`);
          throw err;
        }
      }
    }

    if (pendingCount === 0) {
      console.log('No pending migrations.');
    } else {
      console.log(`Successfully applied ${pendingCount} migration(s).`);
    }

  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
