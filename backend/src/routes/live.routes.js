const express = require("express");
const pool = require("../config/db");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");
const { checkAuctionAccess } = require("../middleware/accessMiddleware");
const { mapPublicSnapshot } = require("../utils/spResults");
const { sendError } = require("../utils/errors");
const { emitAuctionSnapshot } = require("../socket");
const { calculateMaxBids, getTeamMaxBid } = require("../utils/maxBid");

const router = express.Router();

async function augmentSnapshotWithMaxBids(snapshot, auctionId) {
  if (!snapshot) return snapshot;
  try {
     const maxBids = await calculateMaxBids(pool, auctionId, snapshot.state);
     const applyMaxBids = (t) => {
       const mb = maxBids.find(b => b.team_id === t.id);
       return { ...t, max_bid_allowed: mb ? mb.max_bid : t.remaining_purse };
     };
     if (snapshot.teamsSummary) snapshot.teamsSummary = snapshot.teamsSummary.map(applyMaxBids);
     if (snapshot.teams) snapshot.teams = snapshot.teams.map(applyMaxBids);
  } catch (e) {
     console.error("Failed to augment max bids", e);
  }
  return snapshot;
}

async function callSnapshotProcedure(sql, params) {
  const [resultSets] = await pool.query(sql, params);
  const snapshot = mapPublicSnapshot(resultSets);
  return await augmentSnapshotWithMaxBids(snapshot, params[0]);
}


async function suggestNextPlayer(auctionId) {
  const [[auction]] = await pool.query(
    `SELECT auction_flow_type, next_player_selection_mode FROM auctions WHERE id = ?`,
    [auctionId]
  );
  const [[state]] = await pool.query(
    `SELECT current_category, current_round FROM auction_state WHERE auction_id = ?`,
    [auctionId]
  );

  const rawFlow = auction?.auction_flow_type || "GENERAL";
  const flow = rawFlow === "CATEGORY_WISE_UNSOLD_AFTER_EACH_CATEGORY" ? "CATEGORY_UNSOLD_AFTER_EACH_CATEGORY" : rawFlow === "CATEGORY_WISE_UNSOLD_AT_END" ? "CATEGORY_UNSOLD_AT_END" : rawFlow;
  let playerRows = [];
  let nextCategory = state?.current_category || null;

  async function pick(whereSql, params) {
    const [rows] = await pool.query(
      `SELECT id, player_name, category, player_role, base_price, status, auction_round, photo_url
       FROM players
       WHERE auction_id = ? ${whereSql}
       ORDER BY RAND()
       LIMIT 1`,
      [auctionId, ...params]
    );
    return rows;
  }

  // Get ordered categories
  const [categories] = await pool.query(
    `SELECT category_name FROM auction_categories WHERE auction_id = ? AND status = 'ACTIVE' ORDER BY display_order ASC, id ASC`,
    [auctionId]
  );
  const categoryList = categories.map(c => c.category_name);

  if (flow === "GENERAL" || flow === "GENERAL_UNSOLD_AT_END") {
    playerRows = await pick(`AND status = 'AVAILABLE'`, []);
    if (playerRows.length === 0) playerRows = await pick(`AND status = 'UNSOLD'`, []);
  } else if (flow === "CATEGORY_UNSOLD_AT_END") {
    // 1. Try current category MAIN
    if (nextCategory) playerRows = await pick(`AND status = 'AVAILABLE' AND category = ?`, [nextCategory]);
    // 2. Try next categories MAIN
    if (playerRows.length === 0) {
      for (const cat of categoryList) {
        playerRows = await pick(`AND status = 'AVAILABLE' AND category = ?`, [cat]);
        if (playerRows.length > 0) {
          nextCategory = cat;
          break;
        }
      }
    }
    // 3. Try UNSOLD for all (it's UNSOLD_AT_END, so we don't care about category order here, but let's try to stick to order if possible, or just random)
    if (playerRows.length === 0) {
      playerRows = await pick(`AND status = 'UNSOLD'`, []);
      if (playerRows.length > 0) {
        nextCategory = playerRows[0].category; // keep track
      }
    }
  } else {
    // CATEGORY_UNSOLD_AFTER_EACH_CATEGORY
    // 1. Try current category MAIN
    if (nextCategory) playerRows = await pick(`AND status = 'AVAILABLE' AND category = ?`, [nextCategory]);
    // 2. Try current category UNSOLD
    if (nextCategory && playerRows.length === 0) playerRows = await pick(`AND status = 'UNSOLD' AND category = ?`, [nextCategory]);
    
    // 3. Move to next category
    if (playerRows.length === 0) {
      for (const cat of categoryList) {
        playerRows = await pick(`AND status = 'AVAILABLE' AND category = ?`, [cat]);
        if (playerRows.length === 0) playerRows = await pick(`AND status = 'UNSOLD' AND category = ?`, [cat]);
        if (playerRows.length > 0) {
          nextCategory = cat;
          break;
        }
      }
    }
  }

  const suggested = playerRows[0] || null;
  const currentRound = suggested?.status === 'UNSOLD' ? 'UNSOLD' : 'MAIN';

  await pool.query(
    `UPDATE auction_state
     SET suggested_player_id = ?,
         selection_mode = COALESCE(?, selection_mode),
         current_category = COALESCE(?, current_category),
         current_round = ?
     WHERE auction_id = ?`,
    [suggested?.id || null, auction?.next_player_selection_mode || "RANDOM_WITH_ADMIN_CONFIRM", nextCategory, currentRound, auctionId]
  );

  return suggested;
}


async function autoSelectNextIfRandom(auctionId, userId) {
  const [[auction]] = await pool.query(
    `SELECT next_player_selection_mode FROM auctions WHERE id = ?`,
    [auctionId]
  );
  const [[state]] = await pool.query(
    `SELECT selection_mode FROM auction_state WHERE auction_id = ?`,
    [auctionId]
  );

  const mode = state?.selection_mode || auction?.next_player_selection_mode || "RANDOM_WITH_ADMIN_CONFIRM";
  const suggested = await suggestNextPlayer(auctionId);

  if (mode === "RANDOM" && suggested?.id) {
    await callSnapshotProcedure("CALL sp_select_current_player(?, ?, ?)", [
      auctionId,
      suggested.id,
      userId,
    ]);
    return { mode, suggested, autoSelected: true };
  }

  return { mode, suggested, autoSelected: false };
}

async function loadSnapshot(auctionId) {
  const [resultSets] = await pool.query("CALL sp_get_public_auction_snapshot(?)", [auctionId]);
  const snapshot = mapPublicSnapshot(resultSets);
  return await augmentSnapshotWithMaxBids(snapshot, auctionId);
}


router.post(
  "/:auctionId/select-player",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);
      const playerId = Number(req.body.player_id);

      if (!playerId) return res.status(400).json({ message: "player_id is required" });

      const snapshot = await callSnapshotProcedure("CALL sp_select_current_player(?, ?, ?)", [
        auctionId,
        playerId,
        req.user.userId,
      ]);

      emitAuctionSnapshot(auctionId, snapshot, "playerSelected");
      emitAuctionSnapshot(auctionId, snapshot);

      res.json({ message: "Player selected", snapshot, state: snapshot.state });
    } catch (error) {
      console.error("select player error", error);
      sendError(res, error);
    }
  }
);

router.post(
  "/:auctionId/bid",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);
      const playerId = Number(req.body.player_id);
      const teamId = Number(req.body.team_id);
      const bidAmount = Number(req.body.bid_amount);

      if (!playerId || !teamId || !bidAmount) {
        return res.status(400).json({ message: "player_id, team_id and bid_amount are required" });
      }

      const snapshot = await callSnapshotProcedure("CALL sp_place_bid(?, ?, ?, ?, ?)", [
        auctionId,
        playerId,
        teamId,
        bidAmount,
        req.user.userId,
      ]);

      emitAuctionSnapshot(auctionId, snapshot, "bidPlaced");
      emitAuctionSnapshot(auctionId, snapshot);

      res.json({ message: "Bid placed", snapshot, state: snapshot.state });
    } catch (error) {
      console.error("place bid error", error);
      sendError(res, error);
    }
  }
);

router.post(
  "/:auctionId/sold",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);

      await callSnapshotProcedure("CALL sp_mark_player_sold(?, ?)", [auctionId, req.user.userId]);
      const next = await autoSelectNextIfRandom(auctionId, req.user.userId);
      const snapshot = await loadSnapshot(auctionId);

      emitAuctionSnapshot(auctionId, { ...snapshot, next }, "playerSold");
      emitAuctionSnapshot(auctionId, snapshot);

      res.json({ message: next.autoSelected ? "Player sold. Next random player selected." : "Player sold", snapshot, state: snapshot.state, next });
    } catch (error) {
      console.error("sold error", error);
      sendError(res, error);
    }
  }
);

router.post(
  "/:auctionId/unsold",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);

      await callSnapshotProcedure("CALL sp_mark_player_unsold(?, ?)", [auctionId, req.user.userId]);
      const next = await autoSelectNextIfRandom(auctionId, req.user.userId);
      const snapshot = await loadSnapshot(auctionId);

      emitAuctionSnapshot(auctionId, { ...snapshot, next }, "playerUnsold");
      emitAuctionSnapshot(auctionId, snapshot);

      res.json({ message: next.autoSelected ? "Player marked unsold. Next random player selected." : "Player marked unsold", snapshot, state: snapshot.state, next });
    } catch (error) {
      console.error("unsold error", error);
      sendError(res, error);
    }
  }
);


router.post(
  "/:auctionId/suggest-next",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);
      const suggested = await suggestNextPlayer(auctionId);
      const snapshot = await loadSnapshot(auctionId);
      emitAuctionSnapshot(auctionId, snapshot, "nextPlayerSuggested");
      emitAuctionSnapshot(auctionId, snapshot);
      res.json({ message: suggested ? "Next player suggested" : "No eligible player found", suggested, snapshot, state: snapshot.state });
    } catch (error) {
      console.error("suggest next error", error);
      sendError(res, error);
    }
  }
);

router.post(
  "/:auctionId/final-unsold",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const auctionId = Number(req.params.auctionId);
      await conn.beginTransaction();
      let playerId = Number(req.body.player_id || 0);
      if (!playerId) {
        const [[st]] = await conn.query(`SELECT current_player_id FROM auction_state WHERE auction_id = ? FOR UPDATE`, [auctionId]);
        playerId = Number(st?.current_player_id || 0);
      }
      if (!playerId) throw new Error("player_id or current player is required");

      const [[player]] = await conn.query(`SELECT * FROM players WHERE id = ? AND auction_id = ? FOR UPDATE`, [playerId, auctionId]);
      if (!player) throw new Error("Player not found in this auction");
      if (player.status === "SOLD") throw new Error("Sold player cannot be marked final unsold");

      await conn.query(
        `UPDATE players
         SET status = 'FINAL_UNSOLD', auction_round = 'UNSOLD', final_unsold_at = NOW(), last_unsold_at = COALESCE(last_unsold_at, NOW())
         WHERE id = ?`,
        [playerId]
      );
      await conn.query(
        `UPDATE auction_state
         SET state = 'FINAL_UNSOLD', current_bid = 0, highest_team_id = NULL, updated_by_user_id = ?
         WHERE auction_id = ?`,
        [req.user.userId, auctionId]
      );
      await conn.query(
        `INSERT INTO auction_action_logs (auction_id, player_id, action_type, new_data, performed_by_user_id, reason)
         VALUES (?, ?, 'PLAYER_FINAL_UNSOLD', JSON_OBJECT('player_id', ?), ?, ?)`,
        [auctionId, playerId, playerId, req.user.userId, req.body.reason || "Marked final unsold"]
      );
      await conn.query(
        `INSERT INTO player_auction_attempts (auction_id, player_id, attempt_type, attempt_no, result, bid_amount, created_by_user_id, reason)
         VALUES (?, ?, 'UNSOLD', COALESCE(?, 0) + 1, 'FINAL_UNSOLD', 0, ?, ?)`,
        [auctionId, playerId, player.unsold_count || 0, req.user.userId, req.body.reason || "Marked final unsold"]
      );
      await conn.commit();
      const next = await autoSelectNextIfRandom(auctionId, req.user.userId);
      const snapshot = await loadSnapshot(auctionId);
      emitAuctionSnapshot(auctionId, { ...snapshot, next }, "playerFinalUnsold");
      emitAuctionSnapshot(auctionId, snapshot);
      res.json({ message: next.autoSelected ? "Player marked final unsold. Next random player selected." : "Player marked final unsold", snapshot, state: snapshot.state, next });
    } catch (error) {
      await conn.rollback();
      console.error("final unsold error", error);
      sendError(res, error);
    } finally {
      conn.release();
    }
  }
);



router.patch(
  "/:auctionId/selection-mode",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);
      const mode = String(req.body.selection_mode || "").toUpperCase();
      const allowed = ["MANUAL", "RANDOM", "RANDOM_WITH_ADMIN_CONFIRM"];

      if (!allowed.includes(mode)) {
        return res.status(400).json({ message: "Invalid selection mode" });
      }

      await pool.query(
        `UPDATE auctions SET next_player_selection_mode = ?, updated_at = NOW() WHERE id = ?`,
        [mode, auctionId]
      );
      await pool.query(
        `UPDATE auction_state SET selection_mode = ?, updated_by_user_id = ? WHERE auction_id = ?`,
        [mode, req.user.userId, auctionId]
      );

      const snapshot = await loadSnapshot(auctionId);
      emitAuctionSnapshot(auctionId, snapshot, "selectionModeUpdated");
      emitAuctionSnapshot(auctionId, snapshot);
      res.json({ message: "Next player mode updated", selection_mode: mode, snapshot, state: snapshot.state });
    } catch (error) {
      console.error("selection mode update error", error);
      sendError(res, error);
    }
  }
);

router.patch(
  "/:auctionId/bid-preview",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const auctionId = Number(req.params.auctionId);
      const playerId = Number(req.body.player_id);
      const teamId = req.body.team_id ? Number(req.body.team_id) : null;
      const bidAmount = Number(req.body.bid_amount);

      if (!playerId || Number.isNaN(bidAmount)) {
        return res.status(400).json({ message: "player_id and bid_amount are required" });
      }

      await conn.beginTransaction();
      const [[state]] = await conn.query(
        `SELECT current_player_id FROM auction_state WHERE auction_id = ? FOR UPDATE`,
        [auctionId]
      );
      if (!state?.current_player_id) throw new Error("No active player selected");
      if (Number(state.current_player_id) !== playerId) throw new Error("Player is not current active player");

      const [[player]] = await conn.query(
        `SELECT id, base_price, status FROM players WHERE id = ? AND auction_id = ? FOR UPDATE`,
        [playerId, auctionId]
      );
      if (!player) throw new Error("Player not found");
      if (["SOLD", "FINAL_UNSOLD", "WITHDRAWN"].includes(player.status)) throw new Error("Player is not available for bidding");
      if (bidAmount < Number(player.base_price || 0)) throw new Error("Bid cannot be below base price");

      if (teamId) {
        const [[team]] = await conn.query(
          `SELECT remaining_purse FROM teams WHERE id = ? AND auction_id = ? AND status = 'ACTIVE' FOR UPDATE`,
          [teamId, auctionId]
        );
        if (!team) throw new Error("Team not found");
        if (bidAmount > Number(team.remaining_purse || 0)) throw new Error("Bid exceeds team remaining purse");

        // Max bid validation — ensures team can still afford remaining required players
        const currentPlayerForMaxBid = player ? { base_price: player.base_price, category: null } : null;
        if (currentPlayerForMaxBid) {
          // Fetch current player category from state
          const [[st]] = await conn.query(`SELECT p.category FROM players p WHERE p.id = ?`, [playerId]);
          if (st) currentPlayerForMaxBid.category = st.category;
        }
        const teamMaxBid = await getTeamMaxBid(pool, auctionId, teamId, currentPlayerForMaxBid);
        if (teamMaxBid > 0 && bidAmount > teamMaxBid) {
          throw new Error(`Bid of ₹${bidAmount.toLocaleString('en-IN')} exceeds max allowed bid of ₹${teamMaxBid.toLocaleString('en-IN')} for this team`);
        }
      }

      await conn.query(
        `UPDATE auction_state
         SET current_bid = ?, highest_team_id = ?, state = 'BIDDING', bid_preview_updated_at = NOW(), updated_by_user_id = ?
         WHERE auction_id = ?`,
        [bidAmount, teamId, req.user.userId, auctionId]
      );

      await conn.commit();
      const snapshot = await loadSnapshot(auctionId);
      emitAuctionSnapshot(auctionId, snapshot, "bidPreviewUpdated");
      emitAuctionSnapshot(auctionId, snapshot);
      res.json({ message: "Bid updated", snapshot, state: snapshot.state });
    } catch (error) {
      await conn.rollback();
      console.error("bid preview error", error);
      sendError(res, error);
    } finally {
      conn.release();
    }
  }
);

router.patch(
  "/:auctionId/current-increment",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);
      const increment = Number(req.body.current_bid_increment);
      if (!increment || increment <= 0) return res.status(400).json({ message: "Valid increment is required" });

      await pool.query(
        `UPDATE auction_state SET current_bid_increment = ?, updated_by_user_id = ? WHERE auction_id = ?`,
        [increment, req.user.userId, auctionId]
      );
      const snapshot = await loadSnapshot(auctionId);
      emitAuctionSnapshot(auctionId, snapshot, "bidIncrementUpdated");
      emitAuctionSnapshot(auctionId, snapshot);
      res.json({ message: "Bid increment updated", snapshot, state: snapshot.state });
    } catch (error) {
      console.error("increment update error", error);
      sendError(res, error);
    }
  }
);

router.get(
  "/:auctionId/state",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);
      const [resultSets] = await pool.query("CALL sp_get_public_auction_snapshot(?)", [auctionId]);
      const snapshot = mapPublicSnapshot(resultSets);
      res.json(snapshot.state || {});
    } catch (error) {
      console.error("state error", error);
      sendError(res, error);
    }
  }
);

router.get(
  "/:auctionId/snapshot",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);
      const [resultSets] = await pool.query("CALL sp_get_public_auction_snapshot(?)", [auctionId]);
      res.json(mapPublicSnapshot(resultSets));
    } catch (error) {
      console.error("snapshot error", error);
      sendError(res, error);
    }
  }
);

// ── Max Bid ─────────────────────────────────────────────────────────────────
router.get(
  "/:auctionId/max-bid",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);

      // Get the current active player from auction_state (if any)
      const [[stateRow]] = await pool.query(
        `SELECT s.current_player_id, p.base_price, p.category, p.status
         FROM auction_state s
         LEFT JOIN players p ON p.id = s.current_player_id
         WHERE s.auction_id = ?`,
        [auctionId]
      );

      const isAbsolute = req.query.absolute === 'true';
      const currentPlayer = !isAbsolute && stateRow?.current_player_id && ['IN_AUCTION', 'AVAILABLE'].includes(stateRow.status)
        ? { base_price: stateRow.base_price, category: stateRow.category }
        : null;

      const maxBids = await calculateMaxBids(pool, auctionId, currentPlayer);

      // Return as both array and map keyed by team_id for convenience
      const maxBidMap = {};
      for (const entry of maxBids) maxBidMap[entry.team_id] = entry;

      res.json({ maxBids, maxBidMap });
    } catch (error) {
      console.error("max-bid error", error);
      sendError(res, error);
    }
  }
);

router.post(
  "/:auctionId/pause",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const auctionId = Number(req.params.auctionId);
      await conn.beginTransaction();

      await conn.query(
        `UPDATE auctions SET status = 'PAUSED', updated_at = NOW() WHERE id = ?`,
        [auctionId]
      );
      await conn.query(
        `UPDATE auction_state SET state = 'PAUSED', updated_by_user_id = ? WHERE auction_id = ?`,
        [req.user.userId, auctionId]
      );
      await conn.query(
        `INSERT INTO auction_action_logs (auction_id, action_type, new_data, performed_by_user_id, reason)
         VALUES (?, 'AUCTION_PAUSED', JSON_OBJECT('auction_id', ?), ?, ?)`,
        [auctionId, auctionId, req.user.userId, req.body.reason || "Auction paused"]
      );

      await conn.commit();
      const snapshot = await loadSnapshot(auctionId);
      emitAuctionSnapshot(auctionId, snapshot, "auctionPaused");
      emitAuctionSnapshot(auctionId, snapshot);
      res.json({ message: "Auction paused", snapshot, state: snapshot.state });
    } catch (error) {
      await conn.rollback();
      console.error("pause error", error);
      sendError(res, error);
    } finally {
      conn.release();
    }
  }
);

router.post(
  "/:auctionId/resume",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const auctionId = Number(req.params.auctionId);
      await conn.beginTransaction();

      await conn.query(
        `UPDATE auctions SET status = 'LIVE', updated_at = NOW() WHERE id = ?`,
        [auctionId]
      );
      
      const [[state]] = await conn.query(`SELECT current_player_id, highest_team_id FROM auction_state WHERE auction_id = ?`, [auctionId]);
      
      let nextState = 'NOT_STARTED';
      if (state.highest_team_id) {
         nextState = 'BIDDING';
      } else if (state.current_player_id) {
         const [[player]] = await conn.query(`SELECT status FROM players WHERE id = ?`, [state.current_player_id]);
         if (player?.status === 'IN_AUCTION') nextState = 'PLAYER_ACTIVE';
         else if (player?.status === 'SOLD') nextState = 'SOLD';
         else if (player?.status === 'UNSOLD') nextState = 'UNSOLD';
         else if (player?.status === 'FINAL_UNSOLD') nextState = 'FINAL_UNSOLD';
      }

      await conn.query(
        `UPDATE auction_state SET state = ?, updated_by_user_id = ? WHERE auction_id = ?`,
        [nextState, req.user.userId, auctionId]
      );
      await conn.query(
        `INSERT INTO auction_action_logs (auction_id, action_type, new_data, performed_by_user_id, reason)
         VALUES (?, 'AUCTION_RESTORED', JSON_OBJECT('auction_id', ?), ?, ?)`,
        [auctionId, auctionId, req.user.userId, req.body.reason || "Auction resumed"]
      );

      await conn.commit();
      const snapshot = await loadSnapshot(auctionId);
      emitAuctionSnapshot(auctionId, snapshot, "auctionResumed");
      emitAuctionSnapshot(auctionId, snapshot);
      res.json({ message: "Auction resumed", snapshot, state: snapshot.state });
    } catch (error) {
      await conn.rollback();
      console.error("resume error", error);
      sendError(res, error);
    } finally {
      conn.release();
    }
  }
);

// ── Audit Log ─────────────────────────────────────────────────────────────────
router.get(
  "/:auctionId/audit-log",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);
      const [rows] = await pool.query(
        `SELECT
           al.id, al.action_type, al.old_data, al.new_data,
           al.reason, al.created_at,
           u.name AS performed_by,
           p.player_name, t.team_name
         FROM auction_action_logs al
         LEFT JOIN users u ON u.id = al.performed_by_user_id
         LEFT JOIN players p ON p.id = al.player_id
         LEFT JOIN teams t ON t.id = al.team_id
         WHERE al.auction_id = ?
         ORDER BY al.created_at DESC
         LIMIT 50`,
        [auctionId]
      );
      res.json(rows);
    } catch (error) {
      console.error("audit-log error", error);
      sendError(res, error);
    }
  }
);

// ── Correction ────────────────────────────────────────────────────────────────
router.post(
  "/:auctionId/correct",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  checkAuctionAccess("auctionId"),
  async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const auctionId = Number(req.params.auctionId);
      const { player_id, new_team_id, new_price, reason } = req.body;

      if (!player_id || !new_team_id || !new_price) {
        return res.status(400).json({ message: "player_id, new_team_id, and new_price are required" });
      }

      await conn.beginTransaction();

      // 1. Load current player state
      const [[player]] = await conn.query(
        `SELECT id, player_name, status, sold_team_id, sold_price FROM players
         WHERE id = ? AND auction_id = ? FOR UPDATE`,
        [player_id, auctionId]
      );
      if (!player) throw new Error("Player not found in this auction");
      if (player.status !== "SOLD") throw new Error("Only SOLD players can be corrected");

      // 2. Load new team
      const [[newTeam]] = await conn.query(
        `SELECT id, team_name, remaining_purse FROM teams
         WHERE id = ? AND auction_id = ? AND status = 'ACTIVE' FOR UPDATE`,
        [new_team_id, auctionId]
      );
      if (!newTeam) throw new Error("Target team not found");

      const oldTeamId = player.sold_team_id;
      const oldPrice = Number(player.sold_price || 0);
      const correctedPrice = Number(new_price);

      // 3. Reverse old team purse (restore what was spent)
      if (oldTeamId) {
        await conn.query(
          `UPDATE teams SET remaining_purse = remaining_purse + ? WHERE id = ? AND auction_id = ?`,
          [oldPrice, oldTeamId, auctionId]
        );
      }

      // 4. Validate new team has enough purse
      const newPurseAfter = Number(newTeam.remaining_purse) - correctedPrice;
      if (newPurseAfter < 0) throw new Error("New team does not have enough purse for this correction");

      // 5. Deduct from new team
      await conn.query(
        `UPDATE teams SET remaining_purse = remaining_purse - ? WHERE id = ? AND auction_id = ?`,
        [correctedPrice, new_team_id, auctionId]
      );

      // 6. Update player
      await conn.query(
        `UPDATE players SET sold_team_id = ?, sold_price = ?, sold_amount = ? WHERE id = ?`,
        [new_team_id, correctedPrice, correctedPrice, player_id]
      );

      // 7. Audit log
      const oldData = JSON.stringify({ team_id: oldTeamId, price: oldPrice });
      const newData = JSON.stringify({ team_id: new_team_id, price: correctedPrice });
      await conn.query(
        `INSERT INTO auction_action_logs
           (auction_id, player_id, team_id, action_type, old_data, new_data, performed_by_user_id, reason)
         VALUES (?, ?, ?, 'CORRECTION', ?, ?, ?, ?)`,
        [auctionId, player_id, new_team_id, oldData, newData, req.user.userId, reason || "Manual correction"]
      );

      await conn.commit();
      const snapshot = await loadSnapshot(auctionId);
      emitAuctionSnapshot(auctionId, snapshot, "auctionSnapshotUpdated");
      res.json({ message: "Correction applied successfully", snapshot });
    } catch (error) {
      await conn.rollback();
      console.error("correction error", error);
      sendError(res, error);
    } finally {
      conn.release();
    }
  }
);

module.exports = router;
