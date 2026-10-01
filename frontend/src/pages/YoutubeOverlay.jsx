import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import socket from "../utils/socket";
import { Radio, Shield, Gavel } from "lucide-react";
import { getImageUrl } from "../utils/imageUrl";
import { computeTeamMetrics } from "../components/TeamOverviewCard"; // adjust path if TeamOverviewCard lives elsewhere

const TEAM_ROTATE_MS = 5000; // how long each team stays on screen

const DEFAULT_PHOTO =
  "https://images.unsplash.com/photo-1607627000458-210e8d2bdb1d?w=200&h=200&fit=crop&crop=faces";

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/* All desktop sizes are in `cqw` (1% of the ticker bar's width), so fonts,
   photos and spacing scale together with the background image at any size. */
const cq = (n) => `${n}cqw`;

/* ---------- Small building blocks ---------- */

function StatBlock({ label, value, color }) {
  return (
    <div className="flex flex-col leading-none">
      <span className="font-bold uppercase text-slate-500" style={{ fontSize: cq(0.78), letterSpacing: "0.08em" }}>
        {label}
      </span>
      <span className={`font-black tabular-nums ${color}`} style={{ fontSize: cq(1.95), marginTop: cq(0.35) }}>
        {value}
      </span>
    </div>
  );
}

function StatBlockMobile({ label, value, accent }) {
  return (
    <div className="px-2 py-2">
      <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-xs font-black tabular-nums ${accent ? "text-[#00c853]" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

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
function TeamBadge({ team, size }) {
  const [failed, setFailed] = useState(false);
  const url = team.logo_url ? getImageUrl(team.logo_url) : null;
  useEffect(() => setFailed(false), [url]);
  const showImg = url && !failed;
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-white"
      style={size ? { width: size, height: size } : undefined}
    >
      {showImg ? (
        <img src={url} alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <Shield className="h-1/2 w-1/2 text-[#629221]" />
      )}
    </span>
  );
}

function Dots({ count, active, className = "" }) {
  if (count < 2) return null;
  return (
    <div className={`flex items-center ${className}`} style={{ gap: cq(0.3) }}>
      {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
        <span
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            height: cq(0.35),
            width: i === active % 8 ? cq(1.1) : cq(0.35),
            backgroundColor: i === active % 8 ? "#15803d" : "rgba(21,128,61,0.3)",
          }}
        />
      ))}
    </div>
  );
}

/* ---------- Rotating team panel (desktop / tablet) ---------- */

function TeamStat({ label, value, color, icon }) {
  return (
    <div className="min-w-0 leading-none">
      <p
        className="flex items-center font-bold uppercase text-slate-600"
        style={{ fontSize: cq(0.55), letterSpacing: "0.07em", gap: cq(0.2) }}
      >
        {icon}
        {label}
      </p>
      <p className="truncate font-black tabular-nums" style={{ fontSize: cq(1.1), marginTop: cq(0.15), color }}>
        ₹{formatAmount(value)}
      </p>
    </div>
  );
}

function TeamSlide({ team, metrics, count, index }) {
  const name = team.team_name || team.name || "Team";
  return (
    <div className="overlay-slide min-w-0">
      {/* Header: small logo + team name + dots */}
      <div className="flex items-center" style={{ gap: cq(0.6) }}>
        <TeamBadge team={team} size={cq(1.7)} />
        <p className="min-w-0 flex-1 truncate font-black italic leading-none text-slate-900" style={{ fontSize: cq(1.2) }}>
          {name}
        </p>
        <Dots count={count} active={index} />
      </div>

      {/* 2 x 2 stats */}
      <div className="grid grid-cols-2" style={{ marginTop: cq(0.45), columnGap: cq(1), rowGap: cq(0.35) }}>
        <TeamStat label="Purse" value={metrics.totalPurse} color="#EC008C" />
        <TeamStat label="Spent" value={metrics.spent} color="#D97706" />
        <TeamStat label="Balance" value={metrics.balance} color="#15803d" />
        <TeamStat
          label="Max Bid"
          value={metrics.maxBid}
          color="#EC008C"
          icon={<Gavel style={{ width: cq(0.65), height: cq(0.65) }} className="shrink-0" />}
        />
      </div>
    </div>
  );
}

/* ---------- Rotating team strip (mobile) ---------- */

function TeamSlideMobile({ team, metrics }) {
  const name = team.team_name || team.name || "Team";
  return (
    <div className="overlay-slide">
      <div className="flex items-center gap-2 px-3 pt-2">
        <TeamBadge team={team} size="24px" />
        <p className="min-w-0 flex-1 truncate text-xs font-black italic text-slate-900">{name}</p>
        <span className="text-[7px] font-black uppercase tracking-[0.15em] text-[#e91e63]">Team Purse</span>
      </div>
      <div className="grid grid-cols-4 divide-x divide-slate-100 px-1 py-1.5 text-center">
        {[
          ["Purse", metrics.totalPurse, "#EC008C"],
          ["Spent", metrics.spent, "#D97706"],
          ["Balance", metrics.balance, "#15803d"],
          ["Max Bid", metrics.maxBid, "#EC008C"],
        ].map(([label, value, color]) => (
          <div key={label} className="min-w-0 px-1">
            <p className="text-[7px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="truncate text-[10px] font-black tabular-nums" style={{ color }}>
              ₹{formatAmount(value)}
            </p>
          </div>
        ))}
      </div>
      <div className="mx-3 mb-2 h-1 overflow-hidden rounded-full bg-[#F59E0B]/25">
        <div
          className="h-full rounded-full bg-[#22C55E] transition-all duration-500"
          style={{ width: `${metrics.balancePct}%` }}
        />
      </div>
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

  /* Auto-rotate through teams */
  useEffect(() => {
    if (teams.length < 2) {
      setTeamIndex(0);
      return;
    }
    const id = setInterval(() => setTeamIndex((i) => (i + 1) % teams.length), TEAM_ROTATE_MS);
    return () => clearInterval(id);
  }, [teams.length]);

  const activeTeam = teams.length ? teams[teamIndex % teams.length] : null;

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

  if (!currentPlayer) return null;

  const player = currentPlayer;

  return (
    <div className="fixed inset-x-0 bottom-8 z-50 bg-transparent px-4 md:px-12">
      <style>{`
        @keyframes overlaySlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .overlay-slide { animation: overlaySlideIn 450ms ease-out both; }
        @media (prefers-reduced-motion: reduce) { .overlay-slide { animation: none; } }
      `}</style>

      <div className="relative mx-auto w-full max-w-6xl drop-shadow-2xl">
        {/* ===== Desktop / tablet: chevron ticker bar over the bg asset ===== */}
        <div
          className="relative hidden aspect-[2.95/1] w-full overflow-hidden md:block"
          style={{ containerType: "inline-size" }}
        >
          <img src="/ticker-bg.png" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />

          <div className="absolute inset-0 flex items-center">
            {/* Pink segment — current player */}
            <div className="flex h-full w-[76%] items-center" style={{ paddingLeft: cq(2.6), paddingRight: cq(1.5), gap: cq(2) }}>
              {/* Brand / Title */}
              <div className="flex shrink-0 items-center" style={{ gap: cq(0.9) }}>
                <span
                  className="flex shrink-0 items-center justify-center rounded-full border-2 border-[#e91e63] text-[#e91e63]"
                  style={{ width: cq(3.4), height: cq(3.4) }}
                >
                  <Radio style={{ width: cq(1.6), height: cq(1.6) }} />
                </span>
                <div className="leading-none">
                  <p className="font-black uppercase tracking-tight text-slate-900" style={{ fontSize: cq(2.1) }}>
                    <span className="text-[#e91e63]">Live</span> Auction
                  </p>
                  <p
                    className="font-bold uppercase text-slate-500"
                    style={{ fontSize: cq(0.62), letterSpacing: "0.14em", marginTop: cq(0.45) }}
                  >
                    Players &bull; Passion &bull; Bigger Dreams
                  </p>
                </div>
              </div>

              <div className="shrink-0 bg-slate-300/70" style={{ width: 1, height: cq(4.2) }} />

              {/* Player Main Info */}
              <div className="flex min-w-0 flex-1 items-center" style={{ gap: cq(1.2) }}>
                <SafeImg
                  src={player.photo}
                  alt={player.name}
                  className="shrink-0 rounded-xl object-cover object-top ring-2 ring-white"
                  style={{ width: cq(5.2), height: cq(5.2) }}
                />
                <div className="min-w-0">
                  <p className="truncate font-black leading-tight text-slate-900" style={{ fontSize: cq(2.3) }}>
                    {player.name}
                  </p>
                  <div className="flex items-center" style={{ gap: cq(0.5), marginTop: cq(0.5) }}>
                    <span
                      className="rounded-full bg-[#e91e63]/10 font-bold text-[#e91e63]"
                      style={{ fontSize: cq(0.85), padding: `${cq(0.2)} ${cq(0.8)}` }}
                    >
                      {player.category}
                    </span>
                    <span
                      className="rounded-full bg-[#00c853]/15 font-bold text-[#00873a]"
                      style={{ fontSize: cq(0.85), padding: `${cq(0.2)} ${cq(0.8)}` }}
                    >
                      {player.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* Player Stats */}
              <div className="flex shrink-0 items-center" style={{ gap: cq(2.4) }}>
                <StatBlock label="Base Price" value={`₹${formatAmount(player.basePrice)}`} color="text-[#e91e63]" />
                <StatBlock label="Current Bid" value={`₹${formatAmount(player.currentBid)}`} color="text-[#00a844]" />
              </div>
            </div>

            {/* Green segment — rotating team overview */}
            <div
              className="flex h-full min-w-0 flex-1 items-center overflow-hidden"
              style={{ paddingLeft: cq(5), paddingRight: cq(2.4), paddingTop: cq(0.2), paddingBottom: cq(0.2) }}
            >
              {activeTeam && (
                <div className="w-full min-w-0">
                  <TeamSlide
                    key={activeTeam.team.id ?? teamIndex}
                    team={activeTeam.team}
                    metrics={activeTeam.metrics}
                    count={teams.length}
                    index={teamIndex}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== Mobile fallback: stacked card ===== */}
        <div className="overflow-hidden rounded-2xl border border-[#e91e63]/20 shadow-sm md:hidden">
          <div className="flex items-center gap-3 bg-gradient-to-br from-[#fde3ee] to-[#fdf2f6] p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[#e91e63] text-[#e91e63]">
              <Radio size={13} />
            </span>
            <SafeImg
              src={player.photo}
              alt={player.name}
              className="h-11 w-11 shrink-0 rounded-xl object-cover object-top ring-2 ring-white"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-slate-900">{player.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                <span className="rounded-full bg-[#e91e63]/10 px-1.5 py-0.5 text-[8px] font-bold text-[#e91e63]">
                  {player.category}
                </span>
                <span className="rounded-full bg-[#00c853]/10 px-1.5 py-0.5 text-[8px] font-bold text-[#00c853]">
                  {player.role}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-[#e91e63]/10 border-t border-[#e91e63]/10 bg-white text-center">
            <StatBlockMobile label="Base Price" value={`₹ ${formatAmount(player.basePrice)}`} />
            <StatBlockMobile label="Current Bid" value={`₹ ${formatAmount(player.currentBid)}`} accent />
          </div>

          {/* Rotating team overview */}
          {activeTeam && (
            <div className="border-t border-emerald-100 bg-gradient-to-br from-[#e3f7ec] to-[#f4fbf7]">
              <TeamSlideMobile
                key={activeTeam.team.id ?? teamIndex}
                team={activeTeam.team}
                metrics={activeTeam.metrics}
              />
              <Dots count={teams.length} active={teamIndex} className="justify-center pb-1.5" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}