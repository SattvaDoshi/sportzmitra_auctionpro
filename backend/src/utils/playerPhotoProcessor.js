const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const sharp = require("sharp");
const heicConvert = require("heic-convert");

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
  const image = sharp(buffer, { failOn: "none" }).rotate();
  const metadata = await image.metadata();

  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);

  if (!width || !height) {
    throw new Error("Invalid image dimensions");
  }

  // Face-focused safe crop: portrait photos usually have the face in the upper-middle.
  // This keeps the face/head area without destroying quality and falls back safely when no ML detector is available.
  let left = 0;
  let top = 0;
  let size = Math.min(width, height);

  if (height > width) {
    left = 0;
    top = Math.round((height - width) * 0.22); // top-biased crop for head/shoulder profile photos
    size = width;
  } else if (width > height) {
    top = 0;
    left = Math.round((width - height) / 2);
    size = height;
  }

  left = Math.max(0, Math.min(left, width - size));
  top = Math.max(0, Math.min(top, height - size));

  const filename = `${baseName}-face.jpg`;
  const absolutePath = path.join(processedDir, filename);

  await sharp(buffer, { failOn: "none" })
    .rotate()
    .extract({ left, top, width: size, height: size })
    .resize({ width: 768, height: 768, fit: "cover", withoutEnlargement: false })
    .jpeg({ quality: 94, mozjpeg: true })
    .toFile(absolutePath);

  return {
    filename,
    relativePath: `players/processed/${filename}`,
    absolutePath,
    crop: { left, top, size, originalWidth: width, originalHeight: height, mode: "face_focused_safe_crop" },
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
function normalizeDriveUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("drive.google.com")) return url;

    // Pattern: /file/d/<ID>/view  or  /file/d/<ID>/preview
    const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) {
      return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
    }

    // Pattern: /open?id=<ID>  or  /uc?id=<ID>
    const idParam = parsed.searchParams.get("id");
    if (idParam) {
      return `https://drive.google.com/uc?export=download&id=${idParam}`;
    }
  } catch (_) {
    // Not a valid URL – return as-is and let the fetch fail naturally
  }
  return url;
}

async function downloadImageBuffer(rawUrl) {
  const url = normalizeDriveUrl(rawUrl);

  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "SportzMitraAuction/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Photo URL download failed: ${response.status} (${url})`);
  }

  const contentType = response.headers.get("content-type") || "";

  // Guard: reject HTML responses (e.g. Drive virus-scan confirmation pages,
  // or any URL that resolves to a webpage instead of an image)
  if (contentType.includes("text/html")) {
    throw new Error(
      `URL did not return an image (got ${contentType}). ` +
      `For large Google Drive files the download confirmation page may appear – ` +
      `ensure the file is publicly shared and under ~25 MB.`
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
