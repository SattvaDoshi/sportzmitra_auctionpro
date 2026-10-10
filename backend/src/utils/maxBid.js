/**
 * maxBid.js — Dynamic Max Bid Calculation Utility
 *
 * Ensures a team cannot bid so much that it can no longer afford
 * the minimum base prices for all remaining required players.
 *
 * Open / General Auction:
 *   remaining_players = player_limit − players_already_purchased
 *   reserved          = remaining_players × default_base_price
 *   max_bid           = remaining_purse − reserved + current_player_base_price
 *
 * Category-Wise Auction:
 *   reserved = Σ max(0, slots_needed[cat] − bought[cat]) × base_price[cat]
 *   max_bid  = remaining_purse − reserved + current_player_base_price
 *
 * WHY add back the current player's base price?
 *   The current player on the block is not yet purchased, so its slot is
 *   already counted inside the reserve. But if a team wins the bid, that
 *   slot is consumed by this player — the team only needs to keep enough
 *   purse for the OTHER remaining slots. Adding back the current player's
 *   base price reflects exactly that: the team can safely bid that extra
 *   amount because it will be spent on the current player's slot.
 *
 *   When currentPlayer is null ("absolute" mode — no live player on block),
 *   no add-back is applied and the reserve covers ALL remaining slots.
 *
 * Player limit precedence (per-team overrides auction-wide):
 *   COALESCE(team.player_limit, auction.players_per_team, 0)
 */

/**
 * @typedef {Object} TeamMaxBid
 * @property {number} team_id
 * @property {string} team_name
 * @property {number} remaining_purse
 * @property {number} players_bought       - total SOLD players owned by team
 * @property {number} player_limit         - effective player limit for this team
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
  const auctionPlayersPerTeam = Number(auction.players_per_team || 0);

  // 2. Load all active teams (include per-team player_limit)
  const [teams] = await pool.query(
    `SELECT id, team_name, remaining_purse, player_limit
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

    // Effective player limit: per-team value takes precedence over auction-wide setting
    const effectivePlayerLimit = team.player_limit != null
      ? Number(team.player_limit)
      : auctionPlayersPerTeam;

    let minReserve = 0;

    if (!isCategory) {
      // ── Open / General Auction ────────────────────────────────────
      //
      // Formula:
      //   remaining_players = player_limit − already_purchased
      //   reserved          = remaining_players × base_price
      //   max_bid           = remaining_purse − reserved + current_player_base_price

      if (effectivePlayerLimit > 0) {
        const remainingPlayers = Math.max(0, effectivePlayerLimit - sold.total);
        minReserve = remainingPlayers * defaultBasePrice;
      }
      // If no player limit is configured, the team can bid up to its full purse.
    } else {
      // ── Category-Wise Auction ────────────────────────────────────
      //
      // For every category with a per-team slot limit, reserve:
      //   (slots_remaining_in_category) × category_base_price
      //
      // max_bid = remaining_purse − reserved + current_player_base_price

      if (categorySlots.length > 0) {
        // At least one category has a slot limit — use per-category reserves
        for (const cat of categorySlots) {
          const maxSlots = Number(cat.max_players_per_team);
          const bought = Number(sold.byCategory[cat.category_name] || 0);
          const stillNeeded = Math.max(0, maxSlots - bought);
          minReserve += stillNeeded * Number(cat.base_price || 0);
        }
      } else {
        // No per-category slot limits are configured — fall back to the
        // overall team player limit × auction default_base_price,
        // identical to the open-auction calculation.
        if (effectivePlayerLimit > 0) {
          const remainingPlayers = Math.max(0, effectivePlayerLimit - sold.total);
          minReserve = remainingPlayers * defaultBasePrice;
        }
      }
    }

    // ── Add back the current player's base price ──────────────────────
    // The current player's slot is already included in minReserve above.
    // Since the team is about to spend its bid on THIS player (consuming
    // that slot), we can safely add back its base price — the team only
    // needs to keep the reserve for the OTHER remaining slots.
    // If currentPlayer is null ("absolute" mode), we assume they will bid on
    // a player with the default/minimum base price.
    let currentPlayerAddBack = 0;
    
    // Calculate how many slots are remaining overall
    const remainingSlots = effectivePlayerLimit > 0
      ? Math.max(0, effectivePlayerLimit - sold.total)
      : 0;

    if (currentPlayer) {
      if (!isCategory || categorySlots.length === 0) {
        // Open auction OR category-wise with no per-category limits:
        if (remainingSlots > 0) {
          currentPlayerAddBack = Number(currentPlayer.base_price || defaultBasePrice);
        }
      } else {
        // Category-wise with per-category limits:
        const activeCat = categorySlots.find(c => c.category_name === currentPlayer.category);
        if (activeCat) {
          const bought = Number(sold.byCategory[currentPlayer.category] || 0);
          if (bought < Number(activeCat.max_players_per_team)) {
            currentPlayerAddBack = Number(currentPlayer.base_price || activeCat.base_price || 0);
          }
        } else {
          // Player's category has no slot limit — add back its base price directly
          if (remainingSlots > 0) {
            currentPlayerAddBack = Number(currentPlayer.base_price || defaultBasePrice);
          }
        }
      }
    } else {
      // Absolute mode: add back the minimum required for ONE slot, because any player they bid on
      // will consume one of the remaining slots.
      if (!isCategory || categorySlots.length === 0) {
        if (remainingSlots > 0) {
          currentPlayerAddBack = defaultBasePrice;
        }
      } else {
        // In category mode without a specific player, we should ideally add back the smallest
        // base price among categories where they still have open slots.
        // For simplicity, we can use the overall defaultBasePrice or the smallest active category base price.
        let minCatBasePrice = null;
        for (const cat of categorySlots) {
          const bought = Number(sold.byCategory[cat.category_name] || 0);
          if (bought < Number(cat.max_players_per_team)) {
             const bp = Number(cat.base_price || 0);
             if (minCatBasePrice === null || bp < minCatBasePrice) minCatBasePrice = bp;
          }
        }
        if (minCatBasePrice !== null) {
          currentPlayerAddBack = minCatBasePrice;
        } else if (remainingSlots > 0) {
          currentPlayerAddBack = defaultBasePrice;
        }
      }
    }

    const rawMaxBid = remainingPurse - minReserve + currentPlayerAddBack;
    const maxBid = Math.min(remainingPurse, Math.max(0, Math.floor(rawMaxBid)));

    return {
      team_id: tid,
      team_name: team.team_name,
      remaining_purse: remainingPurse,
      players_bought: sold.total,
      player_limit: effectivePlayerLimit,
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
