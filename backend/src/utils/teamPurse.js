/**
 * teamPurse.js — Team Purse Synchronization Utility
 *
 * Ensures teams' remaining_purse, balance_purse, and total_purse
 * always accurately match the ground truth of sold players in MySQL.
 */

async function syncTeamPurse(conn, auctionId, teamIds = []) {
  const uniqueIds = Array.isArray(teamIds)
    ? [...new Set(teamIds.map(Number).filter(id => id > 0))]
    : [];

  // If no specific teams given, sync all active teams in this auction
  const targetTeamIds = uniqueIds.length > 0 ? uniqueIds : null;

  // 1. Initialize total_purse from auction settings if it was 0 or NULL
  if (targetTeamIds) {
    await conn.query(
      `UPDATE teams t
       JOIN auctions a ON a.id = t.auction_id
       SET t.total_purse = COALESCE(
         NULLIF(t.total_purse, 0),
         NULLIF(a.total_purse_per_team, 0),
         NULLIF(a.default_purse_per_team, 0),
         t.remaining_purse
       )
       WHERE t.auction_id = ? AND t.id IN (?) AND COALESCE(t.is_deleted, 0) = 0`,
      [auctionId, targetTeamIds]
    );
  } else {
    await conn.query(
      `UPDATE teams t
       JOIN auctions a ON a.id = t.auction_id
       SET t.total_purse = COALESCE(
         NULLIF(t.total_purse, 0),
         NULLIF(a.total_purse_per_team, 0),
         NULLIF(a.default_purse_per_team, 0),
         t.remaining_purse
       )
       WHERE t.auction_id = ? AND COALESCE(t.is_deleted, 0) = 0`,
      [auctionId]
    );
  }

  // 2. Fetch the teams to update
  let query = `SELECT id, total_purse, remaining_purse FROM teams WHERE auction_id = ? AND COALESCE(is_deleted, 0) = 0`;
  const params = [auctionId];
  if (targetTeamIds) {
    query += ` AND id IN (?)`;
    params.push(targetTeamIds);
  }
  const [teams] = await conn.query(query, params);

  // 3. For each team, compute exact total spent from sold players
  const results = {};
  for (const team of teams) {
    const tid = Number(team.id);
    const [[spentRow]] = await conn.query(
      `SELECT COALESCE(SUM(sold_price), 0) AS total_spent
       FROM players
       WHERE auction_id = ? AND sold_team_id = ? AND status = 'SOLD' AND COALESCE(is_deleted, 0) = 0`,
      [auctionId, tid]
    );

    const totalSpent = Number(spentRow?.total_spent || 0);
    const totalPurse = Number(team.total_purse || 0);
    const newRemaining = Math.max(0, totalPurse - totalSpent);

    await conn.query(
      `UPDATE teams
       SET remaining_purse = ?,
           balance_purse = ?
       WHERE id = ?`,
      [newRemaining, newRemaining, tid]
    );

    results[tid] = {
      team_id: tid,
      total_purse: totalPurse,
      remaining_purse: newRemaining,
      spent: totalSpent,
    };
  }

  return results;
}

module.exports = { syncTeamPurse };

