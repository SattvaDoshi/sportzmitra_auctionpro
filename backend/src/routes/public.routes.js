"use strict";

const express = require("express");
const pool = require("../config/db");
const { mapPublicSnapshot } = require("../utils/spResults");
const { sendError } = require("../utils/errors");
const { getViewerCount } = require("../socket");
const { calculateMaxBids } = require("../utils/maxBid");
const cache = require("../utils/snapshotCache");

const router = express.Router();

/**
 * Resolve a publicSlug / auction_code → auctionId.
 * Result is cached for 30 seconds (auction metadata rarely changes mid-event).
 */
async function resolveAuctionId(publicSlug) {
  const slugKey = `slugmap:${publicSlug}`;
  const cached = cache.get(slugKey);
  if (cached !== undefined) return cached;

  const [[auctionRef]] = await pool.query(
    `SELECT id FROM auctions WHERE public_slug = ? OR auction_code = ? LIMIT 1`,
    [publicSlug, publicSlug]
  );
  const id = auctionRef?.id ?? null;
  cache.set(slugKey, id, 30_000); // 30-second TTL for slug → id mapping
  return id;
}

/**
 * Fetch the full snapshot for an auctionId.
 * Result is cached for 2 seconds (DEFAULT_TTL inside snapshotCache).
 * The cache is invalidated by live-route write handlers.
 */
async function getCachedSnapshot(auctionId) {
  const cacheKey = `snapshot:${auctionId}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const [resultSets] = await pool.query("CALL sp_get_public_auction_snapshot(?)", [auctionId]);
  const snapshot = mapPublicSnapshot(resultSets);

  // Augment with max-bids
  try {
    const maxBids = await calculateMaxBids(pool, auctionId, snapshot.state);
    const applyMaxBids = (t) => {
      const mb = maxBids.find((b) => b.team_id === t.id);
      return { ...t, max_bid_allowed: mb ? mb.max_bid : t.remaining_purse };
    };
    if (snapshot.teamsSummary) snapshot.teamsSummary = snapshot.teamsSummary.map(applyMaxBids);
    if (snapshot.teams) snapshot.teams = snapshot.teams.map(applyMaxBids);
  } catch (e) {
    console.error("Failed to augment max bids in public snapshot", e);
  }

  cache.set(cacheKey, snapshot); // 2-second default TTL
  return snapshot;
}

// ── GET /api/public/auction/:publicSlug ───────────────────────────────────────
router.get("/auction/:publicSlug", async (req, res) => {
  try {
    const auctionId = await resolveAuctionId(req.params.publicSlug);
    if (!auctionId) return res.status(404).json({ message: "Auction not found" });

    const snapshot = await getCachedSnapshot(auctionId);
    snapshot.viewerCount = getViewerCount(auctionId);

    res.json(snapshot);
  } catch (error) {
    console.error("public auction error", error);
    sendError(res, error);
  }
});

// ── GET /api/public/auction/:publicSlug/dashboard ─────────────────────────────
router.get("/auction/:publicSlug/dashboard", async (req, res) => {
  try {
    const auctionId = await resolveAuctionId(req.params.publicSlug);
    if (!auctionId) return res.status(404).json({ message: "Auction dashboard not found" });

    const snapshot = await getCachedSnapshot(auctionId);
    snapshot.viewerCount = getViewerCount(auctionId);

    res.json(snapshot);
  } catch (error) {
    console.error("public dashboard error", error);
    sendError(res, error);
  }
});

// ── GET /api/public/auction/:auctionId/reports/team-summary ──────────────────
router.get("/auction/:auctionId/reports/team-summary", async (req, res) => {
  try {
    const { auctionId } = req.params;

    const cacheKey = `team-summary:${auctionId}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

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

    cache.set(cacheKey, rows, 5_000); // 5-second TTL for reports
    res.json(rows);
  } catch (error) {
    console.error("team summary error", error);
    sendError(res, error);
  }
});

module.exports = router;
