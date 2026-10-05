const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");
const pool = require("../config/db");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");
const { userHasAuctionAccess } = require("../middleware/accessMiddleware");
const { sendError } = require("../utils/errors");
const { processUploadedPlayerPhoto, processPlayerPhotoUrl } = require("../utils/playerPhotoProcessor");

const router = express.Router();
const upload = multer({ dest: "src/uploads/" });

const playerPhotoDir = path.join(__dirname, "..", "uploads", "players");
fs.mkdirSync(playerPhotoDir, { recursive: true });

const allowedImageTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/octet-stream", // Some browsers send HEIC as octet-stream
];

const photoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const isAllowedExt = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"].includes(ext);
    const isAllowedMime = allowedImageTypes.includes(String(file.mimetype || "").toLowerCase());
    if (isAllowedExt || isAllowedMime) return cb(null, true);
    cb(new Error("Only JPG, PNG, WEBP, HEIC or HEIF images are allowed"));
  },
  limits: { fileSize: 15 * 1024 * 1024 },
});

async function assertAuctionAccess(req, res, auctionId) {
  const hasAccess = await userHasAuctionAccess(req.user, Number(auctionId));
  if (!hasAccess) {
    res.status(403).json({ message: "You do not have access to this auction" });
    return false;
  }
  return true;
}

function normalizeRole(role) {
  return String(role || "OTHER").trim() || "OTHER";
}

function clean(value) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text || null;
}

function normalizeMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function getAuctionOrganizationId(conn, auctionId) {
  const [[auction]] = await conn.query(`SELECT organization_id FROM auctions WHERE id = ?`, [auctionId]);
  if (!auction) throw new Error("Auction not found");
  return auction.organization_id;
}

async function upsertOrgPlayer(conn, organizationId, data) {
  const playerName = clean(data.player_name);
  const mobile = clean(data.player_mobile || data.mobile);
  const normalizedMobile = normalizeMobile(mobile);
  const email = clean(data.player_email || data.email);
  const area = clean(data.area);
  const role = clean(data.player_role || data.default_role);
  const tshirtSize = clean(data.tshirt_size || data.default_tshirt_size);
  const photoUrl = clean(data.photo_url);
  const originalPhotoUrl = clean(data.original_photo_url);
  const photoProcessingStatus = clean(data.photo_processing_status);
  const photoProcessingMode = clean(data.photo_processing_mode);
  const photoSource = clean(data.photo_source) || null;
  const source = clean(data.source) || "MANUAL";
  const serialNumber = clean(data.serial_number);

  if (!playerName) throw new Error("Player name is required");

  let existing = null;

  if (normalizedMobile) {
    const [rows] = await conn.query(
      `SELECT * FROM org_players WHERE organization_id = ? AND normalized_mobile = ? LIMIT 1`,
      [organizationId, normalizedMobile]
    );
    existing = rows[0] || null;
  }

  if (!existing && email) {
    const [rows] = await conn.query(
      `SELECT * FROM org_players WHERE organization_id = ? AND email = ? LIMIT 1`,
      [organizationId, email]
    );
    existing = rows[0] || null;
  }

  if (existing) {
    await conn.query(
      `UPDATE org_players
       SET player_name = COALESCE(?, player_name),
           mobile = COALESCE(?, mobile),
           normalized_mobile = COALESCE(?, normalized_mobile),
           email = COALESCE(?, email),
           area = COALESCE(?, area),
           default_role = COALESCE(?, default_role),
           default_tshirt_size = COALESCE(?, default_tshirt_size),
           photo_url = CASE WHEN ? IS NOT NULL THEN ? ELSE photo_url END,
           original_photo_url = CASE WHEN ? IS NOT NULL THEN ? ELSE original_photo_url END,
           photo_source = CASE WHEN ? IS NOT NULL THEN ? ELSE photo_source END,
           photo_processing_status = CASE WHEN ? IS NOT NULL THEN ? ELSE photo_processing_status END,
           photo_processing_mode = CASE WHEN ? IS NOT NULL THEN ? ELSE photo_processing_mode END,
           photo_updated_at = CASE WHEN ? IS NOT NULL THEN NOW() ELSE photo_updated_at END,
           serial_number = COALESCE(?, serial_number),
           updated_at = NOW()
       WHERE id = ?`,
      [
        playerName,
        mobile,
        normalizedMobile,
        email,
        area,
        role,
        tshirtSize,
        photoUrl,
        photoUrl,
        originalPhotoUrl,
        originalPhotoUrl,
        photoUrl,
        photoSource,
        photoUrl,
        photoProcessingStatus,
        photoUrl,
        photoProcessingMode,
        photoUrl,
        serialNumber,
        existing.id,
      ]
    );


    const [[updated]] = await conn.query(`SELECT * FROM org_players WHERE id = ?`, [existing.id]);
    return updated;
  }

  const [result] = await conn.query(
    `INSERT INTO org_players
     (organization_id, player_name, mobile, normalized_mobile, email, area, default_role,
      default_tshirt_size, photo_url, original_photo_url, photo_source, photo_processing_status,
      photo_processing_mode, photo_updated_at, created_source, serial_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NOT NULL THEN NOW() ELSE NULL END, ?, ?)`,
    [
      organizationId,
      playerName,
      mobile,
      normalizedMobile,
      email,
      area,
      role,
      tshirtSize,
      photoUrl,
      originalPhotoUrl,
      photoSource,
      photoProcessingStatus,
      photoProcessingMode,
      photoUrl,
      source,
      serialNumber,
    ]
  );

  const [[created]] = await conn.query(`SELECT * FROM org_players WHERE id = ?`, [result.insertId]);
  return created;
}

router.post(
  "/upload-photo",
  authMiddleware,
  requireRole("AUCTION_ADMIN", "SUPER_ADMIN"),
  photoUpload.single("photo"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "Photo file is required" });

      const processed = await processUploadedPlayerPhoto(req, req.file);

      res.json({
        message: "Player photo uploaded and face-focused image created successfully",
        ...processed,
      });
    } catch (error) {
      console.error("upload player photo error", error);
      sendError(res, error);
    }
  }
);

router.get("/auction/:auctionId", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  try {
    const auctionId = Number(req.params.auctionId);
    if (!(await assertAuctionAccess(req, res, auctionId))) return;

    const [rows] = await pool.query(
      `SELECT p.*, 
              COALESCE(op.photo_url, p.photo_url) AS photo_url,
              op.id AS master_player_id,
              op.photo_url AS master_photo_url,
              t.team_name AS sold_team_name
       FROM players p
       LEFT JOIN org_players op ON op.id = p.org_player_id
       LEFT JOIN teams t ON t.id = p.sold_team_id
       WHERE p.auction_id = ?
       ORDER BY p.id`,
      [auctionId]
    );

    res.json(rows);
  } catch (error) {
    console.error("list players error", error);
    sendError(res, error);
  }
});

router.post("/", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      auction_id,
      player_name,
      player_mobile,
      player_email,
      category,
      player_role,
      base_price,
      tshirt_size,
      age,
      area,
      previous_team,
      photo_url,
      original_photo_url,
      photo_processing_status,
      photo_processing_mode,
      serial_number,
    } = req.body;

    if (!auction_id || !player_name) {
      return res.status(400).json({ message: "auction_id and player_name are required" });
    }

    if (!(await assertAuctionAccess(req, res, Number(auction_id)))) return;

    const price = Number(base_price || 0);
    if (price < 0) return res.status(400).json({ message: "Base price cannot be negative" });

    await conn.beginTransaction();
    const organizationId = await getAuctionOrganizationId(conn, Number(auction_id));
    const orgPlayer = await upsertOrgPlayer(conn, organizationId, {
      player_name,
      player_mobile,
      player_email,
      player_role,
      tshirt_size,
      area,
      photo_url,
      original_photo_url,
      photo_processing_status,
      photo_processing_mode,
      photo_source: photo_url ? "MANUAL" : null,
      source: "MANUAL",
      serial_number,
    });

    const latestPhotoUrl = clean(photo_url) || orgPlayer.photo_url || null;

    const [result] = await conn.query(
      `INSERT INTO players
       (auction_id, organization_id, org_player_id, player_name, player_mobile, normalized_mobile, player_email,
        category, player_role, base_price, tshirt_size, age, area, previous_team, photo_url, registration_source, status, serial_number, player_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'AVAILABLE', ?, ?)`,
      [
        auction_id,
        organizationId,
        orgPlayer.id,
        clean(player_name),
        clean(player_mobile),
        normalizeMobile(player_mobile),
        clean(player_email),
        clean(category),
        normalizeRole(player_role),
        price,
        clean(tshirt_size),
        age || null,
        clean(area),
        clean(previous_team),
        latestPhotoUrl,
        clean(serial_number),
        clean(req.body.player_info),
      ]
    );

    await conn.commit();
    res.json({ message: "Player created", player_id: result.insertId, org_player_id: orgPlayer.id, photo_url: latestPhotoUrl });
  } catch (error) {
    await conn.rollback();
    console.error("create player error", error);
    sendError(res, error);
  } finally {
    conn.release();
  }
});

router.put("/:playerId", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { playerId } = req.params;
    const {
      player_name,
      player_mobile,
      player_email,
      category,
      player_role,
      base_price,
      tshirt_size,
      age,
      area,
      previous_team,
      photo_url,
      original_photo_url,
      photo_processing_status,
      photo_processing_mode,
      status,
      serial_number,
    } = req.body;

    if (!player_name) return res.status(400).json({ message: "player_name is required" });

    const [existingRows] = await pool.query(`SELECT * FROM players WHERE id = ?`, [playerId]);
    if (existingRows.length === 0) return res.status(404).json({ message: "Player not found" });

    const existing = existingRows[0];
    if (!(await assertAuctionAccess(req, res, Number(existing.auction_id)))) return;

    await conn.beginTransaction();

    const organizationId = existing.organization_id || (await getAuctionOrganizationId(conn, Number(existing.auction_id)));
    const orgPlayer = await upsertOrgPlayer(conn, organizationId, {
      player_name,
      player_mobile,
      player_email,
      player_role,
      tshirt_size,
      area,
      photo_url,
      original_photo_url,
      photo_processing_status,
      photo_processing_mode,
      photo_source: photo_url ? "MANUAL" : null,
      source: "MANUAL",
      serial_number,
    });

    const latestPhotoUrl = clean(photo_url) || orgPlayer.photo_url || existing.photo_url || null;

    await conn.query(
      `UPDATE players
       SET organization_id = ?, org_player_id = ?, player_name = ?, player_mobile = ?, normalized_mobile = ?,
           player_email = ?, category = ?, player_role = ?, base_price = ?, tshirt_size = ?, age = ?,
           area = ?, previous_team = ?, photo_url = ?, status = ?, serial_number = ?, player_info = ?
       WHERE id = ?`,
      [
        organizationId,
        orgPlayer.id,
        clean(player_name),
        clean(player_mobile),
        normalizeMobile(player_mobile),
        clean(player_email),
        clean(category),
        normalizeRole(player_role),
        Number(base_price || 0),
        clean(tshirt_size),
        age || null,
        clean(area),
        clean(previous_team),
        latestPhotoUrl,
        status || existing.status || "AVAILABLE",
        clean(serial_number),
        clean(req.body.player_info),
        playerId,
      ]
    );

    await conn.commit();
    res.json({ message: "Player updated successfully", org_player_id: orgPlayer.id, photo_url: latestPhotoUrl });
  } catch (error) {
    await conn.rollback();
    console.error("update player error", error);
    sendError(res, error);
  } finally {
    conn.release();
  }
});

router.post("/upload/:auctionId", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), upload.single("file"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const auctionId = Number(req.params.auctionId);
    if (!(await assertAuctionAccess(req, res, auctionId))) return;
    if (!req.file) return res.status(400).json({ message: "Excel file is required" });

    const organizationId = await getAuctionOrganizationId(conn, auctionId);
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    await conn.beginTransaction();

    const [batchResult] = await conn.query(
      `INSERT INTO import_batches
       (organization_id, auction_id, source_type, source_name, file_name, total_rows, imported_by_user_id)
       VALUES (?, ?, 'EXCEL', ?, ?, ?, ?)`,
      [organizationId, auctionId, sheetName, req.file.originalname, rows.length, req.user.userId]
    );

    const importBatchId = batchResult.insertId;
    let inserted = 0;
    let failed = 0;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      try {
        const playerName = clean(row["Player Name"] || row.player_name || row.Name || row.name);
        if (!playerName) throw new Error("Player Name is required");

        const mobile = clean(row.Mobile || row.mobile || row.player_mobile || row["Mobile Number"]);
        const email = clean(row.Email || row.email || row.player_email);
        const category = clean(row.Category || row.category);
        const role = normalizeRole(row.Role || row.player_role || row["Player Role"]);
        const basePrice = Number(row["Base Price"] || row.base_price || 0);
        const tshirtSize = clean(row["T-shirt Size"] || row["Tshirt Size"] || row.tshirt_size || row.Size);
        const age = row.Age || row.age || null;
        const area = clean(row.Area || row.area);
        const previousTeam = clean(row["Previous Team"] || row.previous_team);
        const playerInfo = clean(row["Player Info"] || row["Rich Text Info"] || row.player_info);
        const serialNumber = clean(row["Serial Number"] || row["Serial No"] || row.serial_number || row.id || row.Id);
        const rawPhotoUrl = clean(row["Photo URL"] || row["Photo"] || row.photo_url || row.photo);
        let photoUrl = rawPhotoUrl;
        let originalPhotoUrl = null;
        let photoProcessingStatus = rawPhotoUrl ? "URL_NOT_PROCESSED" : null;
        let photoProcessingMode = null;

        if (rawPhotoUrl && /^https?:\/\//i.test(rawPhotoUrl)) {
          try {
            const processedPhoto = await processPlayerPhotoUrl(req, rawPhotoUrl);
            photoUrl = processedPhoto.photo_url;
            originalPhotoUrl = processedPhoto.original_photo_url;
            photoProcessingStatus = processedPhoto.photo_processing_status;
            photoProcessingMode = processedPhoto.photo_processing_mode;
          } catch (photoError) {
            // Keep the external URL instead of failing the player row. Import errors are for player data errors.
            console.warn("Photo URL processing skipped:", rawPhotoUrl, photoError.message);
          }
        }

        const orgPlayer = await upsertOrgPlayer(conn, organizationId, {
          player_name: playerName,
          player_mobile: mobile,
          player_email: email,
          player_role: role,
          tshirt_size: tshirtSize,
          area,
          photo_url: photoUrl,
          original_photo_url: originalPhotoUrl,
          photo_processing_status: photoProcessingStatus,
          photo_processing_mode: photoProcessingMode,
          photo_source: photoUrl ? (originalPhotoUrl ? "EXCEL_URL_PROCESSED" : "EXCEL_URL") : null,
          source: "EXCEL",
          serial_number: serialNumber,
        });

        const latestPhotoUrl = photoUrl || orgPlayer.photo_url || null;

        await conn.query(
          `INSERT INTO players
           (auction_id, organization_id, org_player_id, player_name, player_mobile, normalized_mobile, player_email,
            category, player_role, base_price, tshirt_size, age, area, previous_team, photo_url,
            registration_source, import_batch_id, status, serial_number, player_info)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EXCEL', ?, 'AVAILABLE', ?, ?)`,
          [
            auctionId,
            organizationId,
            orgPlayer.id,
            playerName,
            mobile,
            normalizeMobile(mobile),
            email,
            category,
            role,
            basePrice,
            tshirtSize,
            age,
            area,
            previousTeam,
            latestPhotoUrl,
            importBatchId,
            serialNumber,
            playerInfo,
          ]
        );

        inserted += 1;
      } catch (rowError) {
        failed += 1;
        await conn.query(
          `INSERT INTO import_batch_errors (import_batch_id, \`row_number\`, raw_data, error_message)
           VALUES (?, ?, ?, ?)`,
          [importBatchId, index + 2, JSON.stringify(row), rowError.message]
        );
      }
    }

    await conn.query(
      `UPDATE import_batches SET success_rows = ?, failed_rows = ? WHERE id = ?`,
      [inserted, failed, importBatchId]
    );

    await conn.commit();

    res.json({
      message: failed ? "Players uploaded with some errors" : "Players uploaded successfully",
      count: inserted,
      failed,
      import_batch_id: importBatchId,
    });
  } catch (error) {
    await conn.rollback();
    console.error("upload players error", error);
    sendError(res, error);
  } finally {
    conn.release();
  }
});


router.get("/:playerId/history", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  try {
    const playerId = Number(req.params.playerId);
    const [[player]] = await pool.query(`SELECT id, auction_id FROM players WHERE id = ?`, [playerId]);
    if (!player) return res.status(404).json({ message: "Player not found" });
    if (!(await assertAuctionAccess(req, res, Number(player.auction_id)))) return;

    const [actions] = await pool.query(
      `SELECT id, action_type, old_data, new_data, reason, performed_by_user_id, created_at
       FROM auction_action_logs
       WHERE player_id = ?
       ORDER BY id DESC
       LIMIT 100`,
      [playerId]
    );

    const [attempts] = await pool.query(
      `SELECT pa.*, t.team_name
       FROM player_auction_attempts pa
       LEFT JOIN teams t ON t.id = pa.team_id
       WHERE pa.player_id = ?
       ORDER BY pa.id DESC
       LIMIT 100`,
      [playerId]
    );

    const [bids] = await pool.query(
      `SELECT b.id, b.bid_amount, b.created_at, t.team_name
       FROM bids b
       LEFT JOIN teams t ON t.id = b.team_id
       WHERE b.player_id = ?
       ORDER BY b.id DESC
       LIMIT 100`,
      [playerId]
    );

    res.json({ actions, attempts, bids });
  } catch (error) {
    console.error("player history error", error);
    sendError(res, error);
  }
});

router.patch("/:playerId/correction", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const playerId = Number(req.params.playerId);
    const {
      status,
      sold_team_id,
      sold_price,
      auction_round,
      category,
      player_role,
      base_price,
      tshirt_size,
      reason,
      increment_unsold,
    } = req.body;

    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: "Reason is required for correction" });
    }

    await conn.beginTransaction();

    const [[player]] = await conn.query(`SELECT * FROM players WHERE id = ? FOR UPDATE`, [playerId]);
    if (!player) {
      await conn.rollback();
      return res.status(404).json({ message: "Player not found" });
    }

    if (!(await assertAuctionAccess(req, res, Number(player.auction_id)))) {
      await conn.rollback();
      return;
    }

    const oldData = {
      status: player.status,
      sold_team_id: player.sold_team_id,
      sold_price: player.sold_price,
      category: player.category,
      player_role: player.player_role,
      base_price: player.base_price,
      auction_round: player.auction_round,
      unsold_count: player.unsold_count,
    };

    const newStatus = status || player.status || "AVAILABLE";
    const newRound = auction_round || (newStatus === "UNSOLD" ? "UNSOLD" : player.auction_round || "MAIN");
    const newPrice = Number(sold_price || 0);
    const newTeamId = sold_team_id ? Number(sold_team_id) : null;

    if (player.status === "SOLD" && player.sold_team_id && Number(player.sold_price || 0) > 0) {
      await conn.query(`UPDATE teams SET remaining_purse = remaining_purse + ? WHERE id = ?`, [Number(player.sold_price || 0), player.sold_team_id]);
    }

    let soldAtSql = "NULL";
    let finalUnsoldAtSql = "final_unsold_at";
    let lastUnsoldAtSql = "last_unsold_at";
    let unsoldIncrement = 0;

    if (newStatus === "SOLD") {
      if (!newTeamId) throw new Error("sold_team_id is required when status is SOLD");
      if (newPrice <= 0) throw new Error("sold_price must be greater than zero when status is SOLD");

      const [[team]] = await conn.query(
        `SELECT id, remaining_purse FROM teams WHERE id = ? AND auction_id = ? FOR UPDATE`,
        [newTeamId, player.auction_id]
      );
      if (!team) throw new Error("Selected team not found in this auction");
      if (Number(team.remaining_purse || 0) < newPrice) throw new Error("Selected team does not have enough remaining purse");

      await conn.query(`UPDATE teams SET remaining_purse = remaining_purse - ? WHERE id = ?`, [newPrice, newTeamId]);
      soldAtSql = "COALESCE(sold_at, NOW())";
    } else if (newStatus === "UNSOLD") {
      lastUnsoldAtSql = "NOW()";
      unsoldIncrement = increment_unsold === false ? 0 : (player.status === "UNSOLD" ? 0 : 1);
    } else if (newStatus === "FINAL_UNSOLD") {
      finalUnsoldAtSql = "NOW()";
      lastUnsoldAtSql = "COALESCE(last_unsold_at, NOW())";
    }

    await conn.query(
      `UPDATE players
       SET status = ?,
           sold_team_id = ?,
           sold_price = ?,
           sold_at = ${soldAtSql},
           auction_round = ?,
           unsold_count = COALESCE(unsold_count, 0) + ?,
           last_unsold_at = ${lastUnsoldAtSql},
           final_unsold_at = ${finalUnsoldAtSql},
           category = COALESCE(?, category),
           player_role = COALESCE(?, player_role),
           base_price = COALESCE(?, base_price),
           tshirt_size = COALESCE(?, tshirt_size)
       WHERE id = ?`,
      [
        newStatus,
        newStatus === "SOLD" ? newTeamId : null,
        newStatus === "SOLD" ? newPrice : 0,
        newRound,
        unsoldIncrement,
        clean(category),
        clean(player_role),
        base_price === undefined || base_price === null || base_price === "" ? null : Number(base_price),
        clean(tshirt_size),
        playerId,
      ]
    );

    const [[updated]] = await conn.query(`SELECT * FROM players WHERE id = ?`, [playerId]);

    await conn.query(
      `INSERT INTO auction_action_logs
       (auction_id, player_id, team_id, action_type, old_data, new_data, performed_by_user_id, reason)
       VALUES (?, ?, ?, 'PLAYER_CORRECTION', CAST(? AS JSON), CAST(? AS JSON), ?, ?)`,
      [
        player.auction_id,
        playerId,
        newStatus === "SOLD" ? newTeamId : null,
        JSON.stringify(oldData),
        JSON.stringify({
          status: updated.status,
          sold_team_id: updated.sold_team_id,
          sold_price: updated.sold_price,
          category: updated.category,
          player_role: updated.player_role,
          base_price: updated.base_price,
          auction_round: updated.auction_round,
          unsold_count: updated.unsold_count,
        }),
        req.user.userId,
        reason,
      ]
    );

    await conn.query(
      `INSERT INTO player_auction_attempts
       (auction_id, player_id, team_id, attempt_type, attempt_no, result, bid_amount, created_by_user_id, reason)
       VALUES (?, ?, ?, ?, COALESCE(?, 0) + 1, ?, ?, ?, ?)`,
      [
        player.auction_id,
        playerId,
        newStatus === "SOLD" ? newTeamId : null,
        newRound || "MAIN",
        player.unsold_count || 0,
        newStatus,
        newStatus === "SOLD" ? newPrice : 0,
        req.user.userId,
        reason,
      ]
    );

    await conn.commit();
    res.json({ message: "Player correction saved", player: updated });
  } catch (error) {
    await conn.rollback();
    console.error("player correction error", error);
    sendError(res, error);
  } finally {
    conn.release();
  }
});

module.exports = router;
