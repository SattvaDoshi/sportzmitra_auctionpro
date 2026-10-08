/**
 * faceDetector.js
 * ---------------
 * DNN-based face detection using the SSD MobileNet Caffe model.
 * Falls back gracefully if @u4/opencv4nodejs is not installed / cannot load.
 *
 * Model files expected at:
 *   backend/src/model/deploy.prototxt
 *   backend/src/model/res10_300x300_ssd_iter_140000.caffemodel
 */

const fs = require("fs");
const path = require("path");

const PROTOTXT = path.join(__dirname, "..", "model", "deploy.prototxt");
const CAFFEMODEL = path.join(
  __dirname,
  "..",
  "model",
  "res10_300x300_ssd_iter_140000.caffemodel"
);

// ── Try to load OpenCV (optional native dep) ─────────────────────────────────
let cv = null;
let net = null;

try {
  cv = require("@u4/opencv4nodejs");
  if (fs.existsSync(PROTOTXT) && fs.existsSync(CAFFEMODEL)) {
    net = cv.readNetFromCaffe(PROTOTXT, CAFFEMODEL);
    console.log("[faceDetector] DNN model loaded successfully.");
  } else {
    console.warn("[faceDetector] Model files not found – falling back to heuristic crop.");
  }
} catch (err) {
  console.warn("[faceDetector] @u4/opencv4nodejs not available – falling back to heuristic crop.", err.message);
}

// ── Auto Brightness / Contrast ───────────────────────────────────────────────

function autoBrightnessContrast(image, clipHistPercent = 1) {
  const gray = image.cvtColor(cv.COLOR_BGR2GRAY);
  const minMax = gray.minMaxLoc();

  if (minMax.maxVal === minMax.minVal) return image;

  const histogram = new Array(256).fill(0);
  const data = gray.getData();
  for (let i = 0; i < data.length; i++) histogram[data[i]]++;

  const accumulator = new Array(256);
  accumulator[0] = histogram[0];
  for (let i = 1; i < 256; i++) accumulator[i] = accumulator[i - 1] + histogram[i];

  const maximum = accumulator[255];
  clipHistPercent = (clipHistPercent * (maximum / 100.0)) / 2.0;

  let minGray = 0;
  while (minGray < 255 && accumulator[minGray] < clipHistPercent) minGray++;

  let maxGray = 255;
  while (maxGray > 0 && accumulator[maxGray] >= maximum - clipHistPercent) maxGray--;

  if (maxGray <= minGray) return image.convertScaleAbs(1.0, 10);

  const alpha = 255.0 / (maxGray - minGray);
  const beta = -minGray * alpha;
  return image.convertScaleAbs(alpha, beta);
}

// ── DNN Face Detection ────────────────────────────────────────────────────────

function detectFaceDNN(image) {
  if (!cv || !net) return null;

  try {
    const h = image.rows;
    const w = image.cols;

    const resized = image.resize(300, 300);
    const blob = cv.blobFromImage(
      resized,
      1.0,
      new cv.Size(300, 300),
      new cv.Vec(104.0, 177.0, 123.0),
      false,
      false
    );

    net.setInput(blob);
    const detections = net.forward();
    const detectionData = detections.getDataAsArray();

    if (!detectionData || detectionData.length === 0) return null;

    let bestDetection = null;
    let bestConfidence = -Infinity;

    function scanDetections(data) {
      if (!Array.isArray(data)) return;

      if (data.length >= 7 && typeof data[2] === "number") {
        const confidence = data[2];
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestDetection = data;
        }
        return;
      }

      for (const item of data) {
        if (Array.isArray(item)) scanDetections(item);
      }
    }

    scanDetections(detectionData);

    if (!bestDetection || bestConfidence < 0.5) return null;

    const x1 = Math.round(bestDetection[3] * w);
    const y1 = Math.round(bestDetection[4] * h);
    const x2 = Math.round(bestDetection[5] * w);
    const y2 = Math.round(bestDetection[6] * h);

    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  } catch (err) {
    console.warn("[faceDetector] DNN detection failed:", err.message);
    return null;
  }
}

// ── Main export: detectFaceBox ────────────────────────────────────────────────
/**
 * Given a raw image Buffer, returns a face bounding box { x, y, width, height }
 * or null if no face is detected / OpenCV not available.
 *
 * This function performs all OpenCV processing internally.
 * The caller never needs to interact with OpenCV directly.
 */
async function detectFaceBox(imageBuffer) {
  if (!cv || !net) return null;

  try {
    const mat = cv.imdecode(imageBuffer);
    if (!mat || mat.empty) return null;
    return detectFaceDNN(mat);
  } catch (err) {
    console.warn("[faceDetector] Could not decode image for face detection:", err.message);
    return null;
  }
}

/**
 * Given a raw image Buffer and bounding box from detectFaceBox,
 * returns a processed (brightness/contrast corrected) JPEG Buffer.
 * Falls back to the original buffer if OpenCV is unavailable.
 */
async function applyBrightnessContrast(imageBuffer) {
  if (!cv || !net) return imageBuffer;

  try {
    const mat = cv.imdecode(imageBuffer);
    if (!mat || mat.empty) return imageBuffer;

    const corrected = autoBrightnessContrast(mat);
    const encoded = cv.imencode(".jpg", corrected, [cv.IMWRITE_JPEG_QUALITY, 92]);
    return Buffer.from(encoded);
  } catch (err) {
    console.warn("[faceDetector] Brightness/contrast failed:", err.message);
    return imageBuffer;
  }
}

module.exports = { detectFaceBox, applyBrightnessContrast, isOpenCVAvailable: () => !!net };
