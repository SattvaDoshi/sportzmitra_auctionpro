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
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || "google-service-account.json";
  try {
    const { google } = require("googleapis");
    const candidates = [
      path.resolve(keyFile),
      path.resolve(__dirname, "..", "..", keyFile),
      path.resolve(__dirname, "..", keyFile),
      path.resolve(process.cwd(), keyFile),
      path.resolve(process.cwd(), "backend", keyFile),
      path.resolve(process.cwd(), "google-service-account.json"),
      "/var/www/sportzmitra_uat/backend/google-service-account.json",
      "/var/www/sportzmitra_uat/google-service-account.json",
      "/var/www/sportzmitra_auctionpro/backend/google-service-account.json",
      "/var/www/sportzmitra_auctionpro/google-service-account.json",
    ];
    const keyPath = candidates.find((p) => fs.existsSync(p));
    if (!keyPath) {
      console.warn("[Drive] Service account key file not found in candidates");
      return null;
    }
    console.log(`[Drive] Using service account key from: ${keyPath}`);
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
  let origin = process.env.APP_BASE_URL;
  if (!origin && req && typeof req.get === "function" && req.protocol) {
    origin = `${req.protocol}://${req.get("host")}`;
  }
  if (!origin) {
    origin = "http://localhost:5000";
  }
  origin = origin.replace(/\/+$/, "");
  return `${origin}/uploads/${normalized}`;
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
    if (!parsed.hostname.endsWith("drive.google.com") && !parsed.hostname.endsWith("docs.google.com")) return null;

    // Pattern: /file/d/<ID>/view or /file/d/<ID>
    const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) return fileMatch[1];

    // Pattern: /open?id=<ID> or /uc?id=<ID> or /thumbnail?id=<ID>
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
  const driveFileId = extractDriveFileId(rawUrl);

  // 1. Google Drive with Service Account (required for private Drive/Forms files)
  if (driveFileId && getDriveAuth()) {
    try {
      return await downloadDriveFileWithServiceAccount(driveFileId);
    } catch (saErr) {
      console.warn(`[Drive] Service account download failed for ${driveFileId}: ${saErr.message}. Trying public endpoints...`);
    }
  }

  // 2. Google Drive direct endpoints fallback (works when files are shared with 'Anyone with the link')
  if (driveFileId) {
    const driveCandidates = [
      `https://lh3.googleusercontent.com/d/${driveFileId}`,
      `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1600`,
      `https://drive.google.com/uc?export=download&id=${driveFileId}`,
    ];

    for (const dUrl of driveCandidates) {
      try {
        const res = await fetch(dUrl, {
          redirect: "follow",
          headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        const cType = res.headers.get("content-type") || "";
        if (res.ok && !cType.includes("text/html") && (cType.startsWith("image/") || cType === "application/octet-stream")) {
          const ab = await res.arrayBuffer();
          if (ab.byteLength > 500) {
            return {
              buffer: Buffer.from(ab),
              mimetype: cType.startsWith("image/") ? cType : "image/jpeg",
              originalname: `drive-${driveFileId}.jpg`,
            };
          }
        }
      } catch (_) {}
    }
  }

  // 3. Fallback: plain HTTP fetch (for public direct image URLs like .jpg/.png)
  const response = await fetch(rawUrl, {
    redirect: "follow",
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });

  if (!response.ok) {
    throw new Error(`Photo URL download failed: ${response.status} (${rawUrl})`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("text/html")) {
    throw new Error(
      `URL did not return an image (got ${contentType}). ` +
      `For Google Drive photos, place google-service-account.json in the backend directory.`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimetype: contentType,
    originalname: path.basename(new URL(rawUrl).pathname) || "photo.jpg",
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
