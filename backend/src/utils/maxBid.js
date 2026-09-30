/**
 * maxBid.js — Dynamic Max Bid Calculation Utility
 *
 * Ensures a team cannot bid so much that it can no longer afford
 * the minimum base prices for all remaining required players.
 *
 * General Auction:
 *   max_bid = remaining_purse
 *             - (remaining_players_needed × default_base_price)
 *             + current_player_base_price    ← already bidding on this one
 *
 * Category-Wise Auction:
 *   reserve = Σ max(0, slots_needed[cat] - bought[cat]) × base_price[cat]
 *   max_bid = remaining_purse
 *             - reserve
 *             + current_player_category_base_price   ← already bidding on this
 */

/**
 * @typedef {Object} TeamMaxBid
 * @property {number} team_id
 * @property {string} team_name
 * @property {number} remaining_purse
 * @property {number} players_bought       - total SOLD players owned by team
 * @property {number} min_reserve_required - minimum purse needed for remaining slots
 * @property {number} max_bid              - maximum this team can bid right now (≥ 0)
 */

/**
 * Calculate max bids for all teams in a given auction.
 *
 * @param {object} pool         - mysql2 connection pool
 * @param {number} auctionId    - auction id
 * @param {object|null} currentPlayer - { base_price, category } from auction_state, or null
 * @returns {Promise<TeamMaxBid[]>}
 */
async function calculateMaxBids(pool, auctionId, currentPlayer = null) {
  // 1. Load auction config
  const [[auction]] = await pool.query(
    `SELECT auction_type, default_base_price, players_per_team
     FROM auctions WHERE id = ?`,
    [auctionId]
  );

  if (!auction) return [];

  const isCategory = String(auction.auction_type || "").toUpperCase().includes("CATEGORY");
  const defaultBasePrice = Number(auction.default_base_price || 0);
  const playersPerTeam = Number(auction.players_per_team || 0);

  // 2. Load all active teams
  const [teams] = await pool.query(
    `SELECT id, team_name, remaining_purse
     FROM teams
     WHERE auction_id = ? AND COALESCE(is_deleted, 0) = 0 AND status = 'ACTIVE'`,
    [auctionId]
  );

  if (!teams.length) return [];

  // 3. Load players bought per team (total + per category)
  const [soldRows] = await pool.query(
    `SELECT sold_team_id AS team_id, category, COUNT(*) AS cnt
     FROM players
     WHERE auction_id = ? AND status = 'SOLD' AND sold_team_id IS NOT NULL
     GROUP BY sold_team_id, category`,
    [auctionId]
  );

  // Build lookup: teamId → { total: n, byCategory: { cat: n } }
  const soldByTeam = {};
  for (const row of soldRows) {
    const tid = Number(row.team_id);
    if (!soldByTeam[tid]) soldByTeam[tid] = { total: 0, byCategory: {} };
    soldByTeam[tid].total += Number(row.cnt);
    soldByTeam[tid].byCategory[row.category] = (soldByTeam[tid].byCategory[row.category] || 0) + Number(row.cnt);
  }

  let categorySlots = []; // [{ category_name, base_price, max_players_per_team }]

  if (isCategory) {
    // 4. Load category definitions (only those with a slot limit > 0)
    const [cats] = await pool.query(
      `SELECT category_name, base_price, COALESCE(max_players_per_team, 0) AS max_players_per_team
       FROM auction_categories
       WHERE auction_id = ? AND status = 'ACTIVE'
       ORDER BY display_order ASC`,
      [auctionId]
    );
    categorySlots = cats.filter(c => Number(c.max_players_per_team) > 0);
  }

  // 5. Compute max bid per team
  return teams.map(team => {
    const tid = Number(team.id);
    const remainingPurse = Number(team.remaining_purse || 0);
    const sold = soldByTeam[tid] || { total: 0, byCategory: {} };

    let minReserve = 0;
    let currentPlayerBonusBack = 0;

    if (!isCategory) {
      // ── General Auction ──────────────────────────────────────────
      const remainingNeeded = Math.max(0, playersPerTeam - sold.total);
      minReserve = remainingNeeded * defaultBasePrice;

      // If there's an active player on the block, the team is already
      // bidding on it — add back its base price so reserve isn't double-counted.
      if (currentPlayer && remainingNeeded > 0) {
        currentPlayerBonusBack = Number(currentPlayer.base_price || defaultBasePrice);
      }
    } else {
      // ── Category-Wise Auction ────────────────────────────────────
      for (const cat of categorySlots) {
        const maxSlots = Number(cat.max_players_per_team);
        const bought = Number(sold.byCategory[cat.category_name] || 0);
        const stillNeeded = Math.max(0, maxSlots - bought);
        minReserve += stillNeeded * Number(cat.base_price || 0);
      }

      // Add back the current player's category base price
      if (currentPlayer && currentPlayer.category) {
        const activeCat = categorySlots.find(c => c.category_name === currentPlayer.category);
        if (activeCat) {
          const maxSlots = Number(activeCat.max_players_per_team);
          const bought = Number(sold.byCategory[currentPlayer.category] || 0);
          // Only add back if this team still has a slot in that category
          if (bought < maxSlots) {
            currentPlayerBonusBack = Number(currentPlayer.base_price || activeCat.base_price || 0);
          }
        } else {
          // Category not in the slot list (unlimited) — just add back base price
          currentPlayerBonusBack = Number(currentPlayer.base_price || 0);
        }
      }
    }

    const rawMaxBid = remainingPurse - minReserve + currentPlayerBonusBack;
    const maxBid = Math.min(remainingPurse, Math.max(0, Math.floor(rawMaxBid)));

    return {
      team_id: tid,
      team_name: team.team_name,
      remaining_purse: remainingPurse,
      players_bought: sold.total,
      min_reserve_required: minReserve,
      max_bid: maxBid,
    };
  });
}

/**
 * Get max bid for a single team (convenience wrapper).
 *
 * @param {object} pool
 * @param {number} auctionId
 * @param {number} teamId
 * @param {object|null} currentPlayer
 * @returns {Promise<number>} max bid amount (≥ 0)
 */
async function getTeamMaxBid(pool, auctionId, teamId, currentPlayer = null) {
  const all = await calculateMaxBids(pool, auctionId, currentPlayer);
  const found = all.find(t => t.team_id === Number(teamId));
  return found ? found.max_bid : 0;
}

module.exports = { calculateMaxBids, getTeamMaxBid };
