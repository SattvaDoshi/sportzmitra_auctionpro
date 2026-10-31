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
 *   When currentPlayer is null / not live ("absolute" mode — no live player on block),
 *   it assumes the team will bid on a future player with the minimum base price of open slots.
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
 * @param {object|null} currentPlayer - { base_price, category, state, status } from auction_state, or null
 * @returns {Promise<TeamMaxBid[]>}
 */
async function calculateMaxBids(pool, auctionId, currentPlayer = null) {
  // 1. Load auction config
  const [[auction]] = await pool.query(
    `SELECT auction_type, default_base_price, players_per_team, max_players_per_team
     FROM auctions WHERE id = ?`,
    [auctionId]
  );

  if (!auction) return [];

  const isCategory = String(auction.auction_type || "").toUpperCase().includes("CATEGORY");
  const defaultBasePrice = Number(auction.default_base_price || 0);
  const auctionPlayersPerTeam = Number(auction.players_per_team || auction.max_players_per_team || 0);

  // 2. Load all active teams (include per-team player_limit)
  const [teams] = await pool.query(
    `SELECT id, team_name, total_purse, remaining_purse, balance_purse, player_limit
     FROM teams
     WHERE auction_id = ? AND COALESCE(is_deleted, 0) = 0 AND status = 'ACTIVE'`,
    [auctionId]
  );

  if (!teams.length) return [];

  // 3. Load players bought per team (total + per category)
  const [soldRows] = await pool.query(
    `SELECT sold_team_id AS team_id, category, COUNT(*) AS cnt, SUM(sold_price) AS spent
     FROM players
     WHERE auction_id = ? AND status = 'SOLD' AND sold_team_id IS NOT NULL AND COALESCE(is_deleted, 0) = 0
     GROUP BY sold_team_id, category`,
    [auctionId]
  );

  // Build lookup: teamId → { total: n, spent: n, byCategory: {} }
  const soldByTeam = {};
  for (const row of soldRows) {
    const tid = Number(row.team_id);
    if (!soldByTeam[tid]) soldByTeam[tid] = { total: 0, spent: 0, byCategory: {} };
    soldByTeam[tid].total += Number(row.cnt);
    soldByTeam[tid].spent += Number(row.spent || 0);
    const catKey = String(row.category || "").trim().toUpperCase();
    if (catKey) {
      soldByTeam[tid].byCategory[catKey] = (soldByTeam[tid].byCategory[catKey] || 0) + Number(row.cnt);
    }
  }

  let categorySlots = []; // [{ category_name, base_price, max_players_per_team }]

  if (isCategory) {
    // 4. Load category definitions (only those with a slot limit > 0)
    const [cats] = await pool.query(
      `SELECT category_name, base_price, COALESCE(max_players_per_team, 0) AS max_players_per_team
       FROM auction_categories
       WHERE auction_id = ? AND COALESCE(status, 'ACTIVE') != 'INACTIVE'
       ORDER BY display_order ASC, id ASC`,
      [auctionId]
    );
    categorySlots = cats.filter((c) => Number(c.max_players_per_team) > 0);
  }

  // 5. Compute max bid per team
  return teams.map((team) => {
    const tid = Number(team.id);
    const sold = soldByTeam[tid] || { total: 0, spent: 0, byCategory: {} };

    // Dynamic remaining purse: if total_purse is known, remaining = total_purse - sold.spent
    // Otherwise fall back to team.remaining_purse
    const rawTotalPurse = Number(team.total_purse || 0);
    const remainingPurse = rawTotalPurse > 0
      ? Math.max(0, rawTotalPurse - sold.spent)
      : Number(team.remaining_purse || 0);

    // Effective player limit: per-team value takes precedence over auction-wide setting
    const effectivePlayerLimit = team.player_limit != null
      ? Number(team.player_limit)
      : auctionPlayersPerTeam;

    let minReserve = 0;

    if (!isCategory || categorySlots.length === 0) {
      // ── Open / General Auction ────────────────────────────────────
      if (effectivePlayerLimit > 0) {
        const remainingPlayers = Math.max(0, effectivePlayerLimit - sold.total);
        minReserve = remainingPlayers * defaultBasePrice;
      }
    } else {
      // ── Category-Wise Auction ────────────────────────────────────
      let categorySlotsTotal = 0;
      let categoryBoughtTotal = 0;

      for (const cat of categorySlots) {
        const maxSlots = Number(cat.max_players_per_team);
        categorySlotsTotal += maxSlots;
        const catKey = String(cat.category_name || "").trim().toUpperCase();
        const bought = Number(sold.byCategory[catKey] || 0);
        categoryBoughtTotal += Math.min(bought, maxSlots);
        const stillNeeded = Math.max(0, maxSlots - bought);
        minReserve += stillNeeded * Number(cat.base_price || 0);
      }

      // If team player limit is higher than the sum of slots defined across categories:
      if (effectivePlayerLimit > categorySlotsTotal) {
        const generalSlotsRequired = effectivePlayerLimit - categorySlotsTotal;
        const otherBought = Math.max(0, sold.total - categoryBoughtTotal);
        const generalStillNeeded = Math.max(0, generalSlotsRequired - otherBought);
        minReserve += generalStillNeeded * defaultBasePrice;
      }
    }

    // Determine remaining overall slots
    const remainingSlots = effectivePlayerLimit > 0
      ? Math.max(0, effectivePlayerLimit - sold.total)
      : 999;

    // Check if team has already reached its squad limit
    if (effectivePlayerLimit > 0 && sold.total >= effectivePlayerLimit) {
      return {
        team_id: tid,
        team_name: team.team_name,
        total_purse: rawTotalPurse || (remainingPurse + sold.spent),
        remaining_purse: remainingPurse,
        players_bought: sold.total,
        player_limit: effectivePlayerLimit,
        min_reserve_required: minReserve,
        max_bid: 0,
        max_bid_allowed: 0,
      };
    }

    let currentPlayerAddBack = 0;

    // Is there a live player currently on the block being auctioned?
    const isLivePlayer = currentPlayer &&
      (currentPlayer.id || currentPlayer.current_player_id) &&
      (!currentPlayer.state || ['PLAYER_ACTIVE', 'BIDDING', 'IN_AUCTION'].includes(currentPlayer.state)) &&
      (!currentPlayer.status || ['IN_AUCTION', 'AVAILABLE'].includes(currentPlayer.status));

    if (isLivePlayer) {
      const activeCatKey = String(currentPlayer.category || "").trim().toUpperCase();
      const activeBasePrice = Number(currentPlayer.base_price || 0);

      if (!isCategory || categorySlots.length === 0) {
        if (remainingSlots > 0) {
          currentPlayerAddBack = activeBasePrice || defaultBasePrice;
        }
      } else {
        const activeCat = categorySlots.find(
          (c) => String(c.category_name).trim().toUpperCase() === activeCatKey
        );
        if (activeCat) {
          const bought = Number(sold.byCategory[activeCatKey] || 0);
          if (bought < Number(activeCat.max_players_per_team)) {
            currentPlayerAddBack = activeBasePrice || Number(activeCat.base_price || 0);
          }
        } else {
          if (remainingSlots > 0) {
            currentPlayerAddBack = activeBasePrice || defaultBasePrice;
          }
        }
      }
    } else {
      // No live player on block (between players, dashboard view, or absolute mode):
      if (!isCategory || categorySlots.length === 0) {
        if (remainingSlots > 0) {
          currentPlayerAddBack = defaultBasePrice;
        }
      } else {
        // Find smallest base price among categories where this team still has open slots
        let minCatBasePrice = null;
        for (const cat of categorySlots) {
          const catKey = String(cat.category_name).trim().toUpperCase();
          const bought = Number(sold.byCategory[catKey] || 0);
          if (bought < Number(cat.max_players_per_team)) {
            const bp = Number(cat.base_price || 0);
            if (minCatBasePrice === null || bp < minCatBasePrice) {
              minCatBasePrice = bp;
            }
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
      total_purse: rawTotalPurse || (remainingPurse + sold.spent),
      remaining_purse: remainingPurse,
      players_bought: sold.total,
      player_limit: effectivePlayerLimit,
      min_reserve_required: minReserve,
      max_bid: maxBid,
      max_bid_allowed: maxBid,
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
  const found = all.find((t) => t.team_id === Number(teamId));
  return found ? found.max_bid : 0;
}

module.exports = { calculateMaxBids, getTeamMaxBid };
