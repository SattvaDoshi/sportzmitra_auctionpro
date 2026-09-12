const express = require("express");
const pool = require("../config/db");
const { mapPublicSnapshot } = require("../utils/spResults");
const { sendError } = require("../utils/errors");
const { getViewerCount } = require("../socket");
const { calculateMaxBids } = require("../utils/maxBid");

const router = express.Router();

async function getPublicSnapshotBySlug(publicSlug) {
  const [[auctionRef]] = await pool.query(
    `SELECT id FROM auctions WHERE public_slug = ? OR auction_code = ? LIMIT 1`,
    [publicSlug, publicSlug]
  );

  if (!auctionRef) return null;

  const [resultSets] = await pool.query("CALL sp_get_public_auction_snapshot(?)", [auctionRef.id]);
  const snapshot = mapPublicSnapshot(resultSets);

  try {
     const maxBids = await calculateMaxBids(pool, auctionRef.id, snapshot.state);
     const applyMaxBids = (t) => {
       const mb = maxBids.find(b => b.team_id === t.id);
       return { ...t, max_bid_allowed: mb ? mb.max_bid : t.remaining_purse };
     };
     if (snapshot.teamsSummary) snapshot.teamsSummary = snapshot.teamsSummary.map(applyMaxBids);
     if (snapshot.teams) snapshot.teams = snapshot.teams.map(applyMaxBids);
  } catch (e) {
     console.error("Failed to augment max bids in public snapshot", e);
  }

  snapshot.viewerCount = getViewerCount(auctionRef.id);
  return snapshot;
}

router.get("/auction/:publicSlug", async (req, res) => {
  try {
    const snapshot = await getPublicSnapshotBySlug(req.params.publicSlug);
    if (!snapshot) return res.status(404).json({ message: "Auction not found" });
    res.json(snapshot);
  } catch (error) {
    console.error("public auction error", error);
    sendError(res, error);
  }
});

router.get("/auction/:publicSlug/dashboard", async (req, res) => {
  try {
    const snapshot = await getPublicSnapshotBySlug(req.params.publicSlug);
    if (!snapshot) return res.status(404).json({ message: "Auction dashboard not found" });
    res.json(snapshot);
  } catch (error) {
    console.error("public dashboard error", error);
    sendError(res, error);
  }
});

router.get("/auction/:auctionId/reports/team-summary", async (req, res) => {
  try {
    const { auctionId } = req.params;

    const [rows] = await pool.query(
      `SELECT 
         t.id,
         t.team_name,
         t.owner_name,
         t.logo_url,
         (t.remaining_purse + COALESCE(SUM(p.sold_price), 0)) AS total_purse,
         t.remaining_purse,
         COALESCE(SUM(p.sold_price), 0) AS used_amount,
         COUNT(p.id) AS players_purchased,
         t.remaining_purse AS max_bid_allowed
       FROM teams t
       LEFT JOIN players p ON p.sold_team_id = t.id AND p.status = 'SOLD'
       WHERE t.auction_id = ?
       GROUP BY t.id
       ORDER BY t.team_name`,
      [auctionId]
    );

    res.json(rows);
  } catch (error) {
    console.error("team summary error", error);
    sendError(res, error);
  }
});

module.exports = router;
