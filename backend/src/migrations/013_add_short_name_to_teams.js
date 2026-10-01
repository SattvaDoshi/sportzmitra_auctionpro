module.exports = {
  up: async (pool) => {
    try {
      await pool.query(`ALTER TABLE teams ADD COLUMN short_name VARCHAR(100) DEFAULT NULL AFTER team_name`);
      console.log("Added short_name to teams table.");
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log("Column short_name already exists, skipping.");
      } else {
        throw err;
      }
    }

    try {
      await pool.query(`ALTER TABLE teams ADD COLUMN team_whatsapp_group_link VARCHAR(255) DEFAULT NULL`);
      console.log("Added team_whatsapp_group_link to teams table.");
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log("Column team_whatsapp_group_link already exists, skipping.");
      } else {
        throw err;
      }
    }
  }
};
