const pool = require('../config/db');

async function up(pool) {
  console.log('Updating sp_get_public_auction_snapshot procedure...');
  
  await pool.query(`DROP PROCEDURE IF EXISTS \`sp_get_public_auction_snapshot\``);
  
  await pool.query(`
    CREATE PROCEDURE \`sp_get_public_auction_snapshot\`(IN p_auction_id BIGINT)
    BEGIN
      -- 0. Auction details
      SELECT a.*, o.organization_name 
      FROM auctions a 
      LEFT JOIN organizations o ON a.organization_id = o.id 
      WHERE a.id = p_auction_id;
      
      -- 1. State details (with current player and highest bidder team info)
      SELECT s.*, 
             p.player_name, p.category, p.player_role, p.base_price, p.photo_url, p.age, p.area, p.batting_style, p.bowling_style, p.player_info, p.serial_number,
             t.team_name AS highest_team_name
      FROM auction_state s
      LEFT JOIN players p ON s.current_player_id = p.id
      LEFT JOIN teams t ON s.highest_team_id = t.id
      WHERE s.auction_id = p_auction_id;

      -- 2. Teams (used for teams and teamsSummary)
      SELECT 
        t.id, 
        t.team_name, 
        t.owner_name, 
        t.logo_url, 
        (t.remaining_purse + COALESCE((SELECT SUM(sold_price) FROM players WHERE sold_team_id = t.id AND status = 'SOLD' AND COALESCE(is_deleted, 0) = 0), 0)) AS total_purse, 
        t.remaining_purse, 
        COALESCE((SELECT SUM(sold_price) FROM players WHERE sold_team_id = t.id AND status = 'SOLD' AND COALESCE(is_deleted, 0) = 0), 0) AS used_amount 
      FROM teams t
      WHERE t.auction_id = p_auction_id AND COALESCE(t.is_deleted, 0) = 0;

      -- 3. Sold Players
      SELECT p.*, t.team_name as sold_team_name 
      FROM players p 
      LEFT JOIN teams t ON p.sold_team_id = t.id 
      WHERE p.auction_id = p_auction_id AND p.status = 'SOLD' AND COALESCE(p.is_deleted, 0) = 0;

      -- 4. Unsold Players
      SELECT p.* FROM players p WHERE p.auction_id = p_auction_id AND p.status = 'UNSOLD' AND COALESCE(p.is_deleted, 0) = 0;

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
        (SELECT COALESCE(SUM(status='SOLD'), 0) FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as sold_players,
        (SELECT COALESCE(SUM(status='UNSOLD' OR status='FINAL_UNSOLD'), 0) FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as unsold_players,
        (SELECT COALESCE(SUM(status IN ('AVAILABLE', 'IN_AUCTION')), 0) FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as pending_players,
        (SELECT COALESCE(SUM(remaining_purse), 0) FROM teams WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as total_balance,
        (SELECT COALESCE(MAX(sold_price), 0) FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0 AND status='SOLD') as highest_bid;
    END
  `);

  console.log('sp_get_public_auction_snapshot updated successfully.');
}

async function down(pool) {
  // Not rolling back the procedure here for simplicity as down is rarely used
}

module.exports = { up, down };
