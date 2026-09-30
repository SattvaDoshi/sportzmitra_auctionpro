module.exports = {
  up: async (pool) => {
    console.log("Adding serial_number to players...");
    try {
      await pool.query("ALTER TABLE players ADD COLUMN serial_number VARCHAR(50) DEFAULT NULL AFTER org_player_id");
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
      console.log("serial_number already exists in players table, skipping...");
    }

    console.log("Adding serial_number to org_players...");
    try {
      await pool.query("ALTER TABLE org_players ADD COLUMN serial_number VARCHAR(50) DEFAULT NULL AFTER organization_id");
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
      console.log("serial_number already exists in org_players table, skipping...");
    }

    const spSql = `
      DROP PROCEDURE IF EXISTS \`sp_get_public_auction_snapshot\`;
      CREATE PROCEDURE \`sp_get_public_auction_snapshot\`(IN p_auction_id BIGINT)
      BEGIN
        -- 0. Auction details
        SELECT a.*, o.organization_name 
        FROM auctions a 
        LEFT JOIN organizations o ON a.organization_id = o.id 
        WHERE a.id = p_auction_id;
        
        -- 1. State details (with current player and highest bidder team info)
        SELECT s.*, 
               p.serial_number, p.player_name, p.category, p.player_role, p.base_price, p.photo_url, p.age, p.batting_style, p.bowling_style,
               t.team_name AS highest_team_name
        FROM auction_state s
        LEFT JOIN players p ON s.current_player_id = p.id
        LEFT JOIN teams t ON s.highest_team_id = t.id
        WHERE s.auction_id = p_auction_id;

        -- 2. Teams (used for teams and teamsSummary)
        SELECT id, team_name, owner_name, logo_url, total_purse, remaining_purse, (total_purse - remaining_purse) AS used_amount 
        FROM teams 
        WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0;

        -- 3. Sold Players
        SELECT p.*, t.team_name as sold_team_name 
        FROM players p 
        LEFT JOIN teams t ON p.sold_team_id = t.id 
        WHERE p.auction_id = p_auction_id AND p.status = 'SOLD' AND COALESCE(p.is_deleted, 0) = 0;

        -- 4. Upcoming Players
        SELECT p.* FROM players p WHERE p.auction_id = p_auction_id AND p.status = 'AVAILABLE' AND COALESCE(p.is_deleted, 0) = 0;

        -- 5. Pending Players (AVAILABLE, IN_AUCTION)
        SELECT p.* FROM players p WHERE p.auction_id = p_auction_id AND p.status IN ('AVAILABLE', 'IN_AUCTION') AND COALESCE(p.is_deleted, 0) = 0;

        -- 6. Category Summary
        SELECT category, COUNT(*) as total, SUM(status='SOLD') as sold, SUM(status='UNSOLD') as unsold, SUM(status IN ('AVAILABLE', 'IN_AUCTION')) as pending 
        FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0 
        GROUP BY category;

        -- 7. Dashboard Summary
        SELECT 
          (SELECT COUNT(*) FROM teams WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as total_teams,
          (SELECT COUNT(*) FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as total_players,
          (SELECT SUM(status='SOLD') FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as sold_players;
      END;
    `;

    // Ensure the connection supports multiple statements if we're executing this block
    // We split them since create procedure must be run distinctly or with multipleStatements enabled
    console.log("Updating sp_get_public_auction_snapshot to include serial_number...");
    
    // Some drivers might fail to run DROP and CREATE together. Let's do it safely:
    await pool.query("DROP PROCEDURE IF EXISTS `sp_get_public_auction_snapshot`");
    
    const createSpSql = `
      CREATE PROCEDURE \`sp_get_public_auction_snapshot\`(IN p_auction_id BIGINT)
      BEGIN
        SELECT a.*, o.organization_name 
        FROM auctions a 
        LEFT JOIN organizations o ON a.organization_id = o.id 
        WHERE a.id = p_auction_id;
        
        SELECT s.*, 
               p.serial_number, p.player_name, p.category, p.player_role, p.base_price, p.photo_url, p.age, p.batting_style, p.bowling_style,
               t.team_name AS highest_team_name
        FROM auction_state s
        LEFT JOIN players p ON s.current_player_id = p.id
        LEFT JOIN teams t ON s.highest_team_id = t.id
        WHERE s.auction_id = p_auction_id;

        SELECT id, team_name, owner_name, logo_url, total_purse, remaining_purse, (total_purse - remaining_purse) AS used_amount 
        FROM teams 
        WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0;

        SELECT p.*, t.team_name as sold_team_name 
        FROM players p 
        LEFT JOIN teams t ON p.sold_team_id = t.id 
        WHERE p.auction_id = p_auction_id AND p.status = 'SOLD' AND COALESCE(p.is_deleted, 0) = 0;

        SELECT p.* FROM players p WHERE p.auction_id = p_auction_id AND p.status = 'AVAILABLE' AND COALESCE(p.is_deleted, 0) = 0;

        SELECT p.* FROM players p WHERE p.auction_id = p_auction_id AND p.status IN ('AVAILABLE', 'IN_AUCTION') AND COALESCE(p.is_deleted, 0) = 0;

        SELECT category, COUNT(*) as total, SUM(status='SOLD') as sold, SUM(status='UNSOLD') as unsold, SUM(status IN ('AVAILABLE', 'IN_AUCTION')) as pending 
        FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0 
        GROUP BY category;

        SELECT 
          (SELECT COUNT(*) FROM teams WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as total_teams,
          (SELECT COUNT(*) FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as total_players,
          (SELECT SUM(status='SOLD') FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as sold_players;
      END
    `;
    await pool.query(createSpSql);
    console.log("Stored Procedure updated successfully.");
  }
};
