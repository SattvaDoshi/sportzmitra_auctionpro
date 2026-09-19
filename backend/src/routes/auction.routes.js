const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("../config/db");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");
const { userHasAuctionAccess } = require("../middleware/accessMiddleware");
const { createSlug, createAuctionCode } = require("../utils/slug");
const { mapDashboard } = require("../utils/spResults");
const { sendError } = require("../utils/errors");

const router = express.Router();

const auctionLogoDir = path.join(__dirname, "../uploads/auction-logos");
fs.mkdirSync(auctionLogoDir, { recursive: true });

const auctionLogoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, auctionLogoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"].includes(ext) ? ext : ".jpg";
    cb(null, `auction-logo-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const auctionLogoUpload = multer({
  storage: auctionLogoStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
    const allowedExt = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"];
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (allowedTypes.includes(file.mimetype) || allowedExt.includes(ext)) return cb(null, true);
    cb(new Error("Only image files are allowed"));
  },
});

function getBaseUrl(req) {
  const configured = process.env.PUBLIC_API_BASE_URL || process.env.API_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

async function userHasOrganizationAccess(user, organizationId) {
  if (user.role === "SUPER_ADMIN") return true;
  const [rows] = await pool.query(
    `SELECT id FROM organization_admins
     WHERE organization_id = ?
       AND user_id = ?
       AND status = 'ACTIVE'
     LIMIT 1`,
    [organizationId, user.userId]
  );
  return rows.length > 0;
}

function normalizeAuctionType(value) {
  const next = String(value || "GENERAL").toUpperCase();
  if (["CATEGORY", "CATEGORY_WISE", "CATEGORYWISE"].includes(next)) return "CATEGORY_WISE";
  return "GENERAL";
}

function normalizeFlow(auctionType, flow) {
  const type = normalizeAuctionType(auctionType);
  if (type === "GENERAL") return "GENERAL";
  const next = String(flow || "CATEGORY_UNSOLD_AFTER_EACH_CATEGORY").toUpperCase();
  if (["CATEGORY_WISE_UNSOLD_AT_END", "CATEGORY_UNSOLD_AT_END"].includes(next)) return "CATEGORY_UNSOLD_AT_END";
  return "CATEGORY_UNSOLD_AFTER_EACH_CATEGORY";
}

function normalizeCategories(rawCategories) {
  const categories = Array.isArray(rawCategories) ? rawCategories : [];
  return categories
    .map((item, index) => ({
      category_name: String(item.category_name || item.name || "").trim(),
      base_price: Number(item.base_price || 0),
      bid_increment: item.bid_increment === "" || item.bid_increment == null ? null : Number(item.bid_increment),
      display_order: Number(item.display_order || item.order || index + 1),
      max_players_per_team: Number(item.max_players_per_team || 0),
    }))
    .filter((item) => item.category_name);
}

async function saveAuctionCategories(conn, auctionId, categories, isCategoryWise) {
  if (!isCategoryWise) {
    await conn.query(`UPDATE auction_categories SET status = 'INACTIVE' WHERE auction_id = ?`, [auctionId]);
    return;
  }

  const normalized = normalizeCategories(categories);
  await conn.query(`UPDATE auction_categories SET status = 'INACTIVE' WHERE auction_id = ?`, [auctionId]);

  for (const category of normalized) {
    await conn.query(
      `INSERT INTO auction_categories
       (auction_id, category_name, display_order, base_price, bid_increment, max_players_per_team, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
       ON DUPLICATE KEY UPDATE
         display_order = VALUES(display_order),
         base_price = VALUES(base_price),
         bid_increment = VALUES(bid_increment),
         max_players_per_team = VALUES(max_players_per_team),
         status = 'ACTIVE',
         updated_at = NOW()`,
      [auctionId, category.category_name, category.display_order, category.base_price, category.bid_increment, category.max_players_per_team]
    );
  }
}

router.post(
  "/upload-logo",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  auctionLogoUpload.single("logo"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "Logo file is required" });
      const logoUrl = `${getBaseUrl(req)}/uploads/auction-logos/${req.file.filename}`;
      res.json({ message: "Logo uploaded successfully", logo_url: logoUrl });
    } catch (error) {
      console.error("auction logo upload error", error);
      sendError(res, error);
    }
  }
);

router.get(
  "/organization/:organizationId",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const organizationId = Number(req.params.organizationId);
      const hasAccess = await userHasOrganizationAccess(req.user, organizationId);
      if (!hasAccess) return res.status(403).json({ message: "You do not have access to this organization" });

      const [rows] = await pool.query(
        `SELECT * FROM auctions
         WHERE organization_id = ?
           AND COALESCE(is_deleted, 0) = 0
           AND COALESCE(is_active, 1) = 1
         ORDER BY id DESC`,
        [organizationId]
      );
      res.json(rows);
    } catch (error) {
      console.error("list auctions error", error);
      sendError(res, error);
    }
  }
);

router.post("/", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      organization_id,
      auction_name,
      auction_date,
      venue,
      auction_type,
      total_purse_per_team,
      players_per_team,
      min_players_per_team,
      max_players_per_team,
      default_base_price,
      minimum_bid_increment,
      logo_url,
      sponsor_banner_url,
      auction_logo_url,
      sponsor_logo_url,
      sponsor_logo_urls,
      auction_flow_type,
      category_flow,
      categories,
      settings_json,
      next_player_selection_mode,
      status,
    } = req.body;

    if (!organization_id || !auction_name) {
      return res.status(400).json({ message: "organization_id and auction_name are required" });
    }

    const hasAccess = await userHasOrganizationAccess(req.user, Number(organization_id));
    if (!hasAccess) return res.status(403).json({ message: "You do not have access to this organization" });

    const normalizedAuctionType = normalizeAuctionType(auction_type);
    const normalizedFlow = normalizeFlow(normalizedAuctionType, category_flow || auction_flow_type);
    const normalizedCategories = normalizeCategories(categories);

    if (normalizedAuctionType === "CATEGORY_WISE" && normalizedCategories.length === 0) {
      return res.status(400).json({ message: "Please add at least one category for category wise auction" });
    }

    const auctionCode = createAuctionCode();
    const publicSlug = `${createSlug(auction_name)}-${Date.now()}`;

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO auctions
       (organization_id, created_by_user_id, auction_name, auction_code, public_slug,
        auction_date, venue, auction_type, total_purse_per_team, players_per_team,
        min_players_per_team, max_players_per_team, default_base_price, minimum_bid_increment,
        logo_url, sponsor_banner_url, auction_logo_url, sponsor_logo_url, sponsor_logo_urls,
        auction_flow_type, category_flow, settings_json, next_player_selection_mode, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organization_id,
        req.user.userId,
        auction_name.trim(),
        auctionCode,
        publicSlug,
        auction_date || null,
        venue || null,
        normalizedAuctionType,
        Number(total_purse_per_team || 0),
        Number(players_per_team || max_players_per_team || min_players_per_team || 0),
        Number(players_per_team || min_players_per_team || 0),
        Number(players_per_team || max_players_per_team || 0),
        Number(default_base_price || 0),
        Number(minimum_bid_increment || 100),
        logo_url || null,
        sponsor_banner_url || null,
        auction_logo_url || logo_url || null,
        sponsor_logo_url || null,
        sponsor_logo_urls || null,
        normalizedFlow,
        normalizedAuctionType === "CATEGORY_WISE" ? normalizedFlow : null,
        settings_json ? JSON.stringify(settings_json) : null,
        next_player_selection_mode || "RANDOM_WITH_ADMIN_CONFIRM",
        ["DRAFT", "READY", "LIVE", "PAUSED", "COMPLETED"].includes(String(status || "").toUpperCase()) ? String(status).toUpperCase() : "DRAFT",
      ]
    );

    const auctionId = result.insertId;
    await saveAuctionCategories(conn, auctionId, normalizedCategories, normalizedAuctionType === "CATEGORY_WISE");

    await conn.query(
      `INSERT INTO auction_state (auction_id, state, selection_mode, current_round, current_bid_increment)
       VALUES (?, 'NOT_STARTED', ?, 'MAIN', ?)`,
      [auctionId, next_player_selection_mode || "RANDOM_WITH_ADMIN_CONFIRM", Number(minimum_bid_increment || 100)]
    );

    await conn.commit();
    res.json({ message: "Auction created", auction_id: auctionId, auction_code: auctionCode, public_slug: publicSlug });
  } catch (error) {
    await conn.rollback();
    console.error("create auction error", error);
    sendError(res, error);
  } finally {
    conn.release();
  }
});

router.get(
  "/:auctionId/dashboard",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);
      const hasAccess = await userHasAuctionAccess(req.user, auctionId);
      if (!hasAccess) return res.status(403).json({ message: "You do not have access to this auction" });

      const [resultSets] = await pool.query("CALL sp_get_auction_dashboard(?)", [auctionId]);
      const dashboard = mapDashboard(resultSets);
      if (!dashboard.auction) return res.status(404).json({ message: "Auction not found" });

      res.json({ auction: dashboard.auction, summary: { ...dashboard.teamSummary, ...dashboard.playerSummary }, state: dashboard.state });
    } catch (error) {
      console.error("dashboard error", error);
      sendError(res, error);
    }
  }
);

router.put(
  "/:auctionId",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const auctionId = Number(req.params.auctionId);
      const hasAccess = await userHasAuctionAccess(req.user, auctionId);
      if (!hasAccess) return res.status(403).json({ message: "You do not have access to this auction" });

      const {
        auction_name,
        auction_date,
        venue,
        auction_type,
        total_purse_per_team,
        players_per_team,
        min_players_per_team,
        max_players_per_team,
        default_base_price,
        minimum_bid_increment,
        auction_flow_type,
        category_flow,
        categories,
        settings_json,
        next_player_selection_mode,
        auction_logo_url,
        sponsor_logo_url,
        sponsor_logo_urls,
        status,
      } = req.body;

      if (!auction_name || !String(auction_name).trim()) {
        return res.status(400).json({ message: "Auction name is required" });
      }

      const normalizedAuctionType = normalizeAuctionType(auction_type);
      const normalizedFlow = normalizeFlow(normalizedAuctionType, category_flow || auction_flow_type);
      const normalizedCategories = normalizeCategories(categories);

      if (normalizedAuctionType === "CATEGORY_WISE" && normalizedCategories.length === 0) {
        return res.status(400).json({ message: "Please add at least one category for category wise auction" });
      }

      await conn.beginTransaction();

      const [existingRows] = await conn.query(
        `SELECT total_purse_per_team, players_per_team, default_base_price, minimum_bid_increment, status 
         FROM auctions WHERE id = ? FOR UPDATE`,
        [auctionId]
      );

      if (existingRows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ message: "Auction not found" });
      }

      const existing = existingRows[0];
      const newStatus = ["DRAFT", "READY", "LIVE", "PAUSED", "COMPLETED"].includes(String(status || "").toUpperCase()) ? String(status).toUpperCase() : existing.status;

      // Check config changes
      const changes = [];
      const newPurse = Number(total_purse_per_team || 0);
      const newPlayers = Number(players_per_team || max_players_per_team || min_players_per_team || 0);
      const newBasePrice = Number(default_base_price || 0);
      const newBidIncrement = Number(minimum_bid_increment || 100);

      if (Number(existing.total_purse_per_team) !== newPurse) changes.push({ field: "total_purse_per_team", old: existing.total_purse_per_team, new: newPurse });
      if (Number(existing.players_per_team) !== newPlayers) changes.push({ field: "players_per_team", old: existing.players_per_team, new: newPlayers });
      if (Number(existing.default_base_price) !== newBasePrice) changes.push({ field: "default_base_price", old: existing.default_base_price, new: newBasePrice });
      if (Number(existing.minimum_bid_increment) !== newBidIncrement) changes.push({ field: "minimum_bid_increment", old: existing.minimum_bid_increment, new: newBidIncrement });
      if (existing.status !== newStatus) changes.push({ field: "status", old: existing.status, new: newStatus });

      for (const change of changes) {
        await conn.query(
          `INSERT INTO auction_config_audit_logs (auction_id, changed_by_user_id, change_type, field_name, old_value, new_value)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [auctionId, req.user.userId, change.field === "status" ? "STATUS_CHANGE" : "CONFIGURATION_CHANGE", change.field, String(change.old), String(change.new)]
        );
      }

      await conn.query(
        `UPDATE auctions
         SET auction_name = ?, auction_date = ?, venue = ?, auction_type = ?,
             total_purse_per_team = ?, players_per_team = ?, min_players_per_team = ?, max_players_per_team = ?,
             default_base_price = ?, minimum_bid_increment = ?, auction_flow_type = ?, category_flow = ?,
             next_player_selection_mode = ?, auction_logo_url = ?, sponsor_logo_url = ?, sponsor_logo_urls = ?,
             settings_json = ?, status = COALESCE(?, status), updated_at = NOW()
         WHERE id = ?`,
        [
          String(auction_name).trim(),
          auction_date || null,
          venue || null,
          normalizedAuctionType,
          Number(total_purse_per_team || 0),
          Number(players_per_team || max_players_per_team || min_players_per_team || 0),
          Number(players_per_team || min_players_per_team || 0),
          Number(players_per_team || max_players_per_team || 0),
          Number(default_base_price || 0),
          Number(minimum_bid_increment || 100),
          normalizedFlow,
          normalizedAuctionType === "CATEGORY_WISE" ? normalizedFlow : null,
          next_player_selection_mode || "RANDOM_WITH_ADMIN_CONFIRM",
          auction_logo_url || null,
          sponsor_logo_url || null,
          sponsor_logo_urls || null,
          settings_json ? JSON.stringify(settings_json) : null,
          newStatus,
          auctionId,
        ]
      );

      await saveAuctionCategories(conn, auctionId, normalizedCategories, normalizedAuctionType === "CATEGORY_WISE");

      await conn.query(
        `UPDATE auction_state
         SET selection_mode = ?, current_bid_increment = COALESCE(current_bid_increment, ?)
         WHERE auction_id = ?`,
        [next_player_selection_mode || "RANDOM_WITH_ADMIN_CONFIRM", Number(minimum_bid_increment || 100), auctionId]
      );

      await conn.commit();
      res.json({ message: "Auction updated successfully" });
    } catch (error) {
      await conn.rollback();
      console.error("update auction error", error);
      sendError(res, error);
    } finally {
      conn.release();
    }
  }
);

async function setAuctionActiveState(req, res, makeActive) {
  const conn = await pool.getConnection();
  try {
    const auctionId = Number(req.params.auctionId);
    const confirmText = String(req.body?.confirm || "").toUpperCase();
    const requiredConfirm = makeActive ? "RESTORE" : "INACTIVE";

    if (confirmText !== requiredConfirm) {
      return res.status(400).json({ message: `Type ${requiredConfirm} to confirm` });
    }

    const hasAccess = await userHasAuctionAccess(req.user, auctionId);
    if (!hasAccess) return res.status(403).json({ message: "You do not have access to this auction" });

    await conn.beginTransaction();

    if (makeActive) {
      await conn.query(
        `UPDATE auctions
         SET is_active = 1,
             inactivated_at = NULL,
             inactivated_by_user_id = NULL,
             is_deleted = 0,
             deleted_at = NULL,
             deleted_by_user_id = NULL,
             updated_at = NOW()
         WHERE id = ?`,
        [auctionId]
      );

      await conn.query(
        `INSERT INTO auction_action_logs (auction_id, action_type, new_data, performed_by_user_id, reason)
         VALUES (?, 'AUCTION_RESTORED', JSON_OBJECT('auction_id', ?), ?, ?)`,
        [auctionId, auctionId, req.user.userId, req.body.reason || "Auction restored"]
      );
    } else {
      await conn.query(
        `UPDATE auctions
         SET is_active = 0,
             inactivated_at = NOW(),
             inactivated_by_user_id = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [req.user.userId, auctionId]
      );

      await conn.query(
        `INSERT INTO auction_action_logs (auction_id, action_type, new_data, performed_by_user_id, reason)
         VALUES (?, 'AUCTION_INACTIVATED', JSON_OBJECT('auction_id', ?), ?, ?)`,
        [auctionId, auctionId, req.user.userId, req.body.reason || "Auction made inactive"]
      );
    }

    await conn.commit();
    res.json({ message: makeActive ? "Auction restored successfully" : "Auction made inactive successfully" });
  } catch (error) {
    await conn.rollback();
    console.error(makeActive ? "restore auction error" : "inactive auction error", error);
    sendError(res, error);
  } finally {
    conn.release();
  }
}

router.patch(
  "/:auctionId/inactive",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  async (req, res) => setAuctionActiveState(req, res, false)
);

router.patch(
  "/:auctionId/restore",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  async (req, res) => setAuctionActiveState(req, res, true)
);

// Backward-compatible endpoint: old Delete button now performs Make Inactive, not hard delete.
router.delete(
  "/:auctionId",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    if (!req.body) req.body = {};
    if (!req.body.confirm || String(req.body.confirm).toUpperCase() === "DELETE") {
      req.body.confirm = "INACTIVE";
    }
    return setAuctionActiveState(req, res, false);
  }
);
router.get(
  "/:auctionId/categories",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);
      const hasAccess = await userHasAuctionAccess(req.user, auctionId);
      if (!hasAccess) return res.status(403).json({ message: "You do not have access to this auction" });
      const [rows] = await pool.query(
        `SELECT * FROM auction_categories WHERE auction_id = ? AND status = 'ACTIVE' ORDER BY display_order, category_name`,
        [auctionId]
      );
      res.json(rows);
    } catch (error) {
      console.error("list categories error", error);
      sendError(res, error);
    }
  }
);

router.post(
  "/:auctionId/categories",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const auctionId = Number(req.params.auctionId);
      const hasAccess = await userHasAuctionAccess(req.user, auctionId);
      if (!hasAccess) return res.status(403).json({ message: "You do not have access to this auction" });
      const categories = normalizeCategories(req.body.categories);
      if (!categories.length) return res.status(400).json({ message: "categories are required" });

      await conn.beginTransaction();
      await saveAuctionCategories(conn, auctionId, categories, true);
      await conn.commit();
      res.json({ message: "Categories saved successfully" });
    } catch (error) {
      await conn.rollback();
      console.error("save categories error", error);
      sendError(res, error);
    } finally {
      conn.release();
    }
  }
);

// ── Reports ──────────────────────────────────────────────────────────────────
router.get(
  "/:auctionId/reports",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);
      const hasAccess = await userHasAuctionAccess(req.user, auctionId);
      if (!hasAccess) return res.status(403).json({ message: "Access denied" });

      // All players with sold team info
      const [players] = await pool.query(
        `SELECT
           p.id, p.player_name, p.category, p.player_role,
           p.base_price, p.status, p.sold_price, p.sold_at,
           p.photo_url, p.unsold_count, p.auction_round,
           t.team_name AS sold_team_name, t.short_name AS sold_team_short
         FROM players p
         LEFT JOIN teams t ON t.id = p.sold_team_id
         WHERE p.auction_id = ? AND COALESCE(p.is_deleted, 0) = 0
         ORDER BY p.sold_at DESC, p.player_name ASC`,
        [auctionId]
      );

      // Team-wise report
      const [teams] = await pool.query(
        `SELECT
           t.id, t.team_name, t.short_name, t.logo_url,
           t.total_purse, t.remaining_purse,
           (t.total_purse - t.remaining_purse) AS used_purse,
           COUNT(p.id) AS players_bought,
           SUM(COALESCE(p.sold_price, 0)) AS total_spent
         FROM teams t
         LEFT JOIN players p ON p.sold_team_id = t.id AND p.status = 'SOLD'
         WHERE t.auction_id = ? AND COALESCE(t.is_deleted, 0) = 0
         GROUP BY t.id
         ORDER BY total_spent DESC`,
        [auctionId]
      );

      // Summary
      const soldPlayers = players.filter((p) => p.status === "SOLD");
      const unsoldPlayers = players.filter((p) => ["UNSOLD", "FINAL_UNSOLD"].includes(p.status));
      const pendingPlayers = players.filter((p) => ["AVAILABLE", "IN_AUCTION"].includes(p.status));
      const totalSaleValue = soldPlayers.reduce((sum, p) => sum + Number(p.sold_price || 0), 0);

      res.json({
        players,
        teams,
        summary: {
          total_players: players.length,
          sold_players: soldPlayers.length,
          unsold_players: unsoldPlayers.length,
          pending_players: pendingPlayers.length,
          total_sale_value: totalSaleValue,
        },
      });
    } catch (error) {
      console.error("reports error", error);
      sendError(res, error);
    }
  }
);

// ── Admin-wide dashboard summary ──────────────────────────────────────────────
// GET /api/auctions/admin-dashboard-summary
// Aggregates data across all orgs the logged-in admin manages and returns
// everything the Dashboard page needs in a single request.
router.get(
  "/admin-dashboard-summary",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const isSuperAdmin = req.user.role === "SUPER_ADMIN";

      // 1. Resolve which organization IDs this user can see
      let orgIds = [];
      if (isSuperAdmin) {
        const [orgs] = await pool.query(
          `SELECT id FROM organizations WHERE COALESCE(status,'ACTIVE') = 'ACTIVE'`
        );
        orgIds = orgs.map((o) => o.id);
      } else {
        const [orgs] = await pool.query(
          `SELECT organization_id AS id FROM organization_admins
           WHERE user_id = ? AND status = 'ACTIVE'`,
          [userId]
        );
        orgIds = orgs.map((o) => o.id);
      }

      if (orgIds.length === 0) {
        return res.json({
          liveAuction: null,
          stats: { activeAuctions: 0, playersSold: 0, totalSaleValue: 0, unsoldPlayers: 0 },
          upcomingAuctions: [],
          teams: [],
          recentPlayers: [],
        });
      }

      const placeholders = orgIds.map(() => "?").join(",");

      // 2. Stats — aggregate across all auctions the admin manages
      const [statsRows] = await pool.query(
        `SELECT
           COUNT(DISTINCT a.id)                                                     AS active_auctions,
           COUNT(CASE WHEN p.status = 'SOLD' THEN 1 END)                           AS players_sold,
           COALESCE(SUM(CASE WHEN p.status = 'SOLD' THEN p.sold_price END), 0)     AS total_sale_value,
           COUNT(CASE WHEN p.status IN ('UNSOLD','FINAL_UNSOLD') THEN 1 END)       AS unsold_players
         FROM auctions a
         LEFT JOIN players p ON p.auction_id = a.id AND COALESCE(p.is_deleted,0)=0
         WHERE a.organization_id IN (${placeholders})
           AND COALESCE(a.is_deleted,0) = 0
           AND COALESCE(a.is_active,1) = 1
           AND a.status IN ('LIVE','PAUSED','READY','DRAFT')`,
        orgIds
      );
      const stats = statsRows[0] || {};

      // 3. Find the "live" auction (LIVE first, then PAUSED, then latest READY)
      const [liveRows] = await pool.query(
        `SELECT
           a.id,
           a.auction_name,
           a.status,
           a.public_slug,
           s.updated_at AS started_at
         FROM auctions a
         LEFT JOIN auction_state s ON s.auction_id = a.id
         WHERE a.organization_id IN (${placeholders})
           AND COALESCE(a.is_deleted,0) = 0
           AND COALESCE(a.is_active,1) = 1
           AND a.status IN ('LIVE','PAUSED')
         ORDER BY FIELD(a.status,'LIVE','PAUSED') ASC, a.id DESC
         LIMIT 1`,
        orgIds
      );

      let liveAuction = null;

      if (liveRows.length > 0) {
        const la = liveRows[0];
        const [soldRow] = await pool.query(
          `SELECT
             COUNT(CASE WHEN status='SOLD' THEN 1 END)                     AS sold,
             COUNT(*)                                                       AS total
           FROM players
           WHERE auction_id = ? AND COALESCE(is_deleted,0) = 0`,
          [la.id]
        );
        liveAuction = {
          id: la.id,
          title: la.auction_name,
          status: la.status,
          publicSlug: la.public_slug,
          sold: soldRow[0]?.sold || 0,
          total: soldRow[0]?.total || 0,
          startedAt: la.started_at,
        };
      }

      // 4. Upcoming auctions (DRAFT or READY, ordered by auction_date)
      const [upcomingRows] = await pool.query(
        `SELECT
           a.id,
           a.auction_name,
           a.auction_date,
           a.status,
           a.auction_logo_url
         FROM auctions a
         WHERE a.organization_id IN (${placeholders})
           AND COALESCE(a.is_deleted,0) = 0
           AND COALESCE(a.is_active,1) = 1
           AND a.status IN ('DRAFT','READY')
         ORDER BY a.auction_date ASC, a.id DESC
         LIMIT 6`,
        orgIds
      );

      const upcomingAuctions = upcomingRows.map((a) => {
        const words = (a.auction_name || "").trim().split(/\s+/).filter(Boolean);
        const short =
          words.length >= 2
            ? (words[0][0] + words[1][0]).toUpperCase()
            : (a.auction_name || "AU").slice(0, 3).toUpperCase();
        let dateStr = "";
        let timeStr = "";
        if (a.auction_date) {
          const d = new Date(a.auction_date);
          dateStr = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
          timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
        }
        return {
          id: a.id,
          short,
          title: a.auction_name,
          date: dateStr,
          time: timeStr,
          status: a.status === "READY" ? "Ready" : "Draft",
          logoUrl: a.auction_logo_url || null,
        };
      });

      // 5. Team purse leaderboard — from the live auction (or latest active)
      let teams = [];
      const targetAuctionId = liveAuction?.id ?? null;

      if (targetAuctionId) {
        const [teamRows] = await pool.query(
          `SELECT
             t.id,
             t.team_name,
             t.total_purse,
             t.remaining_purse,
             t.logo_url
           FROM teams t
           WHERE t.auction_id = ?
             AND COALESCE(t.is_deleted,0) = 0
             AND t.status = 'ACTIVE'
           ORDER BY t.remaining_purse ASC
           LIMIT 10`,
          [targetAuctionId]
        );

        // Rank by remaining_purse ascending (most spent = highest rank)
        teams = teamRows.map((t, idx) => {
          const totalPurse = Number(t.total_purse) || 0;
          const remainingPurse = Number(t.remaining_purse) || 0;
          const usedPurse = totalPurse - remainingPurse;
          const percent = totalPurse > 0 ? Math.round((usedPurse / totalPurse) * 100) : 0;
          return {
            rank: idx + 1,
            id: t.id,
            name: t.team_name,
            purse: `₹${remainingPurse.toLocaleString("en-IN")}`,
            remainingPurse,
            totalPurse,
            percent,
            logoUrl: t.logo_url || null,
          };
        });
      }

      // 6. Recently sold players — from the live auction
      let recentPlayers = [];
      if (targetAuctionId) {
        const [playerRows] = await pool.query(
          `SELECT
             p.id,
             p.player_name,
             p.sold_price,
             p.sold_at,
             p.photo_url,
             t.team_name
           FROM players p
           LEFT JOIN teams t ON t.id = p.sold_team_id
           WHERE p.auction_id = ?
             AND p.status = 'SOLD'
             AND COALESCE(p.is_deleted,0) = 0
           ORDER BY p.sold_at DESC
           LIMIT 5`,
          [targetAuctionId]
        );

        recentPlayers = playerRows.map((p) => ({
          id: p.id,
          name: p.player_name,
          team: p.team_name || "—",
          amount: `₹${Number(p.sold_price || 0).toLocaleString("en-IN")}`,
          soldAt: p.sold_at,
          time: p.sold_at
            ? new Date(p.sold_at).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            : "",
          photoUrl: p.photo_url || null,
        }));
      }

      return res.json({
        liveAuction,
        stats: {
          activeAuctions: Number(stats.active_auctions || 0),
          playersSold: Number(stats.players_sold || 0),
          totalSaleValue: Number(stats.total_sale_value || 0),
          unsoldPlayers: Number(stats.unsold_players || 0),
        },
        upcomingAuctions,
        teams,
        recentPlayers,
      });
    } catch (error) {
      console.error("admin-dashboard-summary error", error);
      sendError(res, error);
    }
  }
);

module.exports = router;
