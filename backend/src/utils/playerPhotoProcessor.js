const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const sharp = require("sharp");
const heicConvert = require("heic-convert");
const { detectFaceBox, applyBrightnessContrast, isOpenCVAvailable } = require("./faceDetector");

// ---------------------------------------------------------------------------
// Google Drive Service Account support (optional)
// Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE in .env to enable authenticated Drive
// downloads. Required when photos come from Google Forms (files are private).
// ---------------------------------------------------------------------------
let driveAuth = null;
function getDriveAuth() {
  if (driveAuth) return driveAuth;
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyFile) return null;
  try {
    const { google } = require("googleapis");
    const keyPath = path.resolve(keyFile);
    if (!fs.existsSync(keyPath)) {
      console.warn("[Drive] Service account key file not found:", keyPath);
      return null;
    }
    driveAuth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    return driveAuth;
  } catch (err) {
    console.warn("[Drive] Failed to init service account auth:", err.message);
    return null;
  }
}

const uploadsRoot = path.join(__dirname, "..", "uploads");
const originalDir = path.join(uploadsRoot, "players", "original");
const processedDir = path.join(uploadsRoot, "players", "processed");

fs.mkdirSync(originalDir, { recursive: true });
fs.mkdirSync(processedDir, { recursive: true });

function publicUrl(req, relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  return `${req.protocol}://${req.get("host")}/uploads/${normalized}`;
}

function isHeic(file = {}) {
  const name = String(file.originalname || "").toLowerCase();
  const type = String(file.mimetype || "").toLowerCase();
  return type.includes("heic") || type.includes("heif") || name.endsWith(".heic") || name.endsWith(".heif");
}

async function normalizeInputBuffer(file) {
  const inputBuffer = file.buffer;
  if (!inputBuffer) throw new Error("Image buffer is missing");

  if (isHeic(file)) {
    const output = await heicConvert({
      buffer: inputBuffer,
      format: "JPEG",
      quality: 0.96,
    });
    return Buffer.from(output);
  }

  return inputBuffer;
}

async function saveOriginalJpeg(buffer, baseName) {
  const filename = `${baseName}-original.jpg`;
  const absolutePath = path.join(originalDir, filename);

  await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 95, mozjpeg: true })
    .toFile(absolutePath);

  return {
    filename,
    relativePath: `players/original/${filename}`,
    absolutePath,
  };
}

async function createFaceFocusedCrop(buffer, baseName) {
  // ── Re-orientate buffer first so OpenCV and sharp see the same pixels ────
  const orientedBuffer = await sharp(buffer, { failOn: "none" })
    .rotate()
    .jpeg({ quality: 95 })
    .toBuffer();

  const metadata = await sharp(orientedBuffer).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);

  if (!width || !height) {
    throw new Error("Invalid image dimensions");
  }

  let left = 0;
  let top = 0;
  let size = Math.min(width, height);
  let mode = "heuristic_crop";

  // ── Attempt DNN face detection ────────────────────────────────────────────
  const face = await detectFaceBox(orientedBuffer);

  if (face && face.width > 0 && face.height > 0) {
    // Face found – build a generous square crop centred on the face
    const side = Math.floor(Math.max(face.width, face.height) * 1.8);
    const centerX = face.x + Math.floor(face.width / 2);
    const centerY = face.y + Math.floor(face.height / 2);

    const raw_left  = centerX - Math.floor(side / 2);
    const raw_top   = centerY - Math.floor(side / 2);
    const raw_right  = raw_left + side;
    const raw_bottom = raw_top  + side;

    left = Math.max(0, raw_left);
    top  = Math.max(0, raw_top);
    const clampedRight  = Math.min(raw_right,  width);
    const clampedBottom = Math.min(raw_bottom, height);
    size = Math.min(clampedRight - left, clampedBottom - top);

    mode = "dnn_face_crop";
    console.log(`[photoProcessor] DNN face detected – crop: left=${left} top=${top} size=${size}`);
  } else {
    // Fallback: portrait top-biased heuristic
    if (height > width) {
      left = 0;
      top  = Math.round((height - width) * 0.22);
      size = width;
    } else if (width > height) {
      top  = 0;
      left = Math.round((width - height) / 2);
      size = height;
    }
    console.log(`[photoProcessor] No face detected – using heuristic crop.`);
  }

  left = Math.max(0, Math.min(left, width - size));
  top  = Math.max(0, Math.min(top,  height - size));
  if (size <= 0) size = Math.min(width, height);

  const filename = `${baseName}-face.jpg`;
  const absolutePath = path.join(processedDir, filename);

  // ── Crop & resize with Sharp ──────────────────────────────────────────────
  let croppedBuffer = await sharp(orientedBuffer, { failOn: "none" })
    .extract({ left, top, width: size, height: size })
    .resize({ width: 768, height: 768, fit: "cover", withoutEnlargement: false, kernel: "lanczos3" })
    .jpeg({ quality: 95 })
    .toBuffer();

  // ── Apply auto brightness/contrast via OpenCV if available ───────────────
  if (isOpenCVAvailable()) {
    croppedBuffer = await applyBrightnessContrast(croppedBuffer);
  }

  // ── Final save with DPI metadata via Sharp ───────────────────────────────
  await sharp(croppedBuffer)
    .withMetadata({ density: 300 })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(absolutePath);

  return {
    filename,
    relativePath: `players/processed/${filename}`,
    absolutePath,
    crop: { left, top, size, originalWidth: width, originalHeight: height, mode },
  };
}

async function processUploadedPlayerPhoto(req, file) {
  if (!file) throw new Error("Photo file is required");

  const normalizedBuffer = await normalizeInputBuffer(file);
  const baseName = `player-${Date.now()}-${randomUUID()}`;

  const original = await saveOriginalJpeg(normalizedBuffer, baseName);
  const processed = await createFaceFocusedCrop(normalizedBuffer, baseName);

  return {
    original_photo_url: publicUrl(req, original.relativePath),
    photo_url: publicUrl(req, processed.relativePath),
    photo_processing_status: "PROCESSED",
    photo_processing_mode: processed.crop.mode,
    crop: processed.crop,
  };
}

/**
 * Converts any Google Drive sharing/viewer URL into a direct image download URL.
 *
 * Supported input formats:
 *   https://drive.google.com/file/d/<FILE_ID>/view?usp=sharing
 *   https://drive.google.com/file/d/<FILE_ID>/view
 *   https://drive.google.com/open?id=<FILE_ID>
 *   https://drive.google.com/uc?id=<FILE_ID>  (already a download link – unchanged)
 *
 * Output:
 *   https://drive.google.com/uc?export=download&id=<FILE_ID>
 */
/**
 * Extract the Google Drive file ID from any known Drive URL format, or null
 * if the URL isn't a Drive URL.
 */
function extractDriveFileId(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("drive.google.com")) return null;

    // Pattern: /file/d/<ID>/view  or  /file/d/<ID>/preview
    const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) return fileMatch[1];

    // Pattern: /open?id=<ID>  or  /uc?id=<ID>  or  /u/1/open?...&id=<ID>
    return parsed.searchParams.get("id") || null;
  } catch (_) {
    return null;
  }
}

/**
 * Try to download a Google Drive file using a Service Account (OAuth2).
 * Returns a { buffer, mimetype, originalname } object or throws.
 */
async function downloadDriveFileWithServiceAccount(fileId) {
  const auth = getDriveAuth();
  if (!auth) throw new Error("No service account configured");

  const { google } = require("googleapis");
  const drive = google.drive({ version: "v3", auth });

  const metaRes = await drive.files.get({ fileId, fields: "name,mimeType" });
  const mimetype = metaRes.data.mimeType || "image/jpeg";
  const originalname = metaRes.data.name || "photo.jpg";

  const dlRes = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  return {
    buffer: Buffer.from(dlRes.data),
    mimetype,
    originalname,
  };
}

async function downloadImageBuffer(rawUrl) {
  // --- Google Drive: prefer Service Account auth if configured ---
  const driveFileId = extractDriveFileId(rawUrl);
  if (driveFileId && getDriveAuth()) {
    return downloadDriveFileWithServiceAccount(driveFileId);
  }

  // --- Fallback: plain HTTP fetch (works for truly public URLs) ---
  const url = rawUrl;
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "SportzMitraAuction/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Photo URL download failed: ${response.status} (${url})`);
  }

  const contentType = response.headers.get("content-type") || "";

  // Guard: reject HTML responses (e.g. Drive bot-protection or login pages)
  if (contentType.includes("text/html")) {
    throw new Error(
      `URL did not return an image (got ${contentType}). ` +
      `For Google Drive photos, configure GOOGLE_SERVICE_ACCOUNT_KEY_FILE in .env.`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimetype: contentType,
    originalname: path.basename(new URL(url).pathname) || "photo.jpg",
  };
}

async function processPlayerPhotoUrl(req, url) {
  const file = await downloadImageBuffer(url);
  return processUploadedPlayerPhoto(req, file);
}

module.exports = {
  processUploadedPlayerPhoto,
  processPlayerPhotoUrl,
};
