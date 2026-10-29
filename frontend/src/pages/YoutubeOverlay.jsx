import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import socket from "../utils/socket";
import { Shield, Gavel } from "lucide-react";
import { getImageUrl } from "../utils/imageUrl";
import { computeTeamMetrics } from "../components/TeamOverviewCard"; // adjust path if TeamOverviewCard lives elsewhere

const TEAM_ROTATE_MS = 5000; // how long each team stays on screen when nobody is leading

const DEFAULT_PHOTO =
  "https://images.unsplash.com/photo-1607627000458-210e8d2bdb1d?w=200&h=200&fit=crop&crop=faces";

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/* The desktop bar is designed on a 2140 x 300 canvas.
   `u(n)` converts a canvas unit into cqw (1% of the bar width) so everything
   (shape, photo, text) scales together at any size.
   To change the bar height, change H (and the y positions / shape paths below). */
const W = 2140;
const H = 300;
const u = (n) => `${((n / W) * 100).toFixed(4)}cqw`;

/* Largest font (canvas units) at which the bid still fits the 360-unit wide bid area.
   Digits ~0.62em, separators ~0.3em; capped so short amounts stay big, not huge. */
function bidFontSize(value) {
  const text = formatAmount(value);
  let em = 0;
  for (const ch of text) em += /\d/.test(ch) ? 0.62 : 0.3;
  return Math.max(60, Math.min(130, 360 / em));
}

/* Player name is always shown in full (never "..."): the font shrinks to fit the
   700-unit wide name area, and only wraps to a 2nd line for extremely long names. */
function playerNameFontSize(name) {
  const len = Math.max(String(name || "").length, 1);
  return Math.max(26, Math.min(58, 700 / (len * 0.66)));
}

/* Team name is always shown in full: the font shrinks to fit the 380-unit wide
   name area (and only wraps to a 2nd line for extremely long names). */
function teamNameFontSize(name) {
  const len = Math.max(String(name || "").length, 1);
  return Math.max(22, Math.min(40, 380 / (len * 0.68)));
}

/* Shrinks a stat's font so the formatted amount always fits `maxWidth` canvas units.
   Big numbers like 10,00,000 or 1,00,00,000 get smaller instead of overlapping. */
function statFontSize(value, maxWidth, max = 46, min = 24) {
  const text = formatAmount(value);
  let em = 0;
  for (const ch of text) em += /\d/.test(ch) ? 0.62 : 0.3;
  return Math.max(min, Math.min(max, maxWidth / em));
}

const C = {
  pink: "#ec008c",
  pinkLine: "#f0387f",
  green: "#15a34a",
  greenText: "#15803d",
  amber: "#e97f0c",
  navy: "#0f1f3d",
};

/* ---------- Small building blocks ---------- */

/* Image with a safe fallback so a broken URL never shows alt text / a broken icon */
function SafeImg({ src, fallback = DEFAULT_PHOTO, alt = "", className = "", style }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <img
      src={failed ? fallback : src || fallback}
      alt={alt}
      onError={() => setFailed(true)}
      className={className}
      style={style}
    />
  );
}

/* Team logo with shield fallback */
function TeamBadge({ team, size, className = "" }) {
  const [failed, setFailed] = useState(false);
  const url = team?.logo_url ? getImageUrl(team.logo_url) : null;
  useEffect(() => setFailed(false), [url]);
  const showImg = url && !failed;
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ${className}`}
      style={size ? { width: size, height: size } : undefined}
    >
      {showImg ? (
        <img src={url} alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <Shield className="h-1/2 w-1/2 text-[#16a34a]" strokeWidth={2.2} />
      )}
    </span>
  );
}

/* Absolutely positioned block on the 2140 x 300 canvas */
function Abs({ x, y, children, style, className = "" }) {
  return (
    <div className={`absolute leading-none ${className}`} style={{ left: u(x), top: u(y), ...style }}>
      {children}
    </div>
  );
}

function TeamStat({ x, y, label, value, color, icon, maxWidth = 225 }) {
  return (
    <Abs x={x} y={y}>
      <p
        className="flex items-center font-extrabold uppercase text-slate-500"
        style={{ fontSize: u(23), letterSpacing: "0.02em", gap: u(8) }}
      >
        {icon}
        {label}
      </p>
      <p
        className="whitespace-nowrap font-black tabular-nums"
        style={{ fontSize: u(statFontSize(value, maxWidth)), marginTop: u(8), color }}
      >
        {formatAmount(value)}
      </p>
    </Abs>
  );
}

function Dots({ count, active }) {
  if (count < 2) return null;
  return (
    <div className="flex items-center" style={{ gap: u(7) }}>
      {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
        <span
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            height: u(8),
            width: i === active % 8 ? u(24) : u(8),
            backgroundColor: i === active % 8 ? "#15803d" : "rgba(21,128,61,0.3)",
          }}
        />
      ))}
    </div>
  );
}

/* ---------- Background shapes (pink + green segments) ---------- */

const PINK_PATH =
  "M110 3 L1455 3 Q1472 3 1478 16 L1588 281 Q1595 297 1575 297 L110 297 C40 297 3 245 3 190 C3 105 50 3 110 3 Z";
const GREEN_PATH =
  "M1468 4 L2040 3 C2090 3 2115 36 2125 78 L2137 215 C2140 270 2110 297 2055 297 L1590 297 Z";

function BarBackground() {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="absolute inset-0 h-full w-full"
      style={{ overflow: "visible" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="yo-pink" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde4ee" />
          <stop offset="0.5" stopColor="#fff2f7" />
          <stop offset="1" stopColor="#fbc9de" />
        </linearGradient>
        <linearGradient id="yo-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e6fbef" />
          <stop offset="0.55" stopColor="#f4fff8" />
          <stop offset="1" stopColor="#c9f2da" />
        </linearGradient>
        <pattern id="yo-dots-pink" width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="3" fill="#ec008c" opacity="0.35" />
        </pattern>
        <pattern id="yo-dots-green" width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="3" fill="#16a34a" opacity="0.4" />
        </pattern>
        <clipPath id="yo-clip-pink">
          <path d={PINK_PATH} />
        </clipPath>
        <clipPath id="yo-clip-green">
          <path d={GREEN_PATH} />
        </clipPath>
      </defs>

      {/* Pink segment */}
      <path d={PINK_PATH} fill="url(#yo-pink)" />
      <g clipPath="url(#yo-clip-pink)">
        {/* <rect x="40" y="90" width="170" height="190" fill="url(#yo-dots-pink)" /> */}
        {/* soft waves */}
        <path d="M0 210 C300 100 560 100 900 190 S1400 275 1600 160 L1600 300 L0 300 Z" fill="#ffffff" opacity="0.28" />
        <path d="M600 288 C900 240 1200 243 1500 288 L1500 300 L600 300 Z" fill="#ec008c" opacity="0.12" />
        <path d="M0 50 C250 17 450 33 700 12 L700 0 L0 0 Z" fill="#ffffff" opacity="0.5" />
      </g>
      <path d={PINK_PATH} fill="none" stroke={C.pinkLine} strokeWidth="6" strokeLinejoin="round" />

      {/* Green segment */}
      <path d={GREEN_PATH} fill="url(#yo-green)" />
      <g clipPath="url(#yo-clip-green)">
        <rect x="1990" y="25" width="130" height="110" fill="url(#yo-dots-green)" />
        <path d="M1500 275 C1750 215 1950 275 2140 210 L2140 300 L1500 300 Z" fill="#22c55e" opacity="0.18" />
      </g>
      <path d={GREEN_PATH} fill="none" stroke={C.green} strokeWidth="6" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Desktop / tablet bar ---------- */

function DesktopBar({ player, displayTeam, count, index, showDots }) {
  const teamName = displayTeam?.team?.team_name || displayTeam?.team?.name || "Team";
  const m = displayTeam?.metrics;
  return (
    <div
      className="relative hidden w-full md:block"
      style={{ containerType: "inline-size", aspectRatio: `${W} / ${H}`, filter: "drop-shadow(0 14px 18px rgba(236,0,140,0.18))" }}
    >
      <BarBackground />

      <div className="absolute inset-0">
        {/* Brand logo: bottom middle of the bar */}
        <Abs x={985} y={252} style={{ width: u(170), display: "flex", justifyContent: "center" }}>
          <img
            src="/sportzmitra-logo-transparent.png"
            alt="SportzMitra"
            className="object-contain"
            style={{ width: u(170) }}
          />
        </Abs>

        {/* Player photo */}
        <div
          className="absolute overflow-hidden bg-white"
          style={{
            left: u(55),
            top: u(25),
            width: u(250),
            height: u(250),
            borderRadius: u(36),
            border: `${u(6)} solid #fff`,
            boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
          }}
        >
          <SafeImg src={player.photo} alt={player.name} className="h-full w-full object-cover object-top" />
        </div>

        {/* Name + pills + base price (sits right beside the photo, tight spacing).
            The name gets the full width up to the bid divider and auto-fits: no "..." */}
        <Abs x={340} y={28} className="flex items-center" style={{ width: u(720), height: u(80) }}>
          <p
            className="font-black uppercase"
            style={{
              fontSize: u(playerNameFontSize(player.name)),
              color: C.navy,
              lineHeight: 1.05,
              wordBreak: "break-word",
            }}
            title={player.name}
          >
            {player.name}
          </p>
        </Abs>
        <Abs x={340} y={116} className="flex items-center" style={{ gap: u(16) }}>
          <span
            className="rounded-full font-extrabold"
            style={{ fontSize: u(25), padding: `${u(10)} ${u(24)}`, background: "#ffc4da", color: "#e0006c", lineHeight: 1 }}
          >
            {player.category}
          </span>
          <span
            className="rounded-full font-extrabold"
            style={{ fontSize: u(25), padding: `${u(10)} ${u(24)}`, background: "#ccf3dc", color: C.greenText, lineHeight: 1 }}
          >
            {player.role}
          </span>
        </Abs>
        <Abs x={340} y={188}>
          <p className="font-extrabold uppercase text-slate-500" style={{ fontSize: u(22), letterSpacing: "0.02em" }}>
            Base Price
          </p>
          <p className="font-black tabular-nums text-slate-600" style={{ fontSize: u(44), marginTop: u(8) }}>
            {formatAmount(player.basePrice)}
          </p>
        </Abs>

        {/* Current bid: gets the whole middle space; font auto-shrinks for long (lakh+) amounts */}
        <div
          className="absolute"
          style={{ left: u(1086), top: u(55), width: 1.5, height: u(190), background: "rgba(100,116,139,0.35)" }}
        />
        <Abs x={1104} y={0} className="flex flex-col items-center justify-center" style={{ width: u(366), height: u(H) }}>
          <p className="font-black uppercase" style={{ fontSize: u(30), letterSpacing: "0.02em", color: C.green }}>
            Current Bid
          </p>
          <p
            className="whitespace-nowrap font-black tabular-nums"
            style={{ fontSize: u(bidFontSize(player.currentBid)), marginTop: u(6), color: C.green, lineHeight: 1 }}
          >
            {formatAmount(player.currentBid)}
          </p>
        </Abs>

        {/* Team segment */}
        {displayTeam && (
          <div key={displayTeam.team.id ?? index} className="overlay-slide absolute inset-0">
            <Abs x={1577} y={16}>
              <TeamBadge team={displayTeam.team} size={u(76)} className="shadow-md" />
            </Abs>
            {/* Full team name (never truncated) */}
            <Abs x={1670} y={16} className="flex items-center" style={{ width: u(390), height: u(76) }}>
              <p
                className="font-black italic uppercase"
                style={{ fontSize: u(teamNameFontSize(teamName)), color: C.navy, lineHeight: 1.05 }}
              >
                {teamName}
              </p>
            </Abs>

            <TeamStat x={1605} y={104} label="Purse" value={m.totalPurse} color={C.pink} maxWidth={235} />
            <TeamStat x={1890} y={104} label="Spent" value={m.spent} color={C.amber} maxWidth={220} />
            <TeamStat x={1605} y={190} label="Balance" value={m.balance} color={C.green} maxWidth={235} />
            <TeamStat
              x={1890}
              y={190}
              label="Max Bid"
              value={m.maxBid}
              color={C.pink}
              maxWidth={220}
              icon={<Gavel style={{ width: u(26), height: u(26) }} className="shrink-0" />}
            />
            {/* vertical green divider, moved right to clear the lakh amounts */}
            <div
              className="absolute"
              style={{ left: u(1862), top: u(112), width: 1.5, height: u(140), background: "rgba(22,163,74,0.35)" }}
            />
            {showDots && (
              <Abs x={1800} y={283}>
                <Dots count={count} active={index} />
              </Abs>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Mobile fallback (same look, stacked) ---------- */

function MobileStat({ label, value, color }) {
  return (
    <div className="min-w-0 px-1 text-center">
      <p className="text-[7px] font-extrabold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="whitespace-nowrap text-[11px] font-black tabular-nums" style={{ color }}>
        {formatAmount(value)}
      </p>
    </div>
  );
}

function MobileBar({ player, displayTeam, count, index, showDots }) {
  const teamName = displayTeam?.team?.team_name || displayTeam?.team?.name || "Team";
  return (
    <div className="space-y-1.5 md:hidden" style={{ filter: "drop-shadow(0 8px 12px rgba(236,0,140,0.18))" }}>
      <div
        className="flex items-center gap-2.5 rounded-2xl p-2.5"
        style={{ border: `2px solid ${C.pinkLine}`, background: "linear-gradient(120deg,#fde4ee,#fff2f7 55%,#fbc9de)" }}
      >
        <img src="/sportzmitra-logo-transparent.png" alt="SportzMitra" className="h-5 w-auto shrink-0 object-contain" />
        <SafeImg
          src={player.photo}
          alt={player.name}
          className="h-14 w-14 shrink-0 rounded-xl border-2 border-white object-cover object-top shadow"
        />
        <div className="min-w-0 flex-1">
          {/* Full player name (wraps instead of truncating) */}
          <p className="break-words text-sm font-black uppercase leading-tight text-[#0f1f3d]">{player.name}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded-full bg-[#ffc4da] px-2 py-0.5 text-[8px] font-extrabold text-[#e0006c]">
              {player.category}
            </span>
            <span className="rounded-full bg-[#ccf3dc] px-2 py-0.5 text-[8px] font-extrabold text-[#15803d]">
              {player.role}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right leading-none">
          <p className="text-[7px] font-extrabold uppercase text-slate-500">Base</p>
          <p className="text-xs font-black tabular-nums text-slate-600">{formatAmount(player.basePrice)}</p>
          <p className="mt-1 text-[7px] font-black uppercase text-[#15a34a]">Current Bid</p>
          <p className="text-xl font-black tabular-nums text-[#15a34a]">{formatAmount(player.currentBid)}</p>
        </div>
      </div>

      {displayTeam && (
        <div
          key={displayTeam.team.id ?? index}
          className="overlay-slide rounded-2xl p-2.5"
          style={{ border: `2px solid ${C.green}`, background: "linear-gradient(120deg,#e6fbef,#f4fff8 55%,#c9f2da)" }}
        >
          <div className="mb-1.5 flex items-center gap-2">
            <TeamBadge team={displayTeam.team} size="24px" className="shadow" />
            {/* Full team name (wraps instead of truncating) */}
            <p className="min-w-0 flex-1 text-xs font-black italic uppercase leading-tight text-[#0f1f3d]">{teamName}</p>
            {showDots && count > 1 && (
              <span className="shrink-0 text-[8px] font-bold text-emerald-700">
                {(index % count) + 1}/{count}
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 divide-x divide-emerald-600/20">
            <MobileStat label="Purse" value={displayTeam.metrics.totalPurse} color={C.pink} />
            <MobileStat label="Spent" value={displayTeam.metrics.spent} color={C.amber} />
            <MobileStat label="Balance" value={displayTeam.metrics.balance} color={C.green} />
            <MobileStat label="Max Bid" value={displayTeam.metrics.maxBid} color={C.pink} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Main component ---------- */

export default function YoutubeOverlay() {
  const { publicSlug } = useParams();
  const [auction, setAuction] = useState(null);
  const [state, setState] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [teamIndex, setTeamIndex] = useState(0);

  const currentPlayer = useMemo(() => {
    if (!state || !state.current_player_id) return null;
    return {
      name: state.player_name || "Unknown Player",
      category: state.category || "Uncategorized",
      role: state.player_role || state.batting_style || "N/A",
      basePrice: state.base_price || 0,
      currentBid: state.current_bid || 0,
      photo: getImageUrl(state.photo_url) || DEFAULT_PHOTO,
    };
  }, [state]);

  /* Teams + their normalized metrics (same helper the team overview card uses) */
  const teams = useMemo(() => {
    const list = snapshot?.teams || snapshot?.auction?.teams || [];
    const sold = snapshot?.soldPlayers || [];
    return list.map((t) => ({ team: t, metrics: computeTeamMetrics(t, snapshot?.auction || auction, sold) }));
  }, [snapshot, auction]);

  /* Team currently leading the bid.
     NOTE: adjust these field names if your `state` uses different keys. */
  const leaderTeam = useMemo(() => {
    if (!state) return null;
    const id =
      state.current_bid_team_id ??
      state.current_bidder_team_id ??
      state.highest_bidder_team_id ??
      state.leading_team_id ??
      null;
    const name =
      state.current_bid_team_name ??
      state.current_bidder_team_name ??
      state.highest_bidder_team_name ??
      state.leading_team_name ??
      "";
    if (id == null && !name) return null;
    return (
      teams.find((t) => id != null && String(t.team.id) === String(id)) ||
      teams.find((t) => name && (t.team.team_name || t.team.name) === name) ||
      null
    );
  }, [state, teams]);

  /* Auto-rotate through teams (shown only while nobody is leading) */
  useEffect(() => {
    if (teams.length < 2) {
      setTeamIndex(0);
      return;
    }
    const id = setInterval(() => setTeamIndex((i) => (i + 1) % teams.length), TEAM_ROTATE_MS);
    return () => clearInterval(id);
  }, [teams.length]);

  const rotatingTeam = teams.length ? teams[teamIndex % teams.length] : null;
  const displayTeam = leaderTeam || rotatingTeam;
  const showDots = !leaderTeam;

  const loadAuction = useCallback(async () => {
    try {
      const response = await api.get(`/public/auction/${publicSlug}`);
      setSnapshot(response.data);
      setAuction(response.data.auction || null);
      setState(response.data.state || null);
    } catch (error) {
      console.error("Overlay load error:", error);
    }
  }, [publicSlug]);

  useEffect(() => {
    loadAuction();
  }, [loadAuction]);

  useEffect(() => {
    if (!auction?.id) return;

    socket.emit("joinPublicAuction", { auctionId: auction.id, publicSlug });

    const handleSnapshotUpdated = (payload) => {
      if (payload?.auction?.id === auction.id || payload?.auctionId === auction.id) {
        setSnapshot(payload);
        if (payload.auction) setAuction(payload.auction);
        if (payload.state) setState(payload.state);
      }
    };

    const handlePlayerSold = (payload) => {
      if (payload?.auction?.id === auction.id || payload?.auctionId === auction.id) {
        setState((prev) => payload.state || prev);
        setSnapshot(payload);
        if (payload.auction) setAuction(payload.auction);
      }
    };

    socket.on("auction_snapshot", handleSnapshotUpdated);
    socket.on("auctionSnapshotUpdated", handleSnapshotUpdated);
    socket.on("playerSold", handlePlayerSold);
    socket.on("playerUnsold", handleSnapshotUpdated);
    socket.on("playerFinalUnsold", handleSnapshotUpdated);
    socket.on("bidPlaced", handleSnapshotUpdated);
    socket.on("bidPreviewUpdated", handleSnapshotUpdated);
    socket.on("auctionPaused", handleSnapshotUpdated);
    socket.on("auctionResumed", handleSnapshotUpdated);
    socket.on("playerSelected", handleSnapshotUpdated);

    return () => {
      socket.off("auction_snapshot", handleSnapshotUpdated);
      socket.off("auctionSnapshotUpdated", handleSnapshotUpdated);
      socket.off("playerSold", handlePlayerSold);
      socket.off("playerUnsold", handleSnapshotUpdated);
      socket.off("playerFinalUnsold", handleSnapshotUpdated);
      socket.off("bidPlaced", handleSnapshotUpdated);
      socket.off("bidPreviewUpdated", handleSnapshotUpdated);
      socket.off("auctionPaused", handleSnapshotUpdated);
      socket.off("auctionResumed", handleSnapshotUpdated);
      socket.off("playerSelected", handleSnapshotUpdated);
      socket.emit("leavePublicAuction", { auctionId: auction.id, publicSlug });
    };
  }, [auction?.id, publicSlug]);

  /* Ensure overlay transparency styles and classes on body/html */
  useEffect(() => {
    document.documentElement.classList.add("youtube-overlay-active");
    document.body.classList.add("youtube-overlay-active");
    return () => {
      document.documentElement.classList.remove("youtube-overlay-active");
      document.body.classList.remove("youtube-overlay-active");
    };
  }, []);

  const player = currentPlayer;

  return (
    <div className="relative h-full w-full bg-transparent overflow-hidden">
      <style>{`
        /* SPORTZMITRA - YOUTUBE LIVE OVERLAY */

        /* 1. Transparent background */
        html,
        body,
        #root {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: 100% !important;
          background: transparent !important;
          background-image: none !important;
          overflow: hidden !important;
        }

        /* 2. Remove full-screen gradient */
        body > #root > div:first-child {
          background: transparent !important;
          background-image: none !important;
        }

        /* 3. Position auction overlay near bottom */
        body > #root {
          position: relative !important;
        }

        /* 4. Improve text sharpness */
        body {
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
        }

        /* 5. Hide unnecessary scrollbars */
        ::-webkit-scrollbar {
          display: none !important;
        }

        @keyframes overlaySlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .overlay-slide { animation: overlaySlideIn 450ms ease-out both; }
        @media (prefers-reduced-motion: reduce) { .overlay-slide { animation: none; } }
      `}</style>

      {player && (
        <div className="fixed inset-x-0 bottom-6 z-50 bg-transparent px-4 md:px-8">
          <div className="relative mx-auto w-full max-w-[1500px]">
            <DesktopBar
              player={player}
              displayTeam={displayTeam}
              count={teams.length}
              index={teamIndex}
              showDots={showDots}
            />
            <MobileBar
              player={player}
              displayTeam={displayTeam}
              count={teams.length}
              index={teamIndex}
              showDots={showDots}
            />
          </div>
        </div>
      )}
    </div>
  );
}