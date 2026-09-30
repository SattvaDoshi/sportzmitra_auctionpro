module.exports = {
  up: async (pool) => {
    // 1. Cleanup stuck players
    console.log("Cleaning up stuck IN_AUCTION players...");
    const [stuckRows] = await pool.query(`
      SELECT p.id, p.player_name, p.auction_id, ast.current_player_id
      FROM players p
      JOIN auction_state ast ON ast.auction_id = p.auction_id
      WHERE p.status = 'IN_AUCTION'
        AND (ast.current_player_id IS NULL OR ast.current_player_id <> p.id)
    `);

    if (stuckRows.length > 0) {
      const stuckIds = stuckRows.map(r => r.id);
      await pool.query(
        `UPDATE players SET status = 'AVAILABLE' WHERE id IN (?) AND status = 'IN_AUCTION'`,
        [stuckIds]
      );
      console.log(`Reset ${stuckRows.length} player(s) back to AVAILABLE.`);
    } else {
      console.log('No stuck players found.');
    }

    // 2. Fix the sp_select_current_player stored procedure
    console.log("Updating sp_select_current_player...");
    await pool.query("DROP PROCEDURE IF EXISTS sp_select_current_player");
    const spSql = `
      CREATE PROCEDURE sp_select_current_player(
        IN p_auction_id BIGINT,
        IN p_player_id  BIGINT,
        IN p_user_id    BIGINT
      )
      BEGIN
        DECLARE v_player_name    VARCHAR(150);
        DECLARE v_prev_player_id BIGINT DEFAULT NULL;

        -- Validate player belongs to this auction and is selectable
        SELECT player_name INTO v_player_name
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

        -- Update auction state: set current player, reset bid, clear highest team
        UPDATE auction_state
        SET current_player_id    = p_player_id,
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
           JSON_OBJECT('player_id', p_player_id, 'player_name', v_player_name),
           p_user_id, 'Player selected for auction');

        -- Return full snapshot
        CALL sp_get_public_auction_snapshot(p_auction_id);
      END
    `;
    await pool.query(spSql);
    console.log("sp_select_current_player updated successfully.");
  }
};
