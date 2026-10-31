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
const { emitAuctionSnapshot, emitAuctionUpdate } = require("../socket");
const cache = require("../utils/snapshotCache");
const { syncTeamPurse } = require("../utils/teamPurse");

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

  // Crucial: A player is identified by their name AND mobile/email within an organization.
  // Never merge different player names just because they share a contact number (e.g. parent, club manager) or email.
  if (normalizedMobile) {
    const [rows] = await conn.query(
      `SELECT * FROM org_players 
       WHERE organization_id = ? 
         AND normalized_mobile = ? 
         AND LOWER(TRIM(player_name)) = LOWER(TRIM(?))
       LIMIT 1`,
      [organizationId, normalizedMobile, playerName]
    );
    existing = rows[0] || null;
  }

  if (!existing && email) {
    const [rows] = await conn.query(
      `SELECT * FROM org_players 
       WHERE organization_id = ? 
         AND email = ? 
         AND LOWER(TRIM(player_name)) = LOWER(TRIM(?))
       LIMIT 1`,
      [organizationId, email, playerName]
    );
    existing = rows[0] || null;
  }

  if (!existing && !normalizedMobile && !email) {
    const [rows] = await conn.query(
      `SELECT * FROM org_players 
       WHERE organization_id = ? 
         AND LOWER(TRIM(player_name)) = LOWER(TRIM(?))
       LIMIT 1`,
      [organizationId, playerName]
    );
    existing = rows[0] || null;
  }

  if (existing) {
    // If incoming upload has a new raw photo URL, we DO want to update it.
    // Only skip if incoming has NO new photo and existing is already PROCESSED.
    const incomingHasPhoto = Boolean(photoUrl && /^https?:\/\//i.test(photoUrl));
    const skipPhotoUpdate = data.skipPhotoUpdate || (!incomingHasPhoto && existing.photo_processing_status === "PROCESSED" && existing.photo_url);

    if (skipPhotoUpdate) {
      await conn.query(
        `UPDATE org_players
         SET player_name = COALESCE(?, player_name),
             mobile = COALESCE(?, mobile),
             normalized_mobile = COALESCE(?, normalized_mobile),
             email = COALESCE(?, email),
             area = COALESCE(?, area),
             default_role = COALESCE(?, default_role),
             default_tshirt_size = COALESCE(?, default_tshirt_size),
             serial_number = COALESCE(?, serial_number),
             updated_at = NOW()
         WHERE id = ?`,
        [playerName, mobile, normalizedMobile, email, area, role, tshirtSize, serialNumber, existing.id]
      );
    } else {
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
          playerName, mobile, normalizedMobile, email, area, role, tshirtSize,
          photoUrl, photoUrl,
          originalPhotoUrl, originalPhotoUrl,
          photoUrl, photoSource,
          photoUrl, photoProcessingStatus,
          photoUrl, photoProcessingMode,
          photoUrl,
          serialNumber,
          existing.id,
        ]
      );
    }


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


// ---------------------------------------------------------------------------
// Background photo processing - called via setImmediate after bulk upload response.
// Downloads + face-crops photos concurrently without blocking the HTTP response.
// ---------------------------------------------------------------------------
async function processPhotoJobsInBackground(jobs) {
  if (!jobs || jobs.length === 0) return;
  console.log(`[photoBackground] Processing photos for ${jobs.length} player(s) in background...`);

  const CONCURRENCY = 4;
  let jobIndex = 0;

  async function worker() {
    while (jobIndex < jobs.length) {
      const currentIndex = jobIndex++;
      const job = jobs[currentIndex];
      if (!job) break;
      const playerLabel = job.playerName ? `"${job.playerName}" (id=${job.playerId})` : `id=${job.playerId}`;
      try {
        console.log(`[photoBackground] [${currentIndex + 1}/${jobs.length}] Downloading photo for ${playerLabel}...`);
        const processed = await processPlayerPhotoUrl(job.req, job.rawPhotoUrl);
        const bgConn = await pool.getConnection();
        try {
          await bgConn.query(
            `UPDATE org_players
             SET photo_url = ?, original_photo_url = ?, photo_source = 'EXCEL_URL_PROCESSED',
                 photo_processing_status = ?, photo_processing_mode = ?, photo_updated_at = NOW(),
                 updated_at = NOW()
             WHERE id = ?`,
            [processed.photo_url, processed.original_photo_url,
             processed.photo_processing_status, processed.photo_processing_mode,
             job.orgPlayerId]
          );
          await bgConn.query(
            `UPDATE players 
             SET photo_url = ?, original_photo_url = ?, photo_processing_status = ? 
             WHERE id = ?`,
            [processed.photo_url, processed.original_photo_url, processed.photo_processing_status, job.playerId]
          );
          console.log(`[photoBackground] [${currentIndex + 1}/${jobs.length}] Photo SUCCESS for ${playerLabel}: ${processed.photo_url}`);
          // Emit real-time update so admin UI can swap the photo immediately
          emitAuctionUpdate(job.auctionId, "playerPhotoReady", {
            playerId: job.playerId,
            photo_url: processed.photo_url,
            photo_processing_status: processed.photo_processing_status,
          });
        } finally {
          bgConn.release();
        }
      } catch (err) {
        console.warn(`[photoBackground] [${currentIndex + 1}/${jobs.length}] Photo FAILED for ${playerLabel}:`, err.message);
        try {
          await pool.query(
            `UPDATE players SET photo_processing_status = 'FAILED' WHERE id = ?`,
            [job.playerId]
          );
          if (job.orgPlayerId) {
            await pool.query(
              `UPDATE org_players SET photo_processing_status = 'FAILED' WHERE id = ?`,
              [job.orgPlayerId]
            );
          }
          emitAuctionUpdate(job.auctionId, "playerPhotoReady", {
            playerId: job.playerId,
            photo_url: null,
            photo_processing_status: "FAILED",
          });
        } catch (_) {}
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker());
  await Promise.all(workers);
  console.log(`[photoBackground] Done processing ${jobs.length} photo(s).`);
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
              COALESCE(p.photo_url, op.photo_url) AS photo_url,
              COALESCE(p.photo_processing_status, op.photo_processing_status) AS photo_processing_status,
              op.id AS master_player_id,
              op.photo_url AS master_photo_url,
              t.team_name AS sold_team_name
       FROM players p
       LEFT JOIN org_players op ON op.id = p.org_player_id
       LEFT JOIN teams t ON t.id = p.sold_team_id
       WHERE p.auction_id = ? AND COALESCE(p.is_deleted, 0) = 0
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
    const finalPhotoStatus = photo_processing_status || (latestPhotoUrl ? "PROCESSED" : null);

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
        finalPhotoStatus,
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
      // Don't update shared org_player photo — multiple auction players can share the same
      // org_player (same email/mobile). Photo is stored per-player in the players table.
      skipPhotoUpdate: true,
    });

    const latestPhotoUrl = clean(photo_url) || orgPlayer.photo_url || existing.photo_url || null;
    const finalPhotoStatus = photo_processing_status || (latestPhotoUrl ? "PROCESSED" : null);

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
    const pendingPhotoJobs = []; // photo jobs to process in background after responding

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
        const ageKey = Object.keys(row).find(k => k.trim().toLowerCase() === "age" || k.trim().toLowerCase() === "player age" || k.trim().toLowerCase() === "age(yrs)");
        const age = ageKey ? row[ageKey] : null;
        const area = clean(row.Area || row.area);
        const previousTeam = clean(row["Previous Team"] || row.previous_team);
        const playerInfo = clean(row["Player Info"] || row["Rich Text Info"] || row.player_info);
        const serialNumber = clean(row["Serial Number"] || row["Serial No"] || row.serial_number || row.id || row.Id);
        const photoKey = Object.keys(row).find(k => {
          const norm = k.trim().toLowerCase();
          return (
            norm === "photo url" ||
            norm === "photo_url" ||
            norm === "photo" ||
            norm === "photos" ||
            norm === "player photo" ||
            norm === "player photograph" ||
            norm === "photograph" ||
            norm === "photo link" ||
            norm === "image" ||
            norm === "image url" ||
            norm === "image link" ||
            norm === "drive link" ||
            norm === "google drive link" ||
            norm === "upload photo" ||
            norm === "upload your photo" ||
            norm.includes("photo") ||
            norm.includes("photograph")
          );
        });
        const rawPhotoCell = clean(photoKey ? row[photoKey] : (row["Photo URL"] || row["Photo"] || row.photo_url || row.photo));
        let rawPhotoUrl = null;
        if (rawPhotoCell) {
          const urlMatch = String(rawPhotoCell).match(/https?:\/\/[^\s,;"'<>]+/i);
          rawPhotoUrl = urlMatch ? urlMatch[0].trim() : rawPhotoCell;
        }
        // Save raw URL immediately - photo processing happens in the background after responding.
        // Processing photos synchronously (download + face-crop) per row inside the HTTP request
        // can take 10-30 s for large sheets and triggers proxy / client timeouts.
        const photoUrl = rawPhotoUrl || null;
        const originalPhotoUrl = null;
        const photoProcessingStatus = rawPhotoUrl && /^https?:\/\//i.test(rawPhotoUrl) ? "URL_NOT_PROCESSED" : null;
        const photoProcessingMode = null;

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
          photo_source: rawPhotoUrl ? "EXCEL_URL" : null,
          source: "EXCEL",
          serial_number: serialNumber,
        });

        const hasRawPhoto = Boolean(rawPhotoUrl && /^https?:\/\//i.test(rawPhotoUrl));
        const hasExistingProcessed = !hasRawPhoto && orgPlayer.photo_processing_status === "PROCESSED" && orgPlayer.photo_url;
        const latestPhotoUrl = hasRawPhoto ? rawPhotoUrl : (hasExistingProcessed ? orgPlayer.photo_url : null);
        const finalUploadPhotoStatus = hasRawPhoto ? "URL_NOT_PROCESSED" : (hasExistingProcessed ? "PROCESSED" : null);

        // If player already exists in this auction, update their record instead of inserting a duplicate
        const [[existingInAuction]] = await conn.query(
          `SELECT id, status FROM players 
           WHERE auction_id = ? 
             AND LOWER(TRIM(player_name)) = LOWER(TRIM(?)) 
             AND COALESCE(is_deleted, 0) = 0
           LIMIT 1`,
          [auctionId, playerName]
        );

        let playerId = null;
        if (existingInAuction && existingInAuction.status !== "SOLD") {
          playerId = existingInAuction.id;
          await conn.query(
            `UPDATE players
             SET organization_id = ?,
                 org_player_id = ?,
                 player_mobile = ?,
                 normalized_mobile = ?,
                 player_email = ?,
                 category = ?,
                 player_role = ?,
                 base_price = ?,
                 tshirt_size = ?,
                 age = ?,
                 area = ?,
                 previous_team = ?,
                 photo_url = ?,
                 photo_processing_status = ?,
                 registration_source = 'EXCEL',
                 import_batch_id = ?,
                 serial_number = ?,
                 player_info = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [
              organizationId,
              orgPlayer.id,
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
              finalUploadPhotoStatus,
              importBatchId,
              serialNumber,
              playerInfo,
              playerId,
            ]
          );
        } else {
          const [playerResult] = await conn.query(
            `INSERT INTO players
             (auction_id, organization_id, org_player_id, player_name, player_mobile, normalized_mobile, player_email,
              category, player_role, base_price, tshirt_size, age, area, previous_team, photo_url,
              photo_processing_status,
              registration_source, import_batch_id, status, serial_number, player_info)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EXCEL', ?, 'AVAILABLE', ?, ?)`,
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
              finalUploadPhotoStatus,
              importBatchId,
              serialNumber,
              playerInfo,
            ]
          );
          playerId = playerResult.insertId;
        }

        // Queue background photo processing for rows with an HTTP photo URL
        if (hasRawPhoto) {
          pendingPhotoJobs.push({ orgPlayerId: orgPlayer.id, playerId, playerName, rawPhotoUrl, req, auctionId });
        }
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
      photos_pending: pendingPhotoJobs.length,
    });

    // Process photos in background AFTER responding - keeps upload fast regardless of photo count
    if (pendingPhotoJobs.length > 0) {
      setImmediate(() => processPhotoJobsInBackground(pendingPhotoJobs));
    }
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

    const oldTeamId = player.sold_team_id ? Number(player.sold_team_id) : null;
    const oldPrice = Number(player.sold_price || 0);

    let soldAtSql = "NULL";
    let finalUnsoldAtSql = "final_unsold_at";
    let lastUnsoldAtSql = "last_unsold_at";
    let unsoldIncrement = 0;

    if (newStatus === "SOLD") {
      if (!newTeamId) throw new Error("sold_team_id is required when status is SOLD");
      if (newPrice <= 0) throw new Error("sold_price must be greater than zero when status is SOLD");

      const [[targetTeam]] = await conn.query(
        `SELECT id, team_name, total_purse, remaining_purse FROM teams WHERE id = ? AND auction_id = ? AND COALESCE(is_deleted, 0) = 0 FOR UPDATE`,
        [newTeamId, player.auction_id]
      );
      if (!targetTeam) throw new Error("Selected team not found in this auction");

      const [[spentRow]] = await conn.query(
        `SELECT COALESCE(SUM(sold_price), 0) AS total_spent FROM players
         WHERE auction_id = ? AND sold_team_id = ? AND status = 'SOLD' AND id != ? AND COALESCE(is_deleted, 0) = 0`,
        [player.auction_id, newTeamId, playerId]
      );
      const targetTotalPurse = Number(targetTeam.total_purse || targetTeam.remaining_purse || 0);
      const targetSpentOther = Number(spentRow?.total_spent || 0);
      const availablePurse = targetTotalPurse - targetSpentOther;

      if (availablePurse < newPrice) {
        throw new Error(`Team ${targetTeam.team_name} does not have enough purse (${availablePurse} available, needed ${newPrice})`);
      }

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
           sold_amount = ?,
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

    // Sync team purses from ground truth (accurately adjusts old team & new team)
    await syncTeamPurse(conn, player.auction_id, [oldTeamId, newTeamId]);

    // Keep auction_state in sync if this player is currently active in state
    const [[currentState]] = await conn.query(
      `SELECT current_player_id, state FROM auction_state WHERE auction_id = ?`,
      [player.auction_id]
    );
    if (currentState && Number(currentState.current_player_id) === playerId) {
      if (newStatus === "SOLD") {
        await conn.query(
          `UPDATE auction_state 
           SET highest_team_id = ?, current_bid = ?, state = 'SOLD', updated_at = NOW() 
           WHERE auction_id = ?`,
          [newTeamId, newPrice, player.auction_id]
        );
      } else if (newStatus === "UNSOLD" || newStatus === "FINAL_UNSOLD") {
        await conn.query(
          `UPDATE auction_state 
           SET highest_team_id = NULL, state = ?, updated_at = NOW() 
           WHERE auction_id = ?`,
          [newStatus, player.auction_id]
        );
      } else {
        await conn.query(
          `UPDATE auction_state 
           SET highest_team_id = NULL, current_bid = ?, state = 'PLAYER_ACTIVE', updated_at = NOW() 
           WHERE auction_id = ?`,
          [player.base_price || 0, player.auction_id]
        );
      }
    }

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

    cache.invalidate(player.auction_id);
    let snapshot = null;
    try {
      const liveRoutes = require("./live.routes");
      if (liveRoutes.loadSnapshot) {
        snapshot = await liveRoutes.loadSnapshot(player.auction_id);
        emitAuctionSnapshot(player.auction_id, snapshot, "auctionSnapshotUpdated");
      }
    } catch (e) {
      console.error("Failed to emit auction snapshot after player correction", e);
    }

    res.json({ message: "Player correction saved", player: updated, snapshot });
  } catch (error) {
    await conn.rollback();
    console.error("player correction error", error);
    sendError(res, error);
  } finally {
    conn.release();
  }
});

router.post("/bulk-delete", authMiddleware, requireRole("AUCTION_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const playerIds = Array.isArray(req.body.playerIds)
      ? req.body.playerIds.map((id) => Number(id)).filter(Boolean)
      : [];

    if (playerIds.length === 0) {
      return res.status(400).json({ message: "Please select at least one player" });
    }

    await connection.beginTransaction();

    const placeholders = playerIds.map(() => "?").join(",");
    const [players] = await connection.query(
      `SELECT id, auction_id, player_name, photo_url
       FROM players
       WHERE id IN (${placeholders})
         AND COALESCE(is_deleted, 0) = 0`,
      playerIds
    );

    if (players.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Selected players were not found" });
    }

    const auctionIds = [...new Set(players.map((p) => Number(p.auction_id)))];
    for (const auctionId of auctionIds) {
      if (!(await assertAuctionAccess(req, res, auctionId))) {
        await connection.rollback();
        return;
      }
    }

    const validIds = players.map((p) => Number(p.id));
    const validPlaceholders = validIds.map(() => "?").join(",");

    // Delete photos locally if they exist
    for (const p of players) {
      if (p.photo_url && p.photo_url.includes("/uploads/players/")) {
        try {
          const filename = p.photo_url.split("/uploads/players/")[1];
          if (filename) {
            const filepath = path.join(playerPhotoDir, filename);
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          }
        } catch (e) {
          console.error("Failed to delete photo file", e);
        }
      }
    }

    await connection.query(
      `UPDATE players
       SET is_deleted = 1, photo_url = NULL, original_photo_url = NULL
       WHERE id IN (${validPlaceholders})`,
      validIds
    );

    await connection.commit();

    res.json({
      message: `${validIds.length} player${validIds.length === 1 ? "" : "s"} deleted successfully`,
      deletedCount: validIds.length,
    });
  } catch (error) {
    await connection.rollback();
    console.error("bulk delete players error", error);
    sendError(res, error);
  } finally {
    connection.release();
  }
});

module.exports = router;
