const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");
const pool = require("../config/db");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");
const { userHasAuctionAccess } = require("../middleware/accessMiddleware");
const { sendError } = require("../utils/errors");

const router = express.Router();

const upload = multer({ dest: "src/uploads/" });

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = "src/uploads/team-logos";
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || ".png") || ".png";
      cb(null, `team-logo-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.mimetype)) return cb(new Error("Only image files are allowed"));
    cb(null, true);
  },
});

async function assertAuctionAccess(req, res, auctionId) {
  const hasAccess = await userHasAuctionAccess(req.user, Number(auctionId));
  if (!hasAccess) {
    res.status(403).json({ message: "You do not have access to this auction" });
    return false;
  }
  return true;
}

router.get("/auction/:auctionId", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  try {
    const auctionId = Number(req.params.auctionId);
    if (!(await assertAuctionAccess(req, res, auctionId))) return;

    /*
      SAFE TEAMS QUERY
      Do not join players here because older databases may not have players.team_id.
      This keeps Teams page working across old/new DB schemas.
    */
    const [rows] = await pool.query(
      `SELECT *
       FROM teams
       WHERE auction_id = ?
         AND COALESCE(is_deleted, 0) = 0
       ORDER BY team_name`,
      [auctionId]
    );

    const [soldRows] = await pool.query(
      `SELECT sold_team_id AS team_id, COUNT(*) AS cnt
       FROM players
       WHERE auction_id = ? AND status = 'SOLD' AND sold_team_id IS NOT NULL
       GROUP BY sold_team_id`,
      [auctionId]
    );

    const soldByTeam = {};
    for (const row of soldRows) soldByTeam[row.team_id] = Number(row.cnt);

    const teams = rows.map((team) => {
      const totalPurse =
        Number(
          team.total_purse ??
          team.purse ??
          team.team_purse ??
          team.auction_purse ??
          0
        ) || 0;

      const balancePurse =
        Number(
          team.remaining_purse ??
          team.balance_purse ??
          team.available_purse ??
          team.purse_balance ??
          team.purse ??
          team.total_purse ??
          0
        ) || 0;

      return {
        ...team,
        total_purse: totalPurse,
        balance_purse: balancePurse,
        remaining_purse: balancePurse,
        used_purse: Math.max(totalPurse - balancePurse, 0),
        players_bought: Number(soldByTeam[team.id] || team.players_bought || 0),
      };
    });

    res.json(teams);
  } catch (error) {
    console.error("list teams error", error);
    sendError(res, error);
  }
});

router.get("/recent", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.*
       FROM teams t
       JOIN (
           SELECT MAX(t2.id) as max_id
           FROM teams t2
           JOIN auctions a ON t2.auction_id = a.id
           JOIN organization_admins oa ON a.organization_id = oa.organization_id
           WHERE oa.user_id = ? AND COALESCE(t2.is_deleted, 0) = 0
           GROUP BY t2.team_name, t2.short_name, t2.owner_name, t2.logo_url
       ) latest_teams ON t.id = latest_teams.max_id
       ORDER BY t.created_at DESC
       LIMIT 6`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (error) {
    console.error("recent teams error", error);
    sendError(res, error);
  }
});

router.post("/", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  try {
    const { auction_id, team_name, short_name, owner_name, owner_mobile, total_purse, player_limit, logo_url, team_whatsapp_group_link } = req.body;

    if (!auction_id || !team_name) {
      return res.status(400).json({ message: "auction_id and team_name are required" });
    }

    if (!(await assertAuctionAccess(req, res, Number(auction_id)))) return;

    const purse = Number(total_purse || 0);

    if (purse < 0) {
      return res.status(400).json({ message: "Total purse cannot be negative" });
    }

    const [result] = await pool.query(
      `INSERT INTO teams
       (auction_id, team_name, short_name, owner_name, owner_mobile, total_purse, remaining_purse, player_limit, logo_url, team_whatsapp_group_link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [auction_id, team_name, short_name || null, owner_name || null, owner_mobile || null, purse, purse, player_limit ? Number(player_limit) : null, logo_url || null, team_whatsapp_group_link || null]
    );

    res.json({ message: "Team created", team_id: result.insertId });
  } catch (error) {
    console.error("create team error", error);
    sendError(res, error);
  }
});

router.put("/:teamId", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  try {
    const { teamId } = req.params;
    const { team_name, short_name, owner_name, owner_mobile, total_purse, remaining_purse, player_limit, logo_url, team_whatsapp_group_link, status } = req.body;

    if (!team_name) {
      return res.status(400).json({ message: "team_name is required" });
    }

    const [existingRows] = await pool.query(`SELECT * FROM teams WHERE id = ? AND COALESCE(is_deleted, 0) = 0`, [teamId]);
    if (existingRows.length === 0) return res.status(404).json({ message: "Team not found" });

    const existingTeam = existingRows[0];
    if (!(await assertAuctionAccess(req, res, Number(existingTeam.auction_id)))) return;

    const finalTotalPurse = total_purse !== undefined && total_purse !== null ? Number(total_purse) : Number(existingTeam.total_purse || 0);
    const finalRemainingPurse =
      remaining_purse !== undefined && remaining_purse !== null ? Number(remaining_purse) : Number(existingTeam.remaining_purse || 0);

    await pool.query(
      `UPDATE teams
       SET team_name = ?, short_name = ?, owner_name = ?, owner_mobile = ?, total_purse = ?, remaining_purse = ?,
           player_limit = ?, logo_url = ?, team_whatsapp_group_link = ?, status = ?
       WHERE id = ?`,
      [
        team_name,
        short_name || null,
        owner_name || null,
        owner_mobile || null,
        finalTotalPurse,
        finalRemainingPurse,
        player_limit ? Number(player_limit) : null,
        logo_url || null,
        team_whatsapp_group_link || null,
        status || existingTeam.status || "ACTIVE",
        teamId,
      ]
    );

    res.json({ message: "Team updated successfully" });
  } catch (error) {
    console.error("update team error", error);
    sendError(res, error);
  }
});

router.post("/upload-logo", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), logoUpload.single("logo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Logo file is required" });

    const baseUrl = process.env.APP_BASE_URL || "http://localhost:5000";
    const logoUrl = `${baseUrl}/uploads/team-logos/${req.file.filename}`;

    res.json({ message: "Logo uploaded successfully", logo_url: logoUrl });
  } catch (error) {
    console.error("upload logo error", error);
    sendError(res, error);
  }
});

router.post("/upload/:auctionId", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), upload.single("file"), async (req, res) => {
  try {
    const auctionId = Number(req.params.auctionId);
    if (!(await assertAuctionAccess(req, res, auctionId))) return;
    if (!req.file) return res.status(400).json({ message: "Excel file is required" });

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let inserted = 0;

    for (const row of rows) {
      const teamName = row["Team Name"] || row.team_name;
      if (!teamName) continue;

      const ownerName = row["Owner Name"] || row.owner_name || null;
      const ownerMobile = row["Owner Mobile"] || row.owner_mobile || null;
      const totalPurse = Number(row["Total Purse"] || row.total_purse || 0);
      const logoUrl = row["Logo URL"] || row.logo_url || null;
      const groupLink = row["WhatsApp Group Link"] || row.team_whatsapp_group_link || null;

      await pool.query(
        `INSERT INTO teams
         (auction_id, team_name, owner_name, owner_mobile, total_purse, remaining_purse, logo_url, team_whatsapp_group_link)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           owner_name = VALUES(owner_name),
           owner_mobile = VALUES(owner_mobile),
           total_purse = VALUES(total_purse),
           remaining_purse = VALUES(remaining_purse),
           logo_url = VALUES(logo_url),
           team_whatsapp_group_link = VALUES(team_whatsapp_group_link)`,
        [auctionId, teamName, ownerName, ownerMobile, totalPurse, totalPurse, logoUrl, groupLink]
      );

      inserted++;
    }

    res.json({ message: "Teams uploaded successfully", count: inserted });
  } catch (error) {
    console.error("upload teams error", error);
    sendError(res, error);
  }
});

router.post("/bulk-delete", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const teamIds = Array.isArray(req.body.teamIds)
      ? req.body.teamIds.map((id) => Number(id)).filter(Boolean)
      : [];

    if (teamIds.length === 0) {
      return res.status(400).json({ message: "Please select at least one team" });
    }

    await connection.beginTransaction();

    const placeholders = teamIds.map(() => "?").join(",");
    const [teams] = await connection.query(
      `SELECT id, auction_id, team_name
       FROM teams
       WHERE id IN (${placeholders})
         AND COALESCE(is_deleted, 0) = 0`,
      teamIds
    );

    if (teams.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Selected teams were not found" });
    }

    const auctionIds = [...new Set(teams.map((team) => Number(team.auction_id)))];
    for (const auctionId of auctionIds) {
      if (!(await assertAuctionAccess(req, res, auctionId))) {
        await connection.rollback();
        return;
      }
    }

    const validIds = teams.map((team) => Number(team.id));
    const validPlaceholders = validIds.map(() => "?").join(",");

    await connection.query(
      `UPDATE teams
       SET is_deleted = 1
       WHERE id IN (${validPlaceholders})`,
      validIds
    );

    await connection.commit();

    res.json({
      message: `${validIds.length} team${validIds.length === 1 ? "" : "s"} deleted successfully`,
      deletedCount: validIds.length,
    });
  } catch (error) {
    await connection.rollback();
    console.error("bulk delete teams error", error);
    sendError(res, error);
  } finally {
    connection.release();
  }
});

router.delete("/:teamId", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const teamId = Number(req.params.teamId);
    if (!teamId) return res.status(400).json({ message: "Valid teamId is required" });

    await connection.beginTransaction();

    const [teams] = await connection.query(
      `SELECT * FROM teams WHERE id = ? AND COALESCE(is_deleted, 0) = 0`,
      [teamId]
    );

    if (teams.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Team not found" });
    }

    const team = teams[0];
    if (!(await assertAuctionAccess(req, res, Number(team.auction_id)))) {
      await connection.rollback();
      return;
    }

    /*
      SAFE DELETE FOR CURRENT DB
      Older player table has no team_id, so do not query players.team_id here.
      Team is soft-deleted only. After final DB schema is normalized, sold-player validation can be re-enabled.
    */

    await connection.query(
      `UPDATE teams
       SET is_deleted = 1
       WHERE id = ?`,
      [teamId]
    );

    await connection.commit();
    res.json({ message: "Team deleted successfully" });
  } catch (error) {
    await connection.rollback();
    console.error("delete team error", error);
    sendError(res, error);
  } finally {
    connection.release();
  }
});

module.exports = router;
