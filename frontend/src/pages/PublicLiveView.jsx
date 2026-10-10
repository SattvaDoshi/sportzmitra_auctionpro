import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import { getImageUrl } from "../utils/imageUrl";
import socket from "../utils/socket";
import { Gavel, Users, CalendarDays, MapPin } from "lucide-react";

/**
 * PublicLiveView.jsx  (blue theme)
 *
 *  - header: auction logo (big) | auction name        ...   SportzMitra logo + tagline + Live View + code
 *  - stage:  [ player photo (solid bg) | panel: name, age/area, current bid + leading team, stats ]
 *  - sponsors strip
 *  - SOLD / UNSOLD: full-screen celebration card with photo, details and fireworks
 *
 *  Mobile  : photo -> panel (everything stacked), stats 3 per row
 *  Tablet  : photo | panel side by side, stats 3 per row
 *  Laptop  : photo | panel, stats in a single row
 */

/* ---------------------------------------------------------------------------
   HELPERS
--------------------------------------------------------------------------- */
function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const DEFAULT_TEAMS = [];

/* Looks for a "Label: value" entry inside the rich-text / stats fields (e.g. "Area: Bhayander") */
function findInStatsField(src, labelRe) {
  for (const key of STAT_SOURCE_KEYS) {
    if (src?.[key] == null || src[key] === "") continue;
    const hit = parseStats(src[key]).find((s) => labelRe.test(String(s.label).trim()));
    if (hit && String(hit.value).trim() && hit.value !== "-") return String(hit.value).trim();
  }
  return "";
}

const AGE_LABEL_RE = /^(age|player age)$/i;
const AREA_LABEL_RE = /^(area|location|city|place|address|locality|town|village|district|region)$/i;
/* Any flat key that looks like an area/location field (team / url / logo keys are skipped) */
const AREA_KEY_RE = /(^|_)(area|location|city|locality|place|town|village|address|district|region)(_|$)/i;
const SKIP_KEY_RE = /team|logo|url|photo|image|link/i;

function getAge(src) {
  const raw = src?.age ?? src?.player_age ?? src?.years ?? src?.player?.age ?? "";
  const text = String(raw || findInStatsField(src, AGE_LABEL_RE)).trim();
  if (!text) return "";
  return /^\d+$/.test(text) ? `${text} Years` : text;
}

/* Searches the whole payload (nested objects and arrays) for the player's area. */
function getArea(src) {
  if (!src) return "";

  const isText = (v) => (typeof v === "string" || typeof v === "number") && String(v).trim() !== "";

  const search = (node, depth) => {
    if (node == null || depth > 4) return "";

    /* arrays: [{label:"Area", value:"Bhayander"}] or [{question:"Area", answer:"..."}] */
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === "object") {
          const label = item.label ?? item.name ?? item.key ?? item.title ?? item.question ?? item.field;
          const value = item.value ?? item.val ?? item.answer ?? item.response;
          if (label != null && isText(value) && AREA_LABEL_RE.test(String(label).trim())) {
            return String(value).trim();
          }
        }
      }
      for (const item of node) {
        const hit = search(item, depth + 1);
        if (hit) return hit;
      }
      return "";
    }

    if (typeof node === "object") {
      /* a. keys that look like an area field at this level */
      for (const [k, v] of Object.entries(node)) {
        if (SKIP_KEY_RE.test(k) || !AREA_KEY_RE.test(k)) continue;
        if (isText(v)) return String(v).trim();
      }
      /* b. go deeper */
      for (const v of Object.values(node)) {
        if (v && typeof v === "object") {
          const hit = search(v, depth + 1);
          if (hit) return hit;
        }
      }
      return "";
    }

    return "";
  };

  const deep = search(src, 0);
  if (deep) return deep;

  /* last resort: "Area: xyz" inside the rich-text / stats field */
  return findInStatsField(src, AREA_LABEL_RE);
}

/* Normalises a state / payload object into the fields the UI needs. */
function buildPlayer(src) {
  if (!src) return null;
  return {
    id: src.current_player_id ?? src.id,
    player_name: src.player_name || "",
    category: src.category || "",
    player_role: src.player_role || src.batting_style || "",
    base_price: src.base_price || 0,
    photo_url: src.photo_url,
    jersey_number: src.jersey_number ?? src.player_number,
    age: getAge(src),
    area: getArea(src),
  };
}

/* ---------------------------------------------------------------------------
   PLAYER STATS (rich-text field)
   ---------------------------------------------------------------------------
   Reads the player's stats field from the live `state`. If your field has a
   different name, add it to STAT_SOURCE_KEYS.

   Accepted formats:
     - HTML table (header row + value row, OR two-column label/value rows)
     - HTML / plain text lines like "Match: 10"
     - JSON string, object { match: 10, sixes: 4 }
     - array [{ label: "Match", value: 10 }]
--------------------------------------------------------------------------- */
const STAT_SOURCE_KEYS = [
  "player_stats",
  "stats",
  "rich_text",
  "richtext",
  "player_details",
  "player_info",
  "additional_info",
  "custom_fields",
  "extra_fields",
];

const DEFAULT_STAT_DEFS = [
  { label: "Match", keys: ["matches", "match", "matches_played", "total_matches"] },
  { label: "Batting Avg", keys: ["batting_avg", "batting_average"] },
  { label: "Bowling Avg", keys: ["bowling_avg", "bowling_average"] },
  { label: "Strike Rate", keys: ["strike_rate"] },
  { label: "Sixes", keys: ["sixes", "total_sixes"] },
  { label: "Fours", keys: ["fours", "total_fours"] },
];

function humanizeKey(key) {
  return String(key)
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function cleanCell(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function parseTextLines(text) {
  return String(text)
    .split(/\n|;/)
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx <= 0) return null;
      const label = cleanCell(line.slice(0, idx));
      const value = cleanCell(line.slice(idx + 1));
      if (!label || !value || label.length > 30) return null;
      return { label, value };
    })
    .filter(Boolean);
}

function parseHtmlStats(html) {
  if (typeof DOMParser === "undefined") return [];

  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = Array.from(doc.querySelectorAll("tr"))
    .map((tr) => {
      const cells = Array.from(tr.children).filter((c) => c.tagName === "TD" || c.tagName === "TH");
      return {
        cells: cells.map((c) => cleanCell(c.textContent)),
        isHeader: cells.length > 0 && cells.every((c) => c.tagName === "TH"),
      };
    })
    .filter((r) => r.cells.some(Boolean));

  if (rows.length) {
    /* Horizontal table: header row of labels + one row of values */
    if ((rows[0].isHeader || rows.length === 2) && rows[0].cells.length > 2 && rows[1]) {
      return rows[0].cells
        .map((label, i) => ({ label, value: rows[1].cells[i] || "-" }))
        .filter((s) => s.label);
    }
    /* Vertical table: label | value per row */
    return rows
      .filter((r) => !r.isHeader && r.cells.length >= 2)
      .map((r) => ({ label: r.cells[0], value: r.cells[1] }))
      .filter((s) => s.label && s.value !== "");
  }

  /* No table: treat block elements / <br> as line breaks, read "Label: value" */
  const withBreaks = html.replace(/<\/(p|div|li|tr|h[1-6])>|<br\s*\/?>/gi, "\n");
  const text = new DOMParser().parseFromString(withBreaks, "text/html").body.textContent || "";
  return parseTextLines(text);
}

function parseStats(raw) {
  if (raw == null || raw === "") return [];

  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      if (item && typeof item === "object") {
        const label = item.label ?? item.name ?? item.key ?? item.title;
        const value = item.value ?? item.val ?? item.stat;
        if (label != null && value != null) {
          return [{ label: cleanCell(label), value: cleanCell(value) || "-" }];
        }
        return parseStats(item);
      }
      return parseStats(item);
    });
  }

  if (typeof raw === "object") {
    return Object.entries(raw)
      .filter(([, v]) => v != null && typeof v !== "object")
      .map(([k, v]) => ({ label: humanizeKey(k), value: cleanCell(v) || "-" }));
  }

  if (typeof raw === "string") {
    const str = raw.trim();
    if (!str) return [];
    if (str.startsWith("[") || str.startsWith("{")) {
      try {
        return parseStats(JSON.parse(str));
      } catch {
        /* not JSON, fall through */
      }
    }
    if (/<[a-z][\s\S]*>/i.test(str)) return parseHtmlStats(str);
    return parseTextLines(str);
  }

  return [];
}

function resolveStats(state) {
  if (state) {
    for (const key of STAT_SOURCE_KEYS) {
      const parsed = parseStats(state[key]);
      if (parsed.length) return parsed;
    }
  }
  return DEFAULT_STAT_DEFS.map((def) => {
    const found = state ? def.keys.find((k) => state[k] != null && state[k] !== "") : null;
    return { label: def.label, value: found ? cleanCell(state[found]) : "-" };
  });
}

/* ---------------------------------------------------------------------------
   STYLES (display font + celebration animations)
--------------------------------------------------------------------------- */
function DisplayFontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');
      .aa-display { font-family: 'Anton', 'Archivo Black', ui-sans-serif, system-ui, sans-serif; }

      @keyframes aa-pop {
        0%   { transform: scale(0.6); opacity: 0; }
        60%  { transform: scale(1.04); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      .aa-pop { animation: aa-pop 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }

      @keyframes aa-glow {
        0%, 100% { filter: drop-shadow(0 0 14px rgba(255, 196, 40, 0.45)); }
        50%      { filter: drop-shadow(0 0 34px rgba(255, 196, 40, 0.95)); }
      }
      .aa-glow { animation: aa-glow 1.6s ease-in-out infinite; }

      @media (prefers-reduced-motion: reduce) {
        .aa-pop, .aa-glow { animation: none; }
      }
    `}</style>
  );
}

/* Reusable class strings */
const PANEL =
  "rounded-2xl border border-sky-400/50 bg-gradient-to-br from-[#06193d]/90 to-[#030b1f]/95 shadow-[0_0_44px_rgba(30,144,255,0.28)] backdrop-blur-md";
const INNER = "rounded-xl border border-sky-400/40 bg-[#041533]/70";
const GOLD_TEXT =
  "bg-gradient-to-b from-[#fff3a8] via-[#ffc928] to-[#f08a00] bg-clip-text text-transparent";
const BLUE_TEXT = "bg-gradient-to-b from-[#8ccaff] to-[#1f6bff] bg-clip-text text-transparent";

/* ---------------------------------------------------------------------------
   FIREWORKS + CONFETTI (canvas, no dependencies)
--------------------------------------------------------------------------- */
function Fireworks() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const colors = ["#ffd54a", "#ff4d6d", "#38bdf8", "#7c5cff", "#34d399", "#ffffff", "#ff9f1c"];
    const pick = () => colors[Math.floor(Math.random() * colors.length)];

    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    let nextBurst = 0;
    let sparks = [];
    let bits = [];

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const burst = (x, y) => {
      const color = pick();
      const count = 80;
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
        const speed = 1.5 + Math.random() * 5.5;
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.011 + Math.random() * 0.012,
          size: 2 + Math.random() * 2.2,
          color,
        });
      }
    };

    for (let i = 0; i < 150; i += 1) {
      bits.push({
        x: Math.random() * w,
        y: -Math.random() * h,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 3.5,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        bw: 6 + Math.random() * 7,
        bh: 4 + Math.random() * 7,
        color: pick(),
      });
    }

    const tick = (now) => {
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;
      ctx.clearRect(0, 0, w, h);

      if (now >= nextBurst) {
        burst(w * (0.12 + Math.random() * 0.76), h * (0.1 + Math.random() * 0.45));
        nextBurst = now + 260 + Math.random() * 340;
      }

      /* sparks */
      ctx.globalCompositeOperation = "lighter";
      sparks = sparks.filter((s) => s.life > 0);
      sparks.forEach((s) => {
        s.vy += 0.06 * dt;
        s.vx *= 0.99;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= s.decay * dt;
        ctx.globalAlpha = Math.max(s.life, 0);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      });

      /* confetti */
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      bits.forEach((b) => {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.vr * dt;
        if (b.y > h + 20) {
          b.y = -20;
          b.x = Math.random() * w;
        }
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.bw / 2, -b.bh / 2, b.bw, b.bh);
        ctx.restore();
      });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}

/* ---------------------------------------------------------------------------
   SMALL COMPONENTS
--------------------------------------------------------------------------- */

/* Auction logo (bigger). Shows the uploaded logo, or a placeholder. */
function AuctionLogoBox({ url }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  const showImg = url && !failed;

  return (
    <div className="flex h-16 min-w-[64px] max-w-[150px] shrink-0 items-center justify-center sm:h-20 sm:max-w-[220px] lg:h-28 lg:max-w-[300px]">
      {showImg ? (
        <img
          src={url}
          alt="Auction Logo"
          draggable="false"
          onError={() => setFailed(true)}
          className="max-h-full w-auto max-w-full object-contain drop-shadow-[0_0_18px_rgba(56,189,248,0.45)]"
        />
      ) : (
        <span className="flex h-full items-center gap-2 rounded-xl border border-sky-400/40 bg-[#041533]/70 px-3">
          <Gavel className="h-6 w-6 shrink-0 -rotate-45 text-sky-400 lg:h-8 lg:w-8" />
          <span className="whitespace-nowrap text-sm font-semibold text-white sm:text-base lg:text-lg">
            Auction Logo
          </span>
        </span>
      )}
    </div>
  );
}

/* SportzMitra brand logo (served from frontend/public/sportzmitra-logo.png). Hidden if the file is missing. */
function SportzMitraLogo() {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <img
      src="/sportzmitra-logo.png"
      alt="SportzMitra"
      draggable="false"
      onError={() => setFailed(true)}
      className="h-10 w-auto max-w-[200px] object-contain drop-shadow-[0_0_14px_rgba(56,189,248,0.45)] sm:h-12 lg:h-16 lg:max-w-[260px]"
    />
  );
}

/* Player photo on a SOLID blue background (no fade / transparency). */
function PlayerPhoto({ url, name, className = "" }) {
  const photo = getImageUrl(url);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [photo]);

  const showImg = photo && !failed;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-sky-400/50 bg-gradient-to-b from-[#0b3a8f] via-[#07235a] to-[#041333] shadow-[0_0_40px_rgba(30,144,255,0.3)] ${className}`}
    >
      {showImg ? (
        <img
          src={photo}
          alt={name || "Player"}
          draggable="false"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="aa-display text-8xl text-sky-300/60">
            {String(name || "P").charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

/* Resolves the logo of a team from whichever field the API provides. */
function getTeamLogo(team, state) {
  return getImageUrl(
    state?.highest_team_logo_url ||
      state?.leading_team_logo_url ||
      team?.logo_url ||
      team?.team_logo_url ||
      team?.team_logo ||
      team?.logo ||
      ""
  );
}

function TeamLogoCircle({ logoUrl, name, sizeClass = "h-16 w-16 lg:h-20 lg:w-20" }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  return logoUrl && !failed ? (
    <img
      src={logoUrl}
      alt={name || "Team"}
      draggable="false"
      onError={() => setFailed(true)}
      className={`${sizeClass} shrink-0 rounded-full border-2 border-sky-400/70 bg-white object-cover shadow-[0_0_20px_rgba(56,189,248,0.45)]`}
    />
  ) : (
    <span
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border-2 border-sky-400/70 bg-sky-500/15`}
    >
      <Users className="h-1/2 w-1/2 text-sky-300" />
    </span>
  );
}

/* Leading team: logo + name, "Awaiting bids" until a team leads. */
function LeadingTeamBadge({ name, logoUrl }) {
  return (
    <div className="flex w-full min-w-0 flex-col items-center justify-center gap-2 text-center">
      <TeamLogoCircle logoUrl={logoUrl} name={name} />
      <span className="aa-display max-w-full break-words text-2xl uppercase leading-none text-white sm:text-3xl">
        {name || "Awaiting Bids"}
      </span>
    </div>
  );
}

/* Player name: first word white, the rest blue. */
function PlayerName({ name, jersey, className = "", as: Tag = "div" }) {
  const words = String(name || "Waiting for player...").split(" ").filter(Boolean);
  const first = words[0];
  const rest = words.slice(1).join(" ");

  return (
    <Tag
      className={`aa-display max-w-full break-words uppercase leading-[0.95] tracking-tight text-white ${className}`}
    >
      {first}
      {rest ? <span className={`ml-[0.25em] ${BLUE_TEXT}`}>{rest}</span> : null}
      {jersey ? <span className="ml-3 text-sky-400">{jersey}</span> : null}
    </Tag>
  );
}

/* Role + category badge row. */
function RoleLine({ role, category, roleClass = "text-xl sm:text-3xl" }) {
  if (!role && !category) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-3 md:justify-start">
      {role && <span className={`aa-display uppercase tracking-wide text-white ${roleClass}`}>{role}</span>}
      {category && (
        <span className="inline-flex min-h-[2rem] min-w-[2rem] items-center justify-center whitespace-nowrap rounded-full bg-[#1e7bff] px-2.5 py-1 text-xs font-black uppercase leading-none text-white shadow-[0_0_16px_rgba(30,123,255,0.7)] sm:text-sm">
          {category}
        </span>
      )}
    </div>
  );
}

/* Age / Area box with a small icon. */
function InfoBox({ icon: Icon, label, value, className = "" }) {
  return (
    <div className={`${INNER} flex min-w-0 items-center gap-2 px-2.5 py-2 sm:gap-3 sm:px-4 sm:py-2.5 ${className}`}>
      <Icon className="h-5 w-5 shrink-0 text-sky-400 sm:h-8 sm:w-8" />
      <div className="min-w-0 text-left">
        <div className="text-[9px] font-bold uppercase leading-none tracking-[0.2em] text-white/70 sm:text-xs">
          {label}
        </div>
        <div className="aa-display mt-1 truncate text-base uppercase leading-tight text-white sm:text-2xl">
          {value}
        </div>
      </div>
    </div>
  );
}

/* Stat box: label over value, no icon. */
function StatBox({ label, value }) {
  const text = String(value ?? "-");
  const isLong = text.length > 5;

  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-sky-400/40 bg-[#041533]/70 px-1.5 py-3 sm:py-4">
      <span className="text-center text-[10px] font-black uppercase leading-tight tracking-wider text-white/85 sm:text-xs">
        {label}
      </span>
      <span
        className={`aa-display max-w-full break-words text-center leading-none text-white ${
          isLong ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl"
        }`}
      >
        {text}
      </span>
    </div>
  );
}

/* One sponsor logo on a white pill; falls back to a "Brand Logo" placeholder. */
function SponsorLogo({ url }) {
  const [failed, setFailed] = useState(false);
  const src = url ? getImageUrl(url) : "";

  return (
    <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-1.5 shadow-lg">
      {src && !failed ? (
        <img
          src={src}
          alt="Sponsor"
          draggable="false"
          onError={() => setFailed(true)}
          className="h-8 w-auto max-w-[160px] object-contain sm:h-10"
        />
      ) : (
        <>
          <span className="h-6 w-6 shrink-0 rounded-full border-[5px] border-indigo-500 bg-white sm:h-7 sm:w-7" />
          <span className="text-sm font-extrabold uppercase tracking-wide text-slate-900 sm:text-base">
            Brand Logo
          </span>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   PAGE
--------------------------------------------------------------------------- */
export default function PublicLiveView() {
  const { publicSlug } = useParams();
  const [auction, setAuction] = useState(null);
  const [state, setState] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [celebration, setCelebration] = useState(null);

  /* Latest state for socket handlers (so the SOLD card can show the player who was just sold) */
  const stateRef = useRef(null);
  stateRef.current = state;
  const celebrationTimer = useRef(null);

  const showCelebration = useCallback((data, durationMs) => {
    clearTimeout(celebrationTimer.current);
    setCelebration(data);
    celebrationTimer.current = setTimeout(() => setCelebration(null), durationMs);
  }, []);

  useEffect(() => () => clearTimeout(celebrationTimer.current), []);

  const currentPlayer = useMemo(() => buildPlayer(state), [state]);

  /* Debug helper: open the browser console to see which fields the server sends */
  useEffect(() => {
    if (state) console.debug("[PublicLiveView] state fields:", Object.keys(state), state);
  }, [state]);
  const filledStats = useMemo(
    () =>
      resolveStats(state).filter((st) => {
        const v = String(st.value ?? "").trim();
        const label = String(st.label ?? "").trim();
        if (AGE_LABEL_RE.test(label) || AREA_LABEL_RE.test(label)) return false;
        return v !== "" && v !== "-" && v !== "\u2014";
      }),
    [state]
  );

  const loadAuction = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/public/auction/${publicSlug}`);
      setSnapshot(response.data);
      setAuction(response.data.auction || null);
      setState(response.data.state || null);
    } catch (error) {
      console.error("Public auction load error:", error);
    } finally {
      setLoading(false);
    }
  }, [publicSlug]);

  useEffect(() => {
    loadAuction();
  }, [loadAuction]);

  useEffect(() => {
    if (!auction?.id) return undefined;

    const joinRoom = () => {
      socket.emit("joinPublicAuction", { auctionId: auction.id, publicSlug });
    };

    joinRoom(); // Initial join
    socket.on("connect", joinRoom); // Re-join on reconnect

    const isThisAuction = (payload) =>
      payload?.auction?.id === auction.id || payload?.auctionId === auction.id;

    const handleSnapshotUpdated = (payload) => {
      if (isThisAuction(payload)) {
        setSnapshot(payload);
        if (payload.auction) setAuction(payload.auction);
        if (payload.state) setState(payload.state);
      }
    };

    const handlePlayerSold = (payload) => {
      if (!isThisAuction(payload)) return;

      const prev = stateRef.current || {};
      /* Prefer player data from the event itself, fall back to the live state */
      const soldPlayer = buildPlayer({ ...prev, ...(payload?.player || payload?.sold_player || {}) });

      showCelebration(
        {
          type: "SOLD",
          player: soldPlayer,
          teamName:
            payload?.team_name ||
            payload?.sold_team_name ||
            payload?.team?.team_name ||
            prev?.highest_team_name ||
            prev?.leading_team_name ||
            "",
          teamLogo: getImageUrl(
            payload?.team_logo_url ||
              payload?.sold_team_logo_url ||
              payload?.team?.logo_url ||
              prev?.highest_team_logo_url ||
              prev?.leading_team_logo_url ||
              ""
          ),
          amount: payload?.sold_amount || payload?.bid_amount || prev?.current_bid || 0,
        },
        7500
      );

      if (payload.state) setState(payload.state);
      setSnapshot(payload);
      if (payload.auction) setAuction(payload.auction);
    };

    const handlePlayerUnsold = (payload) => {
      if (!isThisAuction(payload)) return;

      const prev = stateRef.current || {};
      showCelebration(
        { type: "UNSOLD", player: buildPlayer({ ...prev, ...(payload?.player || {}) }) },
        4000
      );

      setSnapshot(payload);
      if (payload.auction) setAuction(payload.auction);
      if (payload.state) setState(payload.state);
    };

    socket.on("auctionSnapshotUpdated", handleSnapshotUpdated);
    socket.on("playerSold", handlePlayerSold);
    socket.on("playerUnsold", handlePlayerUnsold);
    socket.on("playerFinalUnsold", handlePlayerUnsold);

    return () => {
      socket.off("connect", joinRoom);
      socket.off("auctionSnapshotUpdated", handleSnapshotUpdated);
      socket.off("playerSold", handlePlayerSold);
      socket.off("playerUnsold", handlePlayerUnsold);
      socket.off("playerFinalUnsold", handlePlayerUnsold);
    };
  }, [auction?.id, publicSlug, showCelebration]);

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#030b1f]">
        <DisplayFontLoader />
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-400 border-t-transparent" />
      </div>
    );
  }

  const basePrice = Number(currentPlayer?.base_price || 0);
  const currentBid = Number(state?.current_bid || basePrice || 0);

  /* Teams are only used to look up the leading team's name/logo. */
  const teams = snapshot?.teamsSummary?.length
    ? snapshot.teamsSummary
    : auction?.teams?.length
    ? auction.teams
    : DEFAULT_TEAMS;

  /* Header shows the auction's own name (e.g. "BPL Auction") */
  const auctionName = String(auction?.auction_name || auction?.name || "Auction").trim();
  const nameWords = auctionName.split(/\s+/).filter(Boolean);
  const nameFirst = nameWords[0] || "";
  const nameRest = nameWords.slice(1).join(" ");

  /* Sponsors: accepts a comma-separated string, an array, or a single URL field. */
  const rawSponsors =
    auction?.sponsor_logo_urls ?? auction?.sponsor_logo_url ?? auction?.sponsors ?? "";
  const sponsorUrls = (
    Array.isArray(rawSponsors)
      ? rawSponsors.map((s) => (typeof s === "string" ? s : s?.logo_url || s?.url || ""))
      : String(rawSponsors).split(",")
  )
    .map((s) => String(s).trim())
    .filter(Boolean);

  /* Leading team: match by id or name, and accept a few common field names. */
  const leadingTeamId =
    state?.highest_team_id ?? state?.highest_bidder_team_id ?? state?.leading_team_id ?? null;
  const leadingNameFromState =
    state?.highest_team_name || state?.leading_team_name || state?.highest_bidder_name || "";
  const leadingTeam =
    teams.find(
      (t) =>
        (leadingTeamId != null && String(t.id) === String(leadingTeamId)) ||
        (leadingNameFromState && (t.team_name || t.name) === leadingNameFromState)
    ) || null;
  const leadingTeamName = leadingNameFromState || leadingTeam?.team_name || leadingTeam?.name || "";
  const leadingTeamLogo = getTeamLogo(leadingTeam, state);

  /* Stats: up to 6 columns on laptop */
  const statCols = Math.max(1, Math.min(filledStats.length, 6));

  return (
    <div className="relative flex min-h-[100svh] w-full flex-col overflow-x-hidden bg-[#030b1f] font-sans text-white">
      <DisplayFontLoader />

      <CelebrationOverlay celebration={celebration} />

      <section className="relative isolate flex min-h-[100svh] w-full flex-1 flex-col overflow-hidden bg-[#030b1f]">
        {/* Background: stadium image forced into blue + blue scrims */}
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[url('/publicView-bg.png')] bg-cover bg-center bg-no-repeat opacity-60" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[#0a3a9c]/50 mix-blend-color" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#030b1f]/80 via-[#05204d]/40 to-[#030b1f]/90" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_45%,rgba(30,144,255,0.28),transparent_62%)]" />

        <div className="relative mx-auto flex w-full max-w-[1700px] flex-1 flex-col gap-4 px-4 py-4 md:gap-5 md:px-8 md:py-6">
          {/* =================== HEADER =================== */}
          <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            {/* LEFT: logo | auction name */}
            <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-5">
              <AuctionLogoBox url={auction?.auction_logo_url} />
              <span className="h-12 w-px shrink-0 bg-white/25 lg:h-16" />
              <h1 className="aa-display min-w-0 break-words text-[clamp(24px,5.2vw,64px)] uppercase leading-[1] tracking-tight">
                <span className={BLUE_TEXT}>{nameFirst}</span>
                {nameRest ? <span className="text-white"> {nameRest}</span> : null}
              </h1>
            </div>

            {/* RIGHT: SportzMitra logo + tagline + status pills */}
            <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
              <SportzMitraLogo />
              <div className="hidden text-xs font-bold uppercase tracking-[0.35em] text-white/75 md:block">
                Players &middot; Passion &middot; Bigger Dreams
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <a
                  href={`/live/${publicSlug}/dashboard`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-full border border-sky-400/50 bg-[#041533]/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md transition-colors hover:border-sky-300 hover:text-sky-300 sm:px-4 sm:text-xs"
                >
                  Dashboard
                </a>
                <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/50 bg-[#041533]/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md sm:px-4 sm:text-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  Live View
                </span>
                <span className="inline-flex max-w-[180px] items-center rounded-full border border-sky-400/50 bg-[#041533]/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/90 backdrop-blur-md sm:max-w-none sm:px-4 sm:text-xs">
                  <span className="truncate">#{auction?.auction_code || publicSlug}</span>
                </span>
              </div>
            </div>
          </header>

          {/* =================== MAIN STAGE =================== */}
          <main className="flex flex-1 flex-col justify-center">
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              {/* PHOTO (solid background) */}
              <div className="relative mx-auto w-full max-w-[380px] md:mx-0 md:max-w-none">
                <PlayerPhoto
                  url={currentPlayer?.photo_url}
                  name={currentPlayer?.player_name}
                  className="aspect-[4/5] w-full md:aspect-auto md:h-full md:min-h-[420px] lg:min-h-[480px]"
                />
              </div>

              {/* DETAILS PANEL */}
              <div className={`${PANEL} flex min-w-0 flex-col justify-center gap-3 p-3 sm:gap-4 sm:p-5`}>
                {/* Name + role + category */}
                <div className="flex flex-col items-center text-center md:items-start md:text-left">
                  <PlayerName
                    as="h2"
                    name={currentPlayer?.player_name}
                    jersey={currentPlayer?.jersey_number}
                    className="text-[clamp(40px,5.4vw,96px)]"
                  />
                  <RoleLine role={currentPlayer?.player_role} category={currentPlayer?.category} />
                </div>

                {/* Age + Area */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <InfoBox icon={CalendarDays} label="Age" value={currentPlayer?.age || "-"} />
                  <InfoBox icon={MapPin} label="Area" value={currentPlayer?.area || "-"} />
                </div>

                {/* Current bid + leading team */}
                <div className={`${INNER} grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-center`}>
                  <div className="flex min-w-0 flex-col items-center text-center">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-white sm:text-sm">
                      Current Bid
                    </div>
                    <div
                      className={`aa-display mt-1 max-w-full text-[clamp(44px,12vw,76px)] leading-none [filter:drop-shadow(0_0_18px_rgba(255,190,40,0.45))] lg:text-[clamp(40px,4.6vw,80px)] ${GOLD_TEXT}`}
                    >
                      ₹{formatAmount(currentBid)}
                    </div>
                    <div className="mt-3 flex w-full max-w-[420px] items-center justify-center gap-3 rounded-lg border border-sky-400/40 bg-[#030b1f]/60 px-3 py-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80 sm:text-xs">
                        Base Price
                      </span>
                      <span className="aa-display text-xl leading-tight text-white sm:text-2xl">
                        ₹{formatAmount(basePrice)}
                      </span>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-center justify-center border-t border-sky-400/30 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                    <LeadingTeamBadge name={leadingTeamName} logoUrl={leadingTeamLogo} />
                  </div>
                </div>

                {/* Player stats (hidden when no stat has a value) */}
                {filledStats.length > 0 && (
                  <div
                    className="grid grid-cols-3 gap-2 sm:gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
                    style={{ "--cols": statCols }}
                  >
                    {filledStats.map((stat, i) => (
                      <StatBox key={`${stat.label}-${i}`} label={stat.label} value={stat.value} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>

          {/* Debug: open the page with ?debug=1 to see the fields the server sends */}
          {typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug") && (
            <pre className="max-h-64 overflow-auto rounded-xl border border-amber-300/50 bg-black/80 p-3 text-[11px] leading-snug text-amber-200">
              {JSON.stringify(state, null, 2)}
            </pre>
          )}

          {/* =================== POWERED BY =================== */}
          <div className="relative z-10 flex flex-col items-center gap-2 pb-1">
            <div className="flex w-full max-w-md items-center gap-3 text-[10px] font-bold uppercase tracking-[0.3em] text-white/70">
              <span className="h-px flex-1 bg-white/25" />
              Sponsored by
              <span className="h-px flex-1 bg-white/25" />
            </div>
            <div className="flex max-w-full flex-wrap items-center justify-center gap-3">
              {sponsorUrls.length > 0 ? (
                sponsorUrls.map((url, i) => <SponsorLogo key={i} url={url} />)
              ) : (
                <SponsorLogo url="" />
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   SOLD / UNSOLD CELEBRATION (full screen, big card + fireworks)
--------------------------------------------------------------------------- */
function CelebrationOverlay({ celebration }) {
  if (!celebration) return null;

  const isSold = celebration.type === "SOLD";
  const p = celebration.player || {};

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#020a1f]/90 p-3 backdrop-blur-md sm:p-6 md:items-center">
      {isSold && <Fireworks />}

      <div
        className={`aa-pop relative z-10 my-auto grid w-full max-w-6xl overflow-hidden rounded-3xl border-2 bg-gradient-to-br from-[#06193d] to-[#030b1f] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] ${
          isSold
            ? "border-amber-300/70 shadow-[0_0_80px_rgba(255,196,40,0.35)]"
            : "border-rose-400/60 shadow-[0_0_80px_rgba(244,63,94,0.3)]"
        }`}
      >
        {/* Photo */}
        <div className="p-3 md:p-5">
          <PlayerPhoto
            url={p.photo_url}
            name={p.player_name}
            className="aspect-[4/3] w-full md:aspect-auto md:h-full md:min-h-[460px]"
          />
        </div>

        {/* Details */}
        <div className="flex min-w-0 flex-col items-center justify-center gap-3 px-4 pb-6 pt-1 text-center sm:gap-4 md:items-start md:p-8 md:pl-2 md:text-left">
          <div
            className={`aa-display aa-glow text-[clamp(56px,11vw,132px)] uppercase leading-none ${
              isSold ? GOLD_TEXT : "bg-gradient-to-b from-[#ffb3c1] to-[#f43f5e] bg-clip-text text-transparent"
            }`}
          >
            {isSold ? "Sold!" : "Unsold"}
          </div>

          <div className="flex flex-col items-center md:items-start">
            <PlayerName
              name={p.player_name}
              jersey={p.jersey_number}
              className="text-[clamp(34px,5vw,80px)]"
            />
            <RoleLine role={p.player_role} category={p.category} roleClass="text-xl sm:text-3xl" />
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:gap-3">
            <InfoBox icon={CalendarDays} label="Age" value={p.age || "-"} />
            <InfoBox icon={MapPin} label="Area" value={p.area || "-"} />
          </div>

          {isSold && (
            <div className="w-full rounded-2xl border border-amber-300/50 bg-[#041533]/80 p-4">
              <div className="text-xs font-black uppercase tracking-[0.25em] text-white/80 sm:text-sm">
                Sold Price
              </div>
              <div
                className={`aa-display mt-1 text-[clamp(44px,8vw,96px)] leading-none [filter:drop-shadow(0_0_20px_rgba(255,190,40,0.5))] ${GOLD_TEXT}`}
              >
                ₹{formatAmount(celebration.amount)}
              </div>

              <div className="mt-4 flex items-center justify-center gap-4 border-t border-sky-400/30 pt-4 md:justify-start">
                <TeamLogoCircle
                  logoUrl={celebration.teamLogo}
                  name={celebration.teamName}
                  sizeClass="h-14 w-14 sm:h-20 sm:w-20"
                />
                <div className="min-w-0 text-left">
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/70 sm:text-xs">
                    Sold To
                  </div>
                  <div className="aa-display break-words text-2xl uppercase leading-tight text-white sm:text-4xl">
                    {celebration.teamName || "Team"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}