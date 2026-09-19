/**
 * Migration 006 — Create sp_get_auction_dashboard
 *
 * The route GET /api/auctions/:auctionId/dashboard already calls this SP,
 * but it never existed in the DB. This migration creates it.
 *
 * Returns 4 result sets (consumed by mapDashboard in utils/spResults.js):
 *   [0] auction row
 *   [1] team summary  (total_teams, teams_with_players)
 *   [2] player summary (total_players, sold_players, unsold_players, total_sale_value)
 *   [3] auction state row
 */
module.exports = {
  up: async (pool) => {
    const drop = `DROP PROCEDURE IF EXISTS sp_get_auction_dashboard`;

    const create = `
CREATE PROCEDURE sp_get_auction_dashboard(IN p_auction_id BIGINT)
BEGIN
  -- Result set 0: auction info
  SELECT
    a.id,
    a.auction_name,
    a.auction_date,
    a.venue,
    a.status,
    a.auction_type,
    a.total_purse_per_team,
    a.players_per_team,
    a.default_base_price,
    a.minimum_bid_increment,
    a.public_slug,
    a.auction_logo_url,
    a.sponsor_logo_url,
    a.organization_id,
    o.organization_name
  FROM auctions a
  LEFT JOIN organizations o ON o.id = a.organization_id
  WHERE a.id = p_auction_id
    AND COALESCE(a.is_deleted, 0) = 0
  LIMIT 1;

  -- Result set 1: team summary
  SELECT
    COUNT(t.id)                                          AS total_teams,
    COUNT(CASE WHEN t.remaining_purse < t.total_purse THEN 1 END) AS teams_with_players,
    SUM(t.total_purse)                                   AS total_purse_pool,
    SUM(t.remaining_purse)                               AS total_remaining_purse
  FROM teams t
  WHERE t.auction_id = p_auction_id
    AND COALESCE(t.is_deleted, 0) = 0
    AND t.status = 'ACTIVE';

  -- Result set 2: player summary
  SELECT
    COUNT(p.id)                                                          AS total_players,
    COUNT(CASE WHEN p.status = 'SOLD' THEN 1 END)                       AS sold_players,
    COUNT(CASE WHEN p.status IN ('UNSOLD','FINAL_UNSOLD') THEN 1 END)   AS unsold_players,
    COUNT(CASE WHEN p.status IN ('AVAILABLE','IN_AUCTION') THEN 1 END)  AS pending_players,
    COALESCE(SUM(CASE WHEN p.status = 'SOLD' THEN p.sold_price END), 0) AS total_sale_value
  FROM players p
  WHERE p.auction_id = p_auction_id
    AND COALESCE(p.is_deleted, 0) = 0;

  -- Result set 3: auction state
  SELECT
    s.state,
    s.current_player_id,
    s.current_bid,
    s.highest_team_id,
    s.selection_mode,
    s.current_category,
    s.current_round,
    s.updated_at
  FROM auction_state s
  WHERE s.auction_id = p_auction_id
  LIMIT 1;
END
`;

    console.log("Creating sp_get_auction_dashboard...");
    await pool.query(drop);
    await pool.query(create);
    console.log("sp_get_auction_dashboard created successfully.");
  },
};
