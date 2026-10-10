import { Download, Edit3, History, ImagePlus, Plus, Save, Search, Upload, Wrench, X, Trash2, CheckSquare, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import AdminLayout from "../components/layout/AdminLayout";
import StatusBadge from "../components/ui/StatusBadge";
import ConfirmDeleteModal from "../components/ui/ConfirmDeleteModal";
import api from "../api/api";

const DEFAULT_PLAYER_IMAGE = "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=300&auto=format&fit=crop";

const emptyPlayer = {
  serial_number: "", player_name: "", player_mobile: "", player_email: "", category: "", player_role: "", base_price: "", tshirt_size: "", age: "", area: "", previous_team: "", photo_url: "", original_photo_url: "", photo_processing_status: "", photo_processing_mode: "",
};

const emptyCorrection = { status: "AVAILABLE", sold_team_id: "", sold_price: "", auction_round: "MAIN", category: "", player_role: "", base_price: "", tshirt_size: "", reason: "" };

function money(v) {
  return Number(v || 0).toLocaleString("en-IN");
}

/* ---------------------------------------------------------------------- */
/* Toolbar constants                                                       */
/* Every control shares the same height so text and icons line up.         */
/* ---------------------------------------------------------------------- */
const STATUS_FILTERS = ["ALL", "AVAILABLE", "SOLD", "UNSOLD", "FINAL_UNSOLD", "WITHDRAWN"];

const actionBase =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm";
const actionOutline = `${actionBase} border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`;
const actionGreen = `${actionBase} bg-emerald-600 text-white hover:bg-emerald-700`;
const actionPink = `${actionBase} cursor-pointer bg-pink-600 text-white hover:bg-pink-700`;

/* ---------------------------------------------------------------------- */
/* PDF design helpers                                                      */
/* The PDF is a fixed A4 document, so it renders identically on mobile,    */
/* tablet and laptop. Background image lives at /public/pdf-bg.png.        */
/* ---------------------------------------------------------------------- */
const PDF_W = 210;
const PDF_H = 297;
const PDF_MARGIN = 10;
const PDF_GAP = 5;
const PDF_COLS = 2;
const PDF_CARD_W = (PDF_W - PDF_MARGIN * 2 - PDF_GAP * (PDF_COLS - 1)) / PDF_COLS;
const PDF_CARD_H = 40;
const PDF_PHOTO_W = 27;
const PDF_PHOTO_H = 34;

const PDF_PINK = [219, 39, 119];
const PDF_PINK_SOFT = [253, 232, 243];
const PDF_PINK_FAINT = [253, 242, 248];
const PDF_BORDER = [251, 207, 232];
const PDF_DARK = [15, 23, 42];
const PDF_MUTED = [100, 116, 139];
const PDF_WHITE = [255, 255, 255];

const PDF_STATUS_STYLES = {
  SOLD: { fg: [22, 163, 74], bg: [220, 252, 231] },
  IN_AUCTION: { fg: [217, 119, 6], bg: [255, 237, 213] },
  AVAILABLE: { fg: [37, 99, 235], bg: [219, 234, 254] },
  UNSOLD: { fg: [100, 116, 139], bg: [226, 232, 240] },
  FINAL_UNSOLD: { fg: [185, 28, 28], bg: [254, 226, 226] },
  WITHDRAWN: { fg: [185, 28, 28], bg: [254, 226, 226] },
};

/* ---------- Image loading ---------- */
function pdfLoadImgEl(src, cors) {
  return new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Google Drive share links don't work as <img> sources; convert them to a direct thumbnail URL
function pdfNormalizeUrl(url) {
  if (!url) return "";
  const u = String(url).trim();
  if (/drive\.google\.com|docs\.google\.com/.test(u)) {
    const m = u.match(/\/d\/([\w-]+)/) || u.match(/[?&]id=([\w-]+)/);
    if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w600`;
  }
  return u;
}

function pdfRenderCover(img, ratio, maxW, { fill, quality, round }) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  let sw = iw;
  let sh = ih;
  if (iw / ih > ratio) sw = ih * ratio;
  else sh = iw / ratio;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) * 0.15; // bias toward the top so faces stay in frame
  const outW = Math.max(1, Math.min(maxW, Math.round(sw)));
  const outH = Math.max(1, Math.round(outW / ratio));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (round) {
    const r = outW * 0.075;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(outW, 0, outW, outH, r);
    ctx.arcTo(outW, outH, 0, outH, r);
    ctx.arcTo(0, outH, 0, 0, r);
    ctx.arcTo(0, 0, outW, 0, r);
    ctx.closePath();
    ctx.clip();
  } else {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, outW, outH);
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  return round ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", quality);
}

// Center-crops an image to `ratio` and returns { data, type } (or null on failure).
// Tries a normal CORS load first, then a fresh fetch() as a fallback (fixes images
// the browser cached earlier without CORS headers).
async function loadImageCover(url, ratio, maxW, { fill = "#ffffff", quality = 0.8, round = false } = {}) {
  const src = pdfNormalizeUrl(url);
  if (!src) return null;
  let objectUrl = null;
  try {
    let img = await pdfLoadImgEl(src, true);
    if (!img) {
      try {
        const res = await fetch(src, { mode: "cors", cache: "no-store" });
        if (res.ok) {
          objectUrl = URL.createObjectURL(await res.blob());
          img = await pdfLoadImgEl(objectUrl, false);
        }
      } catch (e) {}
    }
    if (!img) return null;
    const data = pdfRenderCover(img, ratio, maxW, { fill, quality, round });
    return { data, type: round ? "PNG" : "JPEG" };
  } catch (e) {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/* ---------- Drawing primitives ---------- */
function pdfTruncate(doc, text, maxW) {
  let t = String(text ?? "");
  if (doc.getTextWidth(t) <= maxW) return t;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxW) t = t.slice(0, -1);
  return `${t}...`;
}

function pdfPoly(doc, pts, style = "F") {
  const segs = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
  doc.lines(segs, pts[0][0], pts[0][1], [1, 1], style, true);
}

function pdfRotRect(cx, cy, w, h, deg) {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

/* ---------- Vector icons (all centered on cx, cy and sized by s) ---------- */
function iconUsers(doc, cx, cy, s, c) {
  doc.setFillColor(...c);
  doc.circle(cx - 0.18 * s, cy - 0.22 * s, 0.2 * s, "F");
  doc.ellipse(cx - 0.18 * s, cy + 0.36 * s, 0.34 * s, 0.22 * s, "F");
  doc.circle(cx + 0.32 * s, cy - 0.12 * s, 0.16 * s, "F");
  doc.ellipse(cx + 0.32 * s, cy + 0.4 * s, 0.24 * s, 0.18 * s, "F");
}

function iconGavel(doc, cx, cy, s, c) {
  doc.setFillColor(...c);
  doc.setDrawColor(...c);
  doc.setLineWidth(Math.max(0.3, 0.14 * s));
  doc.line(cx + 0.02 * s, cy - 0.02 * s, cx - 0.4 * s, cy + 0.36 * s);
  pdfPoly(doc, pdfRotRect(cx + 0.14 * s, cy - 0.2 * s, 0.72 * s, 0.32 * s, 45), "F");
  doc.setLineWidth(Math.max(0.3, 0.16 * s));
  doc.line(cx - 0.12 * s, cy + 0.52 * s, cx + 0.5 * s, cy + 0.52 * s);
}

function iconBall(doc, cx, cy, s, c) {
  doc.setFillColor(...c);
  doc.circle(cx, cy, 0.5 * s, "F");
  doc.setDrawColor(...PDF_WHITE);
  doc.setLineWidth(Math.max(0.2, 0.09 * s));
  doc.lines([[0.34 * s, 0.14 * s, 0.34 * s, 0.46 * s, 0, 0.64 * s]], cx - 0.2 * s, cy - 0.32 * s, [1, 1], "S", false);
}

function iconBat(doc, cx, cy, s, c) {
  doc.setFillColor(...c);
  doc.setDrawColor(...c);
  const ang = 40;
  const t = (ang * Math.PI) / 180;
  const bcx = cx - 0.06 * s;
  const bcy = cy + 0.14 * s;
  pdfPoly(doc, pdfRotRect(bcx, bcy, 0.4 * s, 0.78 * s, ang), "F");
  const topX = bcx + Math.sin(t) * 0.39 * s;
  const topY = bcy - Math.cos(t) * 0.39 * s;
  doc.setLineWidth(Math.max(0.3, 0.12 * s));
  doc.line(topX, topY, topX + Math.sin(t) * 0.28 * s, topY - Math.cos(t) * 0.28 * s);
}

function iconStumps(doc, cx, cy, s, c) {
  doc.setDrawColor(...c);
  doc.setLineWidth(Math.max(0.3, 0.13 * s));
  [-0.3, 0, 0.3].forEach((dx) => doc.line(cx + dx * s, cy - 0.38 * s, cx + dx * s, cy + 0.5 * s));
  doc.setLineWidth(Math.max(0.25, 0.1 * s));
  doc.line(cx - 0.3 * s, cy - 0.5 * s, cx - 0.04 * s, cy - 0.5 * s);
  doc.line(cx + 0.04 * s, cy - 0.5 * s, cx + 0.3 * s, cy - 0.5 * s);
}

function iconCoins(doc, cx, cy, s, c) {
  doc.setFillColor(...c);
  doc.setDrawColor(...PDF_WHITE);
  doc.setLineWidth(Math.max(0.15, 0.07 * s));
  [0.34, 0.04, -0.26].forEach((dy) => doc.ellipse(cx, cy + dy * s, 0.46 * s, 0.2 * s, "FD"));
}

function pdfRoleIcon(role) {
  const r = String(role || "").toUpperCase();
  if (r.includes("WICKET") || r.includes("KEEP") || /\bWK\b/.test(r)) return iconStumps;
  if (r.includes("ALL")) return iconBall;
  if (r.includes("BAT")) return iconBat;
  return iconBall;
}

/* ---------- Pill / chip / card ---------- */
// Rounded label with optional icon or status dot; text is vertically centered
function pdfPill(doc, text, x, y, h, fg, bg, { alignRight = false, maxW = 60, icon = null, dot = false } = {}) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  const pad = 2.6;
  const lead = icon ? 3.6 : dot ? 2.6 : 0;
  const label = pdfTruncate(doc, text, maxW - pad * 2 - lead);
  const w = doc.getTextWidth(label) + pad * 2 + lead;
  const px = alignRight ? x - w : x;
  const my = y + h / 2;
  doc.setFillColor(...bg);
  doc.roundedRect(px, y, w, h, h / 2, h / 2, "F");
  if (icon) icon(doc, px + pad + 1.4, my, 2.8, fg);
  else if (dot) {
    doc.setFillColor(...fg);
    doc.circle(px + pad + 0.7, my, 0.7, "F");
  }
  doc.setTextColor(...fg);
  doc.text(label, px + pad + lead, my, { baseline: "middle" });
  return w;
}

function pdfDrawPageBackground(doc, bg) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PDF_W, PDF_H, "F");
  if (bg) {
    try { doc.addImage(bg.data, bg.type, 0, 0, PDF_W, PDF_H, "pdfbg", "FAST"); } catch (e) {}
  }
}

// Draws the page header and returns the Y where cards should start
function pdfDrawHeader(doc, { full, line1, line2, total, eventName }) {
  doc.setFont("helvetica", "bold");

  if (!full) {
    let size = 14;
    doc.setFontSize(size);
    while (doc.getTextWidth(line1) > PDF_W - PDF_MARGIN * 2 && size > 9) { size -= 1; doc.setFontSize(size); }
    doc.setTextColor(...PDF_DARK);
    doc.text(line1, PDF_MARGIN, 17);
    doc.setDrawColor(...PDF_PINK);
    doc.setLineWidth(0.8);
    doc.line(PDF_MARGIN, 20.5, PDF_MARGIN + 14, 20.5);
    return 27;
  }

  // Info chips (top-right)
  const chipH = 18;
  const chipY = 12;
  const chip2W = 52;
  const chip1W = 36;
  const chip2X = PDF_W - PDF_MARGIN - chip2W;
  const chip1X = chip2X - 3 - chip1W;

  // Title (left) — shrinks to fit the space left of the chips
  const titleMaxW = chip1X - PDF_MARGIN - 5;
  let size = 22;
  doc.setFontSize(size);
  while ((doc.getTextWidth(line1) > titleMaxW || doc.getTextWidth(line2) > titleMaxW) && size > 12) {
    size -= 1;
    doc.setFontSize(size);
  }
  doc.setTextColor(...PDF_DARK);
  doc.text(line1, PDF_MARGIN, 21);
  doc.setTextColor(...PDF_PINK);
  doc.text(line2, PDF_MARGIN, 30);
  doc.setDrawColor(...PDF_PINK);
  doc.setLineWidth(0.8);
  doc.line(PDF_MARGIN, 34, PDF_MARGIN + 18, 34);

  [
    [chip1X, chip1W, "Total Players", String(total), iconUsers],
    [chip2X, chip2W, "Auction Event", eventName || "-", iconGavel],
  ].forEach(([cx, cw, label, value, icon]) => {
    const midY = chipY + chipH / 2;
    doc.setFillColor(...PDF_WHITE);
    doc.setDrawColor(...PDF_BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, chipY, cw, chipH, 3.5, 3.5, "FD");
    // icon badge
    doc.setFillColor(...PDF_PINK_SOFT);
    doc.circle(cx + 7, midY, 4.2, "F");
    icon(doc, cx + 7, midY, 4.4, PDF_PINK);
    // text
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...PDF_MUTED);
    doc.text(label, cx + 13.5, chipY + 6.5, { baseline: "middle" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...PDF_PINK);
    doc.text(pdfTruncate(doc, value, cw - 16), cx + 13.5, chipY + 12.2, { baseline: "middle" });
  });

  return 42;
}

function pdfDrawPlayerCard(doc, player, photo, x, y) {
  // Card
  doc.setFillColor(...PDF_WHITE);
  doc.setDrawColor(...PDF_BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, PDF_CARD_W, PDF_CARD_H, 3, 3, "FD");

  // Photo (rounded, pink-tinted backing)
  const px = x + 3;
  const py = y + 3;
  doc.setFillColor(...PDF_PINK_SOFT);
  doc.roundedRect(px, py, PDF_PHOTO_W, PDF_PHOTO_H, 2, 2, "F");
  if (photo) {
    try { doc.addImage(photo.data, photo.type, px, py, PDF_PHOTO_W, PDF_PHOTO_H, undefined, "FAST"); } catch (e) {}
  } else {
    const initials = String(player.player_name || "?").split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...PDF_PINK);
    doc.text(initials, px + PDF_PHOTO_W / 2, py + PDF_PHOTO_H / 2, { align: "center", baseline: "middle" });
  }
  doc.setDrawColor(...PDF_BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(px, py, PDF_PHOTO_W, PDF_PHOTO_H, 2, 2, "S");

  // Right content area
  const cx = px + PDF_PHOTO_W + 4;
  const cw = x + PDF_CARD_W - 3 - cx;

  // Status pill (top-right, with dot)
  const st = PDF_STATUS_STYLES[player.status] || PDF_STATUS_STYLES.UNSOLD;
  const statusW = pdfPill(doc, String(player.status || "-").replace(/_/g, " "), x + PDF_CARD_W - 3, y + 4, 5.5, st.fg, st.bg, { alignRight: true, maxW: 30, dot: true });

  // Name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_DARK);
  const nameText = `${player.serial_number ? `${player.serial_number} - ` : ""}${player.player_name || ""}`;
  doc.text(pdfTruncate(doc, nameText, cw - statusW - 2), cx, y + 6.75, { baseline: "middle" });

  // Role pill (with role icon)
  pdfPill(doc, player.player_role || "-", cx, y + 12, 5.5, PDF_PINK, PDF_PINK_SOFT, { maxW: cw, icon: pdfRoleIcon(player.player_role) });

  // Base price box
  const boxY = y + 20.5;
  const boxH = PDF_CARD_H - 20.5 - 3;
  doc.setFillColor(...PDF_PINK_FAINT);
  doc.roundedRect(cx, boxY, cw, boxH, 2, 2, "F");
  const iconCx = cx + 6;
  const iconCy = boxY + boxH / 2;
  doc.setFillColor(...PDF_WHITE);
  doc.circle(iconCx, iconCy, 3.6, "F");
  iconCoins(doc, iconCx, iconCy, 4.2, PDF_PINK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_MUTED);
  doc.text("Base Price", cx + 12.5, boxY + boxH * 0.32, { baseline: "middle" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...PDF_PINK);
  doc.text(`Rs. ${Number(player.base_price || 0).toLocaleString("en-IN")}`, cx + 12.5, boxY + boxH * 0.7, { baseline: "middle" });
}

/* ---------------------------------------------------------------------- */
/* Modal overlay wrapper — fixes the "opens at top of page" problem by     */
/* rendering the form/history as a centered, fixed-position pop-up with    */
/* its own scroll region, instead of an inline block in the page flow.     */
/* ---------------------------------------------------------------------- */
function ModalOverlay({ onClose, children }) {
  useEffect(() => {
    // Lock background scroll while a modal is open
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, []);

  useEffect(() => {
    function onKeyDown(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-3xl sm:my-0"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default function PlayersPage() {
  const { auctionId } = useParams();
  const [auction, setAuction] = useState(null);
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState(emptyPlayer);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [correctionPlayer, setCorrectionPlayer] = useState(null);
  const [correction, setCorrection] = useState(emptyCorrection);
  const [historyPlayer, setHistoryPlayer] = useState(null);
  const [history, setHistory] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [uploadingPlayers, setUploadingPlayers] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  async function load() {
    try {
      setError("");
      const [dash, playerRes, teamRes] = await Promise.all([
        api.get(`/auctions/${auctionId}/dashboard`),
        api.get(`/players/auction/${auctionId}`),
        api.get(`/teams/auction/${auctionId}`),
      ]);
      setAuction(dash.data.auction);
      setPlayers(playerRes.data);
      setTeams(teamRes.data);
      if (playerRes.data.length > 0) {
        setSelectedPlayer(playerRes.data[0]);
      }
    } catch (err) {
      console.error("load players error", err);
      setError(err.response?.data?.message || "Failed to load players");
    }
  }

  useEffect(() => { load(); }, [auctionId]);

  useEffect(() => {
    setSelectedPlayerIds((current) => current.filter((id) => players.some((p) => p.id === id)));
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = players.filter((player) => {
      const statusMatch = status === "ALL" || player.status === status;
      const textMatch = !q || [player.serial_number, player.player_name, player.player_mobile, player.category, player.player_role, player.area, player.sold_team_name].join(" ").toLowerCase().includes(q);
      return statusMatch && textMatch;
    });

    if (!q) return filtered;

    // Sort to prioritize serial number matches
    return filtered.sort((a, b) => {
      const aSerial = String(a.serial_number || "").toLowerCase();
      const bSerial = String(b.serial_number || "").toLowerCase();
      
      const aExact = aSerial === q ? 1 : 0;
      const bExact = bSerial === q ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      const aStart = aSerial.startsWith(q) ? 1 : 0;
      const bStart = bSerial.startsWith(q) ? 1 : 0;
      if (aStart !== bStart) return bStart - aStart;

      return 0;
    });
  }, [players, search, status]);

  const counts = useMemo(() => {
    return {
      total: players.length,
      available: players.filter((p) => p.status === "AVAILABLE").length,
      sold: players.filter((p) => p.status === "SOLD").length,
      unsold: players.filter((p) => p.status === "UNSOLD" || p.status === "FINAL_UNSOLD").length,
    };
  }, [players]);

  const filteredPlayerIds = useMemo(() => filteredPlayers.map((p) => p.id), [filteredPlayers]);
  const allFilteredSelected = filteredPlayerIds.length > 0 && filteredPlayerIds.every((id) => selectedPlayerIds.includes(id));

  function togglePlayerSelection(playerId) {
    const id = Number(playerId);
    setSelectedPlayerIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedPlayerIds((current) => current.filter((id) => !filteredPlayerIds.includes(id)));
    } else {
      setSelectedPlayerIds((current) => Array.from(new Set([...current, ...filteredPlayerIds])));
    }
  }

  async function deleteSelectedPlayers() {
    setMessage("");
    setError("");
    setShowConfirmDelete(false);

    try {
      const response = await api.post("/players/bulk-delete", { playerIds: selectedPlayerIds });
      setMessage(response.data?.message || "Selected players deleted successfully");
      setSelectedPlayerIds([]);
      setSelectionMode(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete selected players");
    }
  }

  function downloadTemplate() {
    const rows = [
      { "Serial Number": "1", "Player Name": "Rahul Jain", Mobile: "9111111111", Email: "", Category: "A", Role: "ALL_ROUNDER", "Base Price": 500, "T-shirt Size": "XL", Age: 31, Area: "Bhayander", "Previous Team": "", "Photo URL": "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=300&auto=format&fit=crop", "Rich Text Info": "<h2>Stats</h2><ul><li>Matches: 10</li><li>Runs: 500</li></ul>" },
      { "Serial Number": "2", "Player Name": "Priya Sharma", Mobile: "9222222222", Email: "", Category: "B", Role: "BATSMAN", "Base Price": 300, "T-shirt Size": "M", Age: 25, Area: "Andheri", "Previous Team": "", "Photo URL": "https://drive.google.com/file/d/YOUR_FILE_ID_HERE/view?usp=sharing", "Rich Text Info": "<h2>Stats</h2><ul><li>Matches: 5</li></ul>" },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Players");
    XLSX.writeFile(wb, "sportzmitra-players-template.xlsx");
  }

  async function downloadPlayersPdf(categoryWise = false) {
    setDownloadingPdf(true);
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });

      // Background (public/pdf-bg.png) + all player photos, loaded up front
      const bg = await loadImageCover("/pdf-bg.png", PDF_W / PDF_H, 1240, { quality: 0.85 });
      const photoList = await Promise.all(players.map((p) => loadImageCover(p.photo_url, PDF_PHOTO_W / PDF_PHOTO_H, 240, { round: true })));
      const photos = new Map(players.map((p, i) => [p.id, photoList[i]]));

      // Group players by category if categoryWise is true
      const groups = {};
      if (categoryWise) {
        players.forEach(p => {
          const cat = p.category || "Uncategorized";
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(p);
        });
      } else {
        groups["All Players"] = players;
      }

      const eventName = auction?.auction_name || "Players Registry";
      let isFirstPage = true;

      for (const [groupName, groupPlayers] of Object.entries(groups)) {
        if (!isFirstPage) doc.addPage();
        isFirstPage = false;

        const startPage = (full) => {
          pdfDrawPageBackground(doc, bg);
          return pdfDrawHeader(doc, {
            full,
            line1: eventName,
            line2: categoryWise ? `Category: ${groupName}` : "Player Registry",
            total: groupPlayers.length,
            eventName,
          });
        };

        let y = startPage(true);

        groupPlayers.forEach((p, i) => {
          const col = i % PDF_COLS;
          if (col === 0) {
            if (i > 0) y += PDF_CARD_H + PDF_GAP;
            if (y + PDF_CARD_H > PDF_H - 12) {
              doc.addPage();
              y = startPage(false);
            }
          }
          const x = PDF_MARGIN + col * (PDF_CARD_W + PDF_GAP);
          pdfDrawPlayerCard(doc, p, photos.get(p.id), x, y);
        });
      }

      doc.save(`${(auction?.auction_name || "Players").replace(/\s+/g, '_')}_${categoryWise ? 'Category_Wise' : 'All'}.pdf`);
    } catch (err) {
      console.error("PDF download failed", err);
      alert("Failed to generate PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  function openAdd() { setEditingPlayer(null); setForm(emptyPlayer); setShowForm(true); }
  function openEdit(player) { setEditingPlayer(player); setForm({ ...emptyPlayer, ...player, base_price: player.base_price || "", age: player.age || "" }); setShowForm(true); }

  async function savePlayer(event) {
    event.preventDefault();
    try {
      setError("");
      const payload = { ...form, auction_id: Number(auctionId), base_price: Number(form.base_price || 0) };
      if (editingPlayer) {
        await api.put(`/players/${editingPlayer.id}`, payload);
        setMessage("Player updated successfully.");
      } else {
        await api.post("/players", payload);
        setMessage("Player added successfully.");
      }
      setForm(emptyPlayer); setEditingPlayer(null); setShowForm(false); load();
    } catch (err) {
      console.error("save player error", err);
      setError(err.response?.data?.message || "Failed to save player");
    }
  }

  async function uploadPlayers(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      setUploadingPlayers(true);
      setError(""); const fd = new FormData(); fd.append("file", file);
      const res = await api.post(`/players/upload/${auctionId}`, fd);
      const failed = Number(res.data?.failed || 0);
      setMessage(failed ? `Players uploaded: ${res.data.count}, failed rows: ${failed}` : "Players uploaded successfully");
      load();
    } catch (err) { console.error("upload players error", err); setError(err.response?.data?.message || "Failed to upload players"); }
    finally { setUploadingPlayers(false); event.target.value = ""; }
  }

  async function uploadPhoto(file) {
    if (!file) return;
    try {
      setUploadingPhoto(true); setError(""); const fd = new FormData(); fd.append("photo", file);
      const res = await api.post("/players/upload-photo", fd);
      setForm((prev) => ({ ...prev, photo_url: res.data.photo_url, original_photo_url: res.data.original_photo_url || "", photo_processing_status: res.data.photo_processing_status || "", photo_processing_mode: res.data.photo_processing_mode || "" }));
      setMessage("Photo uploaded successfully.");
    } catch (err) { console.error("upload photo error", err); setError(err.response?.data?.message || "Failed to upload photo"); }
    finally { setUploadingPhoto(false); }
  }

  function openCorrection(player, statusOverride) {
    setCorrectionPlayer(player);
    setCorrection({ status: statusOverride || player.status || "AVAILABLE", sold_team_id: player.sold_team_id || "", sold_price: player.sold_price || "", auction_round: player.auction_round || "MAIN", category: player.category || "", player_role: player.player_role || "", base_price: player.base_price || "", tshirt_size: player.tshirt_size || "", reason: "" });
  }

  async function saveCorrection(event) {
    event.preventDefault();
    try {
      setError("");
      await api.patch(`/players/${correctionPlayer.id}/correction`, { ...correction, sold_price: Number(correction.sold_price || 0), sold_team_id: correction.sold_team_id ? Number(correction.sold_team_id) : null, base_price: correction.base_price === "" ? null : Number(correction.base_price) });
      setMessage("Player correction saved.");
      setCorrectionPlayer(null); setCorrection(emptyCorrection); load();
    } catch (err) { console.error("correction error", err); setError(err.response?.data?.message || "Failed to save correction"); }
  }

  async function openHistory(player) {
    setHistoryPlayer(player); setHistory(null);
    try { const res = await api.get(`/players/${player.id}/history`); setHistory(res.data); }
    catch (err) { setError(err.response?.data?.message || "Failed to load history"); }
  }

  const activeFocusPlayer = selectedPlayer || filteredPlayers[0];

  return (
    <AdminLayout title="Players" subtitle={auction?.auction_name || "Manage auction players"} active="Players" auctionId={auctionId} organizationId={auction?.organization_id} publicSlug={auction?.public_slug}>
      <div className="min-h-screen bg-white p-4 sm:p-6 lg:p-8 font-sans text-slate-900">
        <div className="mx-auto max-w-7xl space-y-6">

          {/* Header */}
          <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-pink-600">Player Registry</div>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                {auction?.auction_name || "Player Pool"}
              </h1>
            </div>

            {/* Stat rail */}
            <div className="flex items-stretch divide-x divide-slate-200 rounded-xl border border-slate-200">
              <StatCell label="Total" value={counts.total} />
              <StatCell label="Available" value={counts.available} accent="text-emerald-600" />
              <StatCell label="Sold" value={counts.sold} accent="text-pink-600" />
              <StatCell label="Unsold" value={counts.unsold} accent="text-slate-400" />
            </div>
          </div>

          {/* Filter Bar & Quick Actions */}
          <div className="space-y-3">
            {/* Row 1: search + status filter */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative w-full shrink-0 lg:w-72 xl:w-80">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search player, role, team..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                />
              </div>

              {/* Segmented status filter: never wraps, scrolls sideways if space runs out */}
              <div className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:w-fit">
                {STATUS_FILTERS.map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatus(st)}
                    className={`h-8 shrink-0 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition ${
                      status === st
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-500 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    {st.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: actions.
                Mobile: 2-column grid, Add Player full width on top.
                sm+: single wrapping row, pushed right on large screens. */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:justify-end">
              <button onClick={openAdd} className={`${actionGreen} col-span-2 sm:order-4 sm:col-span-1`}>
                <Plus size={16} className="shrink-0" />
                Add Player
              </button>
              <label className={`${actionPink} sm:order-5`}>
                <Upload size={16} className="shrink-0" />
                Upload Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={uploadPlayers} />
              </label>
              <button onClick={downloadTemplate} className={`${actionOutline} sm:order-3`}>
                <Download size={16} className="shrink-0" />
                Template
              </button>
              <button
                onClick={() => downloadPlayersPdf(false)}
                disabled={downloadingPdf || players.length === 0}
                className={`${actionOutline} sm:order-1`}
              >
                <Download size={16} className="shrink-0" />
                {downloadingPdf ? "Generating..." : "PDF (All)"}
              </button>
              <button
                onClick={() => downloadPlayersPdf(true)}
                disabled={downloadingPdf || players.length === 0}
                className={`${actionOutline} sm:order-2`}
              >
                <Download size={16} className="shrink-0" />
                {downloadingPdf ? "Generating..." : "PDF (Category)"}
              </button>
              <button
                onClick={() => {
                  setSelectionMode((v) => !v);
                  setSelectedPlayerIds([]);
                }}
                className={`inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs font-semibold transition sm:px-4 sm:text-sm sm:order-6 ${
                  selectionMode
                    ? "border border-pink-300 bg-pink-50 text-[#EC008C] hover:bg-pink-100"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {selectionMode ? "Cancel" : "Manage"}
              </button>
            </div>
          </div>

          {/* Feedback Banners */}
          {message && (
            <div className="rounded-xl border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-xl border-l-4 border-pink-500 bg-pink-50 px-4 py-3 text-sm font-medium text-pink-800">
              {error}
            </div>
          )}

          {/* Modal Overlays — now pop up centered over the page instead of
              being inserted inline into the page flow */}
          {showForm && (
            <ModalOverlay onClose={() => { setShowForm(false); setEditingPlayer(null); setForm(emptyPlayer); }}>
              <PlayerForm
                title={editingPlayer ? "Edit Player" : "Add Player"}
                form={form}
                setForm={setForm}
                onSubmit={savePlayer}
                onClose={() => { setShowForm(false); setEditingPlayer(null); setForm(emptyPlayer); }}
                onPhotoUpload={uploadPhoto}
                uploadingPhoto={uploadingPhoto}
              />
            </ModalOverlay>
          )}
          {correctionPlayer && (
            <ModalOverlay onClose={() => setCorrectionPlayer(null)}>
              <CorrectionModal
                player={correctionPlayer}
                teams={teams}
                correction={correction}
                setCorrection={setCorrection}
                onSubmit={saveCorrection}
                onClose={() => setCorrectionPlayer(null)}
              />
            </ModalOverlay>
          )}
          {historyPlayer && (
            <ModalOverlay onClose={() => setHistoryPlayer(null)}>
              <HistoryModal
                player={historyPlayer}
                history={history}
                onClose={() => setHistoryPlayer(null)}
              />
            </ModalOverlay>
          )}

          {uploadingPlayers && (
            <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white shadow-xl">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-pink-600"></div>
              </div>
              <div className="mt-4 text-sm font-semibold text-white">Uploading players, please wait...</div>
            </div>
          )}

          {showConfirmDelete && (
            <ConfirmDeleteModal
              title="Delete Players?"
              message={`Are you sure you want to delete ${selectedPlayerIds.length} selected player(s)? This action cannot be undone.`}
              onConfirm={deleteSelectedPlayers}
              onClose={() => setShowConfirmDelete(false)}
            />
          )}

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* Left Column: Focus player rendered as an auction lot ticket */}
            <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-6">
              {activeFocusPlayer ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-start justify-between gap-3 p-5">
                    <div className="flex items-start gap-4">
                      <img
                        src={activeFocusPlayer.photo_url || DEFAULT_PLAYER_IMAGE}
                        alt={activeFocusPlayer.player_name}
                        className="h-16 w-16 rounded-xl border border-slate-200 object-cover"
                        onError={(e) => { e.currentTarget.src = DEFAULT_PLAYER_IMAGE; }}
                      />
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Lot #{activeFocusPlayer.id}</span>
                        <h2 className="text-xl font-black tracking-tight text-slate-900">
                          {activeFocusPlayer.player_name}
                        </h2>
                      </div>
                    </div>
                    <StatusBadge status={activeFocusPlayer.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-4 px-5 pb-5 text-sm">
                    <InfoField label="Role" value={activeFocusPlayer.player_role} />
                    <InfoField label="Category" value={activeFocusPlayer.category} />
                    <InfoField label="Mobile" value={activeFocusPlayer.player_mobile} />
                    <InfoField label="Area" value={activeFocusPlayer.area} />
                    <div className="col-span-2">
                      <InfoField label="Previous / assigned team" value={activeFocusPlayer.previous_team || "None"} />
                    </div>
                  </div>

                  <TicketPerforation />

                  {/* Price block — flat, no gradient; the one bold moment */}
                  <div className="bg-slate-900 px-5 py-6 text-center">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {activeFocusPlayer.status === "SOLD" ? "Final sold price" : "Base price"}
                    </span>
                    <span className="mt-1.5 block font-mono text-4xl font-black tabular-nums text-emerald-400">
                      ₹{money(activeFocusPlayer.sold_price || activeFocusPlayer.base_price)}
                    </span>
                  </div>

                  <div className="flex gap-2 p-4">
                    <button
                      onClick={() => openEdit(activeFocusPlayer)}
                      className="flex-1 inline-flex justify-center items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <Edit3 size={14} /> Edit
                    </button>
                    <button
                      onClick={() => openCorrection(activeFocusPlayer)}
                      className="flex-1 inline-flex justify-center items-center gap-1.5 rounded-lg border border-pink-200 bg-pink-50 py-2.5 text-xs font-semibold text-pink-700 transition hover:bg-pink-100"
                    >
                      <Wrench size={14} /> Correct
                    </button>
                    <button
                      onClick={() => openHistory(activeFocusPlayer)}
                      className="flex-1 inline-flex justify-center items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <History size={14} /> History
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm font-medium text-slate-400">
                  No player selected.
                </div>
              )}
            </div>

            {/* Right Column: Player Cards Grid */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
              {/* Selection Toolbar (moved here so it aligns with cards) */}
              {selectionMode && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <button
                    onClick={toggleSelectAllFiltered}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    {allFilteredSelected ? (
                      <CheckSquare size={16} className="text-[#EC008C]" />
                    ) : (
                      <Square size={16} />
                    )}
                    Select all ({filteredPlayers.length})
                  </button>

                  {selectedPlayerIds.length > 0 && (
                    <button
                      onClick={() => setShowConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-pink-700"
                    >
                      <Trash2 size={14} />
                      Delete Selected ({selectedPlayerIds.length})
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredPlayers.map((player, idx) => {
                  const isSelectedForFocus = activeFocusPlayer?.id === player.id;
                  const isChecked = selectedPlayerIds.includes(player.id);
                  return (
                    <div
                      key={player.id}
                      onClick={(e) => {
                        if (selectionMode) {
                          e.preventDefault();
                          togglePlayerSelection(player.id);
                        } else {
                          setSelectedPlayer(player);
                        }
                      }}
                      className={`relative flex items-stretch gap-4 rounded-xl border p-3.5 transition cursor-pointer ${
                        selectionMode && isChecked
                          ? "border-[#EC008C] bg-pink-50 ring-1 ring-[#EC008C]"
                          : isSelectedForFocus && !selectionMode
                          ? "border-pink-500 bg-pink-50/60"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      {selectionMode && (
                        <div className="absolute right-3 top-3 z-10 flex h-5 w-5 items-center justify-center rounded bg-white">
                          {isChecked ? (
                            <CheckSquare size={20} className="text-[#EC008C]" />
                          ) : (
                            <Square size={20} className="text-slate-300 hover:text-slate-400" />
                          )}
                        </div>
                      )}
                      <div className="relative w-20 h-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        <img
                          src={player.photo_url || DEFAULT_PLAYER_IMAGE}
                          alt={player.player_name}
                          className="h-full w-full object-cover object-center"
                          onError={(e) => { e.currentTarget.src = DEFAULT_PLAYER_IMAGE; }}
                        />
                        <div className="absolute top-1 left-1 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {idx + 1}
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col justify-between min-w-0 py-0.5">
                        <div className="space-y-0.5">
                          <h3 className="text-sm font-bold text-slate-900 truncate">
                            {player.serial_number ? `${player.serial_number} - ` : ""}{player.player_name}
                          </h3>
                          <p className="truncate text-xs font-semibold text-slate-600">{player.player_role || "—"}</p>
                          <p className="truncate text-xs text-slate-400">
                            {player.category || "—"} &middot; {player.previous_team || "No previous team"}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                          <span className="font-mono font-bold text-slate-900 text-sm tabular-nums">
                            ₹{money(player.base_price)}
                          </span>
                          <StatusBadge status={player.status} />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredPlayers.length === 0 && (
                  <div className="col-span-full rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm font-medium text-slate-400">
                    No players match the current criteria.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCell({ label, value, accent = "text-slate-900" }) {
  return (
    <div className="px-4 py-2.5 text-center first:pl-4 last:pr-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`font-mono text-lg font-black tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}

function TicketPerforation() {
  return (
    <div className="relative">
      <div className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white border border-slate-200" />
      <div className="mx-5 border-t border-dashed border-slate-300" />
      <div className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white border border-slate-200" />
    </div>
  );
}

function InfoField({ label, value }) {
  return (
    <div>
      <span className="block text-[11px] font-medium text-slate-400">{label}</span>
      <span className="font-semibold text-slate-900">{value || "—"}</span>
    </div>
  );
}

function PlayerForm({ title, form, setForm, onSubmit, onClose, onPhotoUpload, uploadingPhoto }) {
  function set(key, value) { setForm({ ...form, [key]: value }); }
  return (
    <form onSubmit={onSubmit} className="max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
      <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">Enter player details for the master list.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50">
          <X size={18} />
        </button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-[140px_1fr]">
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <img
            src={form.photo_url || DEFAULT_PLAYER_IMAGE}
            alt="Preview"
            className="w-20 h-24 rounded-lg object-cover border border-slate-200"
            onError={(e) => { e.currentTarget.src = DEFAULT_PLAYER_IMAGE; }}
          />
          <span className="mt-2 text-[11px] font-medium text-slate-400">Image preview</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Photo URL" value={form.photo_url} onChange={(v) => set("photo_url", v)} placeholder="https://example.com/photo.jpg" />
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Manual photo upload</span>
            <span className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700">
              <ImagePlus size={16} />
              {uploadingPhoto ? "Uploading..." : "Upload file"}
              <input disabled={uploadingPhoto} type="file" accept="image/*" className="hidden" onChange={(e) => onPhotoUpload(e.target.files?.[0])} />
            </span>
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Input label="Serial Number (ID)" value={form.serial_number} onChange={(v) => set("serial_number", v)} />
        <Input label="Player Name" value={form.player_name} onChange={(v) => set("player_name", v)} required />
        <Input label="Mobile" value={form.player_mobile} onChange={(v) => set("player_mobile", v)} />
        <Input label="Email" value={form.player_email} onChange={(v) => set("player_email", v)} />
        <Input label="Category" value={form.category} onChange={(v) => set("category", v)} />
        <Input label="Role" value={form.player_role} onChange={(v) => set("player_role", v)} />
        <Input label="Base Price" type="number" value={form.base_price} onChange={(v) => set("base_price", v)} required />
        <Input label="T-shirt Size" value={form.tshirt_size} onChange={(v) => set("tshirt_size", v)} />
        <Input label="Age" type="number" value={form.age} onChange={(v) => set("age", v)} />
        <Input label="Area" value={form.area} onChange={(v) => set("area", v)} />
        <Input label="Previous Team" value={form.previous_team} onChange={(v) => set("previous_team", v)} />
      </div>

      <div className="mt-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Rich Text Info (HTML)</span>
          <textarea
            value={form.player_info || ""}
            onChange={(e) => set("player_info", e.target.value)}
            placeholder="<h2>Stats</h2><ul><li>Matches: 10</li></ul>"
            className="w-full min-h-[120px] rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/15"
          />
        </label>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700">
          <Save size={16} /> Save Player
        </button>
      </div>
    </form>
  );
}

function CorrectionModal({ player, teams, correction, setCorrection, onSubmit, onClose }) {
  function set(key, value) { setCorrection({ ...correction, [key]: value }); }
  return (
    <form onSubmit={onSubmit} className="max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
      <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-pink-700">Correction: {player.player_name}</h3>
          <p className="text-sm text-slate-500">Update status or team assignment. A reason is required.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50">
          <X size={18} />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Status</span>
          <select value={correction.status} onChange={(e) => set("status", e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-500/15">
            <option value="AVAILABLE">AVAILABLE</option>
            <option value="UNSOLD">UNSOLD</option>
            <option value="FINAL_UNSOLD">FINAL_UNSOLD</option>
            <option value="SOLD">SOLD</option>
            <option value="WITHDRAWN">WITHDRAWN</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Sold Team</span>
          <select value={correction.sold_team_id || ""} onChange={(e) => set("sold_team_id", e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-500/15">
            <option value="">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.team_name} — Left ₹{money(t.remaining_purse)}</option>
            ))}
          </select>
        </label>
        <Input label="Sold Amount" type="number" value={correction.sold_price} onChange={(v) => set("sold_price", v)} />
        <Input label="Reason *" value={correction.reason} onChange={(v) => set("reason", v)} required />
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-700">
          <Wrench size={16} /> Save Correction
        </button>
      </div>
    </form>
  );
}

function HistoryModal({ player, history, onClose }) {
  return (
    <div className="max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
      <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
        <h3 className="text-lg font-bold text-slate-900">History: {player.player_name}</h3>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50">
          <X size={18} />
        </button>
      </div>
      {!history ? (
        <p className="py-8 text-center text-sm font-medium text-slate-400">Loading history...</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <HistoryList title="Actions" rows={history.actions} />
          <HistoryList title="Attempts" rows={history.attempts} />
          <HistoryList title="Bids" rows={history.bids} />
        </div>
      )}
    </div>
  );
}

function HistoryList({ title, rows = [] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="space-y-2 text-xs">
        {rows.length === 0 && <div className="py-2 text-slate-400">No records found</div>}
        {rows.map((r, i) => (
          <div key={r.id || i} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="font-semibold text-slate-900">{r.action_type || r.result || r.team_name || `Bid ₹${r.bid_amount}`}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">{r.reason || r.created_at}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      <input
        required={required}
        type={type}
        value={value || ""}
        placeholder={placeholder || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
      />
    </label>
  );
}