module.exports = {
  up: async (pool) => {
    console.log("Updating sp_select_current_player and sp_get_public_auction_snapshot...");

    await pool.query("DROP PROCEDURE IF EXISTS sp_select_current_player");
    const spSelectSql = `
      CREATE PROCEDURE sp_select_current_player(
        IN p_auction_id BIGINT,
        IN p_player_id  BIGINT,
        IN p_user_id    BIGINT
      )
      BEGIN
        DECLARE v_player_name VARCHAR(150);
        DECLARE v_player_category VARCHAR(100);
        DECLARE v_prev_player_id BIGINT DEFAULT NULL;

        -- Validate player belongs to this auction and is selectable
        SELECT player_name, category INTO v_player_name, v_player_category
        FROM players
        WHERE id = p_player_id AND auction_id = p_auction_id AND COALESCE(is_deleted, 0) = 0
        LIMIT 1;

        IF v_player_name IS NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Player not found in this auction';
        END IF;

        -- Find the currently IN_AUCTION player (if any) so we can reset them
        SELECT current_player_id INTO v_prev_player_id
        FROM auction_state
        WHERE auction_id = p_auction_id
        LIMIT 1;

        -- If there was a different player already in auction, reset them back to AVAILABLE
        IF v_prev_player_id IS NOT NULL AND v_prev_player_id <> p_player_id THEN
          UPDATE players
          SET status = 'AVAILABLE'
          WHERE id = v_prev_player_id
            AND auction_id = p_auction_id
            AND status = 'IN_AUCTION';
        END IF;

        -- Set the new player status to IN_AUCTION
        UPDATE players
        SET status = 'IN_AUCTION'
        WHERE id = p_player_id AND auction_id = p_auction_id;

        -- Update auction state: set current player, reset bid, clear highest team, and sync category
        UPDATE auction_state
        SET current_player_id    = p_player_id,
            current_category     = COALESCE(v_player_category, current_category),
            current_bid          = (SELECT COALESCE(base_price, 0) FROM players WHERE id = p_player_id),
            highest_team_id      = NULL,
            state                = 'PLAYER_ACTIVE',
            suggested_player_id  = NULL,
            updated_by_user_id   = p_user_id,
            updated_at           = NOW()
        WHERE auction_id = p_auction_id;

        -- Log the action
        INSERT INTO auction_action_logs
          (auction_id, player_id, action_type, new_data, performed_by_user_id, reason)
        VALUES
          (p_auction_id, p_player_id, 'PLAYER_SELECTED',
           JSON_OBJECT('player_id', p_player_id, 'player_name', v_player_name, 'category', v_player_category),
           p_user_id, 'Player selected for auction');

        -- Return full snapshot
        CALL sp_get_public_auction_snapshot(p_auction_id);
      END
    `;
    await pool.query(spSelectSql);

    await pool.query("DROP PROCEDURE IF EXISTS sp_get_public_auction_snapshot");
    const spSnapshotSql = `
      CREATE PROCEDURE sp_get_public_auction_snapshot(IN p_auction_id BIGINT)
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

        -- 6. Category Summary ordered by display_order
        SELECT p.category, COUNT(*) as total, SUM(p.status='SOLD') as sold, SUM(p.status='UNSOLD') as unsold, SUM(p.status IN ('AVAILABLE', 'IN_AUCTION')) as pending 
        FROM players p
        LEFT JOIN auction_categories ac ON ac.auction_id = p_auction_id AND ac.category_name = p.category
        WHERE p.auction_id = p_auction_id AND COALESCE(p.is_deleted, 0) = 0 
        GROUP BY p.category, ac.display_order
        ORDER BY COALESCE(ac.display_order, 999) ASC, p.category ASC;

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
    `;
    await pool.query(spSnapshotSql);

    console.log("Migration 017 completed successfully.");
  },
  down: async (pool) => {}
};

