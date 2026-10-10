const fs = require("fs");

exports.up = async function (pool) {
  await pool.query(`
    DROP PROCEDURE IF EXISTS sp_get_public_auction_snapshot;
  `);

  await pool.query(`
    CREATE PROCEDURE sp_get_public_auction_snapshot(IN p_auction_id INT)
    BEGIN
      -- 1. Auction Details
      SELECT * FROM auctions WHERE id = p_auction_id;

      -- 2. State
      SELECT * FROM live_auction_state WHERE auction_id = p_auction_id;

      -- 3. Teams (with is_deleted check for players)
      SELECT 
        t.id, 
        t.team_name, 
        t.short_name,
        t.owner_name, 
        t.logo_url, 
        (t.remaining_purse + COALESCE((SELECT SUM(sold_price) FROM players WHERE sold_team_id = t.id AND status = 'SOLD' AND COALESCE(is_deleted, 0) = 0), 0)) AS total_purse, 
        t.remaining_purse, 
        COALESCE((SELECT SUM(sold_price) FROM players WHERE sold_team_id = t.id AND status = 'SOLD' AND COALESCE(is_deleted, 0) = 0), 0) AS used_amount 
      FROM teams t
      WHERE t.auction_id = p_auction_id AND COALESCE(t.is_deleted, 0) = 0;

      -- 4. Sold Players (Added area and serial_number)
      SELECT p.*, t.team_name as sold_team_name 
      FROM players p 
      LEFT JOIN teams t ON p.sold_team_id = t.id 
      WHERE p.auction_id = p_auction_id AND p.status = 'SOLD' AND COALESCE(p.is_deleted, 0) = 0;

      -- 5. Unsold Players
      SELECT p.* FROM players p WHERE p.auction_id = p_auction_id AND p.status = 'UNSOLD' AND COALESCE(p.is_deleted, 0) = 0;

      -- 6. Pending Players (AVAILABLE, IN_AUCTION)
      SELECT p.* FROM players p WHERE p.auction_id = p_auction_id AND p.status IN ('AVAILABLE', 'IN_AUCTION') AND COALESCE(p.is_deleted, 0) = 0;

      -- 7. Category Summary
      SELECT category, COUNT(*) as total, SUM(status='SOLD') as sold, SUM(status='UNSOLD') as unsold, SUM(status IN ('AVAILABLE', 'IN_AUCTION')) as pending 
      FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0 
      GROUP BY category;

      -- 8. Dashboard Summary
      SELECT 
        (SELECT COUNT(*) FROM teams WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as total_teams,
        (SELECT COUNT(*) FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as total_players,
        (SELECT COALESCE(SUM(status='SOLD'), 0) FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as sold_players,
        (SELECT COALESCE(SUM(status='UNSOLD' OR status='FINAL_UNSOLD'), 0) FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as unsold_players,
        (SELECT COALESCE(SUM(status IN ('AVAILABLE', 'IN_AUCTION')), 0) FROM players WHERE auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0) as pending_players;
    END;
  `);
};
