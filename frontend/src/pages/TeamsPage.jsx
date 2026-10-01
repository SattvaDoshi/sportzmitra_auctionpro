import {
  Download,
  Plus,
  Save,
  Search,
  Trash2,
  X,
  ArrowRight,
  CheckSquare,
  Square,
  Edit2,
  Users,
  Wallet,
  Shirt,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import AdminLayout from "../components/layout/AdminLayout";
import LogoPicker from "../components/ui/LogoPicker";
import TeamLogo from "../components/ui/TeamLogo";
import api from "../api/api";

const emptyTeam = {
  team_name: "",
  short_name: "",
  owner_name: "",
  owner_mobile: "",
  total_purse: "",
  remaining_purse: "",
  player_limit: "",
  logo_url: "",
  team_whatsapp_group_link: "",
  status: "ACTIVE",
};

const DEFAULT_MAX_SQUAD = 18;

// Fallback high-quality sports logos hosted online
const DEFAULT_LOGOS = [
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80",
  "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=120&q=80",
  "https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=120&q=80",
  "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=120&q=80",
];

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function initials(teamName = "TEAM") {
  const words = String(teamName)
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

/* ---------------------------------------------------------------------- */
/* PDF design helpers — fixed A4 layout, so it looks identical on every    */
/* device. Background image lives at /public/pdf-bg.png.                    */
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


function iconWallet(doc, cx, cy, s, c) {
  doc.setFillColor(...c);
  doc.roundedRect(cx - 0.5 * s, cy - 0.34 * s, 1.0 * s, 0.72 * s, 0.12 * s, 0.12 * s, "F");
  doc.setFillColor(...PDF_WHITE);
  doc.roundedRect(cx + 0.1 * s, cy - 0.06 * s, 0.4 * s, 0.26 * s, 0.06 * s, 0.06 * s, "F");
  doc.setFillColor(...c);
  doc.circle(cx + 0.25 * s, cy + 0.07 * s, 0.06 * s, "F");
}

// Page header for a team roster; returns the Y where cards should start
function pdfDrawTeamHeader(doc, { full, teamName, total, purse }) {
  doc.setFont("helvetica", "bold");

  if (!full) {
    let size = 14;
    doc.setFontSize(size);
    while (doc.getTextWidth(teamName) > PDF_W - PDF_MARGIN * 2 && size > 9) { size -= 1; doc.setFontSize(size); }
    doc.setTextColor(...PDF_DARK);
    doc.text(teamName, PDF_MARGIN, 17);
    doc.setDrawColor(...PDF_PINK);
    doc.setLineWidth(0.8);
    doc.line(PDF_MARGIN, 20.5, PDF_MARGIN + 14, 20.5);
    return 27;
  }

  const chipH = 18;
  const chipY = 12;
  const chip2W = 52;
  const chip1W = 36;
  const chip2X = PDF_W - PDF_MARGIN - chip2W;
  const chip1X = chip2X - 3 - chip1W;

  const titleMaxW = chip1X - PDF_MARGIN - 5;
  const line2 = "Team Roster";
  let size = 22;
  doc.setFontSize(size);
  while ((doc.getTextWidth(teamName) > titleMaxW || doc.getTextWidth(line2) > titleMaxW) && size > 12) {
    size -= 1;
    doc.setFontSize(size);
  }
  doc.setTextColor(...PDF_DARK);
  doc.text(teamName, PDF_MARGIN, 21);
  doc.setTextColor(...PDF_PINK);
  doc.text(line2, PDF_MARGIN, 30);
  doc.setDrawColor(...PDF_PINK);
  doc.setLineWidth(0.8);
  doc.line(PDF_MARGIN, 34, PDF_MARGIN + 18, 34);

  [
    [chip1X, chip1W, "Total Players", String(total), iconUsers],
    [chip2X, chip2W, "Purse Remaining", purse, iconWallet],
  ].forEach(([cx, cw, label, value, icon]) => {
    const midY = chipY + chipH / 2;
    doc.setFillColor(...PDF_WHITE);
    doc.setDrawColor(...PDF_BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, chipY, cw, chipH, 3.5, 3.5, "FD");
    doc.setFillColor(...PDF_PINK_SOFT);
    doc.circle(cx + 7, midY, 4.2, "F");
    icon(doc, cx + 7, midY, 4.4, PDF_PINK);
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

// One sold player: photo, name, category, role and sold price
function pdfDrawRosterCard(doc, player, photo, x, y) {
  doc.setFillColor(...PDF_WHITE);
  doc.setDrawColor(...PDF_BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, PDF_CARD_W, PDF_CARD_H, 3, 3, "FD");

  const px = x + 3;
  const py = y + 3;
  doc.setFillColor(...PDF_PINK_SOFT);
  doc.roundedRect(px, py, PDF_PHOTO_W, PDF_PHOTO_H, 2, 2, "F");
  if (photo) {
    try { doc.addImage(photo.data, photo.type, px, py, PDF_PHOTO_W, PDF_PHOTO_H, undefined, "FAST"); } catch (e) {}
  } else {
    const ini = String(player.player_name || "?").split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...PDF_PINK);
    doc.text(ini, px + PDF_PHOTO_W / 2, py + PDF_PHOTO_H / 2, { align: "center", baseline: "middle" });
  }
  doc.setDrawColor(...PDF_BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(px, py, PDF_PHOTO_W, PDF_PHOTO_H, 2, 2, "S");

  const cx = px + PDF_PHOTO_W + 4;
  const cw = x + PDF_CARD_W - 3 - cx;

  // Category pill (top-right)
  let catW = 0;
  if (player.category) {
    catW = pdfPill(doc, String(player.category), x + PDF_CARD_W - 3, y + 4, 5.5, [37, 99, 235], [219, 234, 254], { alignRight: true, maxW: 30 });
  }

  // Name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_DARK);
  doc.text(pdfTruncate(doc, player.player_name || "", cw - catW - (catW ? 2 : 0)), cx, y + 6.75, { baseline: "middle" });

  // Role pill (with role icon)
  pdfPill(doc, player.player_role || "-", cx, y + 12, 5.5, PDF_PINK, PDF_PINK_SOFT, { maxW: cw, icon: pdfRoleIcon(player.player_role) });

  // Sold price box
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
  doc.text("Sold Price", cx + 12.5, boxY + boxH * 0.32, { baseline: "middle" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...PDF_PINK);
  doc.text(`Rs. ${Number(player.sold_price || 0).toLocaleString("en-IN")}`, cx + 12.5, boxY + boxH * 0.7, { baseline: "middle" });
}

// Loads the page background and every player photo once
async function loadTeamPdfAssets(players) {
  const bg = await loadImageCover("/pdf-bg.png", PDF_W / PDF_H, 1240, { quality: 0.85 });
  const list = await Promise.all(
    players.map((p) => loadImageCover(p.photo_url, PDF_PHOTO_W / PDF_PHOTO_H, 240, { round: true }))
  );
  return { bg, photos: new Map(players.map((p, i) => [p.id, list[i]])) };
}

// Draws one team's roster starting on the current page of `doc`
function drawTeamRosterPages(doc, team, teamPlayers, assets) {
  const purse = `Rs. ${Number(team.remaining_purse || 0).toLocaleString("en-IN")}`;
  const startPage = (full) => {
    pdfDrawPageBackground(doc, assets.bg);
    return pdfDrawTeamHeader(doc, { full, teamName: team.team_name || "Team", total: teamPlayers.length, purse });
  };

  let y = startPage(true);

  if (teamPlayers.length === 0) {
    doc.setFillColor(...PDF_WHITE);
    doc.setDrawColor(...PDF_BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(PDF_MARGIN, y, PDF_W - PDF_MARGIN * 2, 20, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...PDF_MUTED);
    doc.text("No players bought yet.", PDF_W / 2, y + 10, { align: "center", baseline: "middle" });
    return;
  }

  teamPlayers.forEach((p, i) => {
    const col = i % PDF_COLS;
    if (col === 0) {
      if (i > 0) y += PDF_CARD_H + PDF_GAP;
      if (y + PDF_CARD_H > PDF_H - 12) {
        doc.addPage();
        y = startPage(false);
      }
    }
    const x = PDF_MARGIN + col * (PDF_CARD_W + PDF_GAP);
    pdfDrawRosterCard(doc, p, assets.photos.get(p.id), x, y);
  });
}

export default function TeamsPage() {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const [auction, setAuction] = useState(null);
  const [teams, setTeams] = useState([]);
  const [recentTeams, setRecentTeams] = useState([]);
  const [form, setForm] = useState(emptyTeam);
  const [editingTeam, setEditingTeam] = useState(null);
  const [viewingTeam, setViewingTeam] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [maxBidMap, setMaxBidMap] = useState({});

  async function load() {
    try {
      const [dash, teamRes, recentRes, mbRes] = await Promise.all([
        api.get(`/auctions/${auctionId}/dashboard`),
        api.get(`/teams/auction/${auctionId}`),
        api.get(`/teams/recent`).catch(() => ({ data: [] })),
        api.get(`/live/${auctionId}/max-bid?absolute=true`).catch(() => ({ data: { maxBidMap: {} } })),
      ]);
      setAuction(dash.data.auction);
      setTeams(teamRes.data || []);
      setRecentTeams(recentRes.data || []);
      setMaxBidMap(mbRes.data?.maxBidMap || {});
    } catch (err) {
      console.error("Failed to load auction context", err);
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [auctionId]);

  useEffect(() => {
    setSelectedTeamIds((current) =>
      current.filter((id) => teams.some((team) => Number(team.id) === Number(id)))
    );
  }, [teams]);

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((team) =>
      [
        team.team_name,
        team.short_name,
        team.owner_name,
        team.owner_mobile,
        team.team_whatsapp_group_link,
        initials(team.team_name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [teams, search]);

  const filteredTeamIds = useMemo(
    () => filteredTeams.map((team) => Number(team.id)),
    [filteredTeams]
  );
  const allFilteredSelected =
    filteredTeamIds.length > 0 &&
    filteredTeamIds.every((id) => selectedTeamIds.includes(id));

  const totalPurseRemaining = teams.reduce(
    (sum, team) => sum + Number(team.remaining_purse ?? team.total_purse ?? 0),
    0
  );
  const totalPlayers = teams.reduce(
    (sum, team) => sum + Number(team.players_bought || team.sold_players_count || 0),
    0
  );

  function toggleTeamSelection(teamId) {
    const id = Number(teamId);
    setSelectedTeamIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedTeamIds((current) =>
        current.filter((id) => !filteredTeamIds.includes(id))
      );
      return;
    }
    setSelectedTeamIds((current) =>
      Array.from(new Set([...current, ...filteredTeamIds]))
    );
  }

  async function deleteSelectedTeams() {
    setMessage("");
    setError("");

    if (selectedTeamIds.length === 0) {
      setError("Please select at least one team");
      return;
    }

    const confirmation = window.prompt(
      `Delete ${selectedTeamIds.length} selected team${
        selectedTeamIds.length === 1 ? "" : "s"
      }?\n\nType DELETE to confirm.`
    );

    if (confirmation !== "DELETE") return;

    try {
      const response = await api.post("/teams/bulk-delete", {
        teamIds: selectedTeamIds,
      });
      setMessage(response.data?.message || "Selected teams deleted successfully");
      setSelectedTeamIds([]);
      setSelectionMode(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete selected teams");
    }
  }

  function resetForm() {
    setForm(emptyTeam);
    setEditingTeam(null);
    setShowForm(false);
  }

  function downloadTemplate() {
    const rows = [
      {
        "Team Name": "Royal Strikers",
        "Owner Name": "John Doe",
        "Owner Mobile": "9876543210",
        "Total Purse": 50000,
        "Logo URL": "",
        "WhatsApp Group Link": "",
      },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Teams");
    XLSX.writeFile(wb, "sportzmitra-teams-template.xlsx");
  }

  const downloadAllTeamsPDF = async () => {
    setDownloadingAll(true);
    try {
      const res = await api.get(`/players/auction/${auctionId}`);
      const allPlayers = res.data || [];

      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const soldPlayers = allPlayers.filter((p) => p.status === "SOLD");
      const assets = await loadTeamPdfAssets(soldPlayers);
      let isFirstPage = true;

      for (const team of teams) {
        if (!isFirstPage) {
          doc.addPage();
        }
        isFirstPage = false;

        const teamPlayers = allPlayers.filter(p => Number(p.sold_team_id) === Number(team.id) && p.status === 'SOLD');
        drawTeamRosterPages(doc, team, teamPlayers, assets);
      }

      doc.save(`${(auction?.auction_name || "Auction").replace(/\s+/g, '_')}_All_Teams_Rosters.pdf`);
    } catch (err) {
      console.error("PDF generation error", err);
      alert("Could not generate PDF");
    } finally {
      setDownloadingAll(false);
    }
  };

  async function saveTeam(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    const payload = {
      ...form,
      auction_id: Number(auctionId),
      total_purse: Number(form.total_purse || 0),
      remaining_purse:
        form.remaining_purse === ""
          ? undefined
          : Number(form.remaining_purse || 0),
      player_limit:
        form.player_limit === ""
          ? undefined
          : Number(form.player_limit || 0),
    };

    try {
      if (editingTeam) {
        await api.put(`/teams/${editingTeam.id}`, payload);
        setMessage("Team details updated successfully");
      } else {
        await api.post("/teams", payload);
        setMessage("New team registered successfully");
      }

      resetForm();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save team details");
    }
  }

  function openEditTeamModal(team, e) {
    e.stopPropagation();
    setEditingTeam(team);
    setForm({
      ...emptyTeam,
      ...team,
      total_purse: team.total_purse ?? "",
      remaining_purse: team.remaining_purse ?? "",
      max_squad_size: team.max_squad_size ?? "",
    });
    setShowForm(true);
  }

  async function deleteTeam(team) {
    setMessage("");
    setError("");

    const ok = window.confirm(`Are you sure you want to delete ${team.team_name}?`);
    if (!ok) return;

    try {
      await api.delete(`/teams/${team.id}`);
      setMessage("Team removed successfully");
      resetForm();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete team");
    }
  }

  async function uploadTeams(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    setError("");

    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/teams/upload/${auctionId}`, fd);
      setMessage("Teams batch imported successfully");
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to import excel file");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <AdminLayout
      title="Teams"
      subtitle="Manage teams, purse and players"
      active="Teams"
      auctionId={auctionId}
      organizationId={auction?.organization_id}
      publicSlug={auction?.public_slug}
    >
      <div className="min-h-screen bg-gradient-to-b from-[#FFF5F7] to-white px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EC008C] to-[#c4006f] text-white shadow-lg shadow-pink-200">
                <Shirt size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Teams
                </h1>
                <p className="mt-0.5 text-xs font-medium text-slate-500 sm:text-sm">
                  Manage teams, purse and players
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-72">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300"
                  size={16}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search teams..."
                  className="w-full rounded-full border border-slate-100 bg-white py-2.5 pl-10 pr-4 text-xs shadow-sm outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowForm(true);
                    setEditingTeam(null);
                    setForm({
                      ...emptyTeam,
                      total_purse: auction?.total_purse_per_team || "",
                      player_limit: auction?.players_per_team || "",
                    });
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#EC008C] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-pink-200 transition hover:bg-[#d4007d] active:scale-95"
                >
                  <Plus size={16} /> Add Team
                </button>

                <button
                  onClick={downloadAllTeamsPDF}
                  disabled={downloadingAll || teams.length === 0}
                  title="Download All"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Download size={16} />
                  {downloadingAll ? "Generating..." : "Download All"}
                </button>

                <button
                  onClick={downloadTemplate}
                  title="Download Excel template"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:bg-slate-50"
                >
                  <Download size={16} />
                </button>

                <label
                  title="Bulk import teams"
                  className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:bg-slate-50"
                >
                  <UploadCloud size={16} />
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={uploadTeams}
                  />
                </label>

                <button
                  onClick={() => {
                    setSelectionMode((v) => !v);
                    setSelectedTeamIds([]);
                  }}
                  className={`hidden items-center justify-center rounded-xl border px-3 py-2.5 text-xs font-bold transition sm:inline-flex ${
                    selectionMode
                      ? "border-pink-300 bg-pink-50 text-[#EC008C]"
                      : "border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                  }`}
                >
                  {selectionMode ? "Cancel" : "Manage"}
                </button>
              </div>
            </div>
          </div>

          {/* Stat summary */}
          {!pageLoading && teams.length > 0 && (
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                icon={Users}
                label="Teams registered"
                value={teams.length}
                tint="bg-pink-50 text-[#EC008C]"
              />
              <StatCard
                icon={Wallet}
                label="Purse remaining (all teams)"
                value={`₹${formatAmount(totalPurseRemaining)}`}
                tint="bg-emerald-50 text-emerald-600"
              />
              <StatCard
                icon={Shirt}
                label="Players bought so far"
                value={totalPlayers}
                tint="bg-sky-50 text-sky-600"
              />
            </div>
          )}

          {/* Notifications */}
          {message && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800">
              {message}
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          {/* Selection Toolbar */}
          {selectionMode && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <button
                onClick={toggleSelectAllFiltered}
                className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                {allFilteredSelected ? (
                  <CheckSquare size={16} className="text-[#EC008C]" />
                ) : (
                  <Square size={16} />
                )}
                Select all ({filteredTeams.length})
              </button>

              <button
                type="button"
                disabled={selectedTeamIds.length === 0}
                onClick={deleteSelectedTeams}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-40"
              >
                <Trash2 size={13} /> Delete selected ({selectedTeamIds.length})
              </button>
            </div>
          )}

          {/* Cards Grid */}
          {pageLoading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3.5">
                    <div className="h-12 w-12 animate-pulse rounded-full bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="mt-5 h-6 w-1/2 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-50">
                <Users className="text-[#EC008C]" size={26} />
              </div>
              <h3 className="mt-4 text-sm font-bold text-slate-700">No teams found</h3>
              <p className="mt-1 text-xs font-medium text-slate-400">
                {search ? "Try a different search term." : "Add a team to get started."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTeams.map((team, index) => {
                const isSelected = selectedTeamIds.includes(Number(team.id));
                const squadCount = Number(
                  team.players_bought || team.sold_players_count || 0
                );
                const maxSquad = Number(
                  team.player_limit || DEFAULT_MAX_SQUAD
                );
                const progressPct =
                  maxSquad > 0
                    ? Math.min(100, Math.round((squadCount / maxSquad) * 100))
                    : 0;

                const defaultLogo = DEFAULT_LOGOS[index % DEFAULT_LOGOS.length];
                const tmb = maxBidMap[team.id];
                const maxBidVal = tmb?.max_bid ?? null;

                return (
                  <div
                    key={team.id}
                    className={`group relative rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                      isSelected ? "ring-2 ring-[#EC008C]" : ""
                    }`}
                  >
                    {selectionMode ? (
                      <button
                        onClick={() => toggleTeamSelection(team.id)}
                        className="absolute right-4 top-4 text-slate-300 hover:text-[#EC008C]"
                      >
                        {isSelected ? (
                          <CheckSquare size={18} className="text-[#EC008C]" />
                        ) : (
                          <Square size={18} />
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => openEditTeamModal(team, e)}
                        title="Edit Team"
                        className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-slate-50 hover:text-slate-600"
                      >
                        <Edit2 size={15} />
                      </button>
                    )}

                    {/* Logo + Name + Owner */}
                    <div className="flex items-center gap-3.5">
                      {team.logo_url ? (
                        <TeamLogo team={team} className="h-12 w-12 shrink-0 rounded-full !p-0.5 object-cover" />
                      ) : (
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-100 bg-slate-50 p-0.5 shadow-sm">
                          <img
                            src={defaultLogo}
                            alt={team.team_name}
                            className="h-full w-full rounded-full object-cover"
                          />
                        </div>
                      )}

                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-slate-900">
                          {team.team_name}
                        </h3>
                        {team.owner_name && (
                          <p className="truncate text-xs font-medium text-slate-400">
                            {team.owner_name}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Purse + Max Bid */}
                    <div className="mt-4">
                      <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                        ₹ {formatAmount(team.remaining_purse ?? team.total_purse)}
                      </div>
                      {maxBidVal !== null && (
                        <div className={`mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-black ${
                          maxBidVal === 0
                            ? "bg-red-50 border border-red-200 text-red-600"
                            : "bg-emerald-50 border border-emerald-200 text-emerald-700"
                        }`}>
                          <span className="uppercase tracking-wider text-[10px]">Max Bid</span>
                          <span>{maxBidVal === 0 ? "LOCKED" : `₹${formatAmount(maxBidVal)}`}</span>
                        </div>
                      )}
                    </div>

                    {/* Players & Limit */}
                    <div className="mt-1 flex items-center justify-between text-xs font-semibold text-slate-400">
                      <span>Players</span>
                      <span className="text-slate-700">
                        {squadCount} / {maxSquad} limit
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    {/* View Players Button */}
                    <button
                      onClick={() => setViewingTeam(team)}
                      className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#EC008C] transition hover:text-[#d4007d]"
                    >
                      View Players
                      <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Registration / Edit Form */}
        {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
              <div className="w-full max-w-xl">
                <TeamForm
                  form={form}
                  setForm={setForm}
                  onSubmit={saveTeam}
                  onClose={resetForm}
                  onDelete={editingTeam ? () => deleteTeam(editingTeam) : undefined}
                  editing={!!editingTeam}
                />
              </div>
            </div>
          )}

      </div>

      {viewingTeam && (
        <TeamPlayersModal team={viewingTeam} auctionId={auctionId} onClose={() => setViewingTeam(null)} />
      )}
    </AdminLayout>
  );
}

function StatCard({ icon: Icon, label, value, tint }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon size={19} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-lg font-extrabold leading-tight text-slate-900">
          {value}
        </span>
        <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </span>
      </span>
    </div>
  );
}

function TeamPlayersModal({ team, auctionId, onClose }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function loadPlayers() {
      try {
        const res = await api.get(`/players/auction/${auctionId}`);
        const teamPlayers = (res.data || []).filter(p => Number(p.sold_team_id) === Number(team.id) && p.status === 'SOLD');
        setPlayers(teamPlayers);
      } catch (err) {
        console.error("Failed to load players", err);
      } finally {
        setLoading(false);
      }
    }
    loadPlayers();
  }, [auctionId, team.id]);

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const assets = await loadTeamPdfAssets(players);
      drawTeamRosterPages(doc, team, players, assets);

      doc.save(`${team.team_name.replace(/\s+/g, '_')}_Roster.pdf`);
    } catch (err) {
      console.error("PDF generation error", err);
      alert("Could not generate PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-100 p-6 bg-slate-50">
          <div className="flex items-center gap-4">
            <TeamLogo url={team.logo_url} name={team.team_name} size="md" />
            <div>
              <h3 className="text-xl font-black text-slate-900">{team.team_name}</h3>
              <p className="text-sm font-semibold text-slate-500">
                Purse: ₹{Number(team.remaining_purse || 0).toLocaleString("en-IN")} left | Players: {players.length}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={downloadPDF} 
              disabled={loading || downloading || players.length === 0}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download size={16} />
              {downloading ? "Generating..." : "Download PDF"}
            </button>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition">
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {loading ? (
            <div className="flex py-12 justify-center text-slate-400 font-semibold">Loading players...</div>
          ) : players.length === 0 ? (
            <div className="flex py-12 flex-col items-center justify-center text-slate-400">
              <Users size={32} className="mb-2 opacity-30" />
              <p className="font-semibold">No players bought yet.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {players.map(p => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 shadow-sm hover:shadow-md transition bg-slate-50/50">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white border border-slate-200">
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.player_name} className="h-full w-full object-cover object-top" />
                    ) : (
                      <div className="flex h-full items-center justify-center font-bold text-slate-300">
                        {p.player_name?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-slate-900">{p.player_name}</div>
                    <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
                      <span className="rounded bg-white border border-slate-200 px-1.5 py-0.5">{p.player_role || p.category}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-black text-emerald-600">₹{Number(p.sold_price).toLocaleString("en-IN")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamForm({ form, setForm, onSubmit, onClose, onDelete, editing }) {
  function set(key, value) {
    setForm({ ...form, [key]: value });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 text-slate-800 shadow-2xl sm:p-8"
    >
      <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            {editing ? "Edit Team Details" : "Register New Team"}
          </h3>
          <p className="text-xs font-medium text-slate-400">
            Configure squad parameters and purse allocation
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput
            label="Team Name *"
            value={form.team_name}
            onChange={(val) => set("team_name", val)}
            required
          />
          <FormInput
            label="Short Name / Initials"
            value={form.short_name || ""}
            onChange={(val) => set("short_name", val)}
          />
          <FormInput
            label="Owner Name"
            value={form.owner_name || ""}
            onChange={(val) => set("owner_name", val)}
          />
          <FormInput
            label="Owner Mobile"
            value={form.owner_mobile || ""}
            onChange={(val) => set("owner_mobile", val)}
          />
          <FormInput
            label="Total Purse (₹) *"
            type="number"
            value={form.total_purse || ""}
            onChange={(val) => set("total_purse", val)}
            required
            readOnly
          />

        {editing && (
            <FormInput
              label="Remaining Purse (₹)"
              type="number"
              value={form.remaining_purse || ""}
              onChange={(val) => set("remaining_purse", val)}
              readOnly
            />
          )}

          <FormInput
            label="Player Limit"
            type="number"
            value={form.player_limit || ""}
            onChange={(val) => set("player_limit", val)}
            readOnly
          />

        <FormInput
          label="WhatsApp Group Link"
          value={form.team_whatsapp_group_link || ""}
          onChange={(val) => set("team_whatsapp_group_link", val)}
        />

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-bold text-slate-700">
            Team Logo
          </label>
          <LogoPicker
            value={form.logo_url || ""}
            onChange={(val) => set("logo_url", val)}
          />
        </div>
      </div>

      <div className="mt-8 flex flex-col-reverse items-center justify-end gap-3 border-t border-slate-100 pt-4 sm:flex-row">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-600 transition hover:bg-rose-100 sm:mr-auto sm:w-auto"
          >
            <Trash2 size={15} /> Delete Team
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200 sm:w-auto"
        >
          Cancel
        </button>
        <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#EC008C] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-pink-200 transition hover:bg-[#d4007d] active:scale-95 sm:w-auto">
          <Save size={15} /> Save Team
        </button>
      </div>
    </form>
  );
}

function FormInput({ label, value, onChange, type = "text", required, readOnly }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-700">
        {label}
      </span>
      <input
        required={required}
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
        className={`w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium outline-none transition focus:border-[#EC008C] focus:ring-2 focus:ring-pink-100 ${
          readOnly 
            ? "bg-slate-100 text-slate-500 cursor-not-allowed opacity-80" 
            : "bg-slate-50/50 text-slate-800 focus:bg-white"
        }`}
      />
    </label>
  );
}