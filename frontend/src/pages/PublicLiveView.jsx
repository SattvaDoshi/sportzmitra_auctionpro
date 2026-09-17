import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import { getImageUrl } from "../utils/imageUrl";
import socket from "../utils/socket";
import { Gavel, Users, Bell, Zap, ChevronRight } from "lucide-react";

/**
 * PublicLiveView.jsx
 */

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function dicebearLogo(seed) {
  return `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
}

const TEAM_ACCENTS = [
  { text: "text-[#e91e63]", bar: "bg-[#e91e63]", ring: "ring-[#e91e63]/30", bg: "bg-[#e91e63]/10" },
  { text: "text-[#00c853]", bar: "bg-[#00c853]", ring: "ring-[#00c853]/30", bg: "bg-[#00c853]/10" },
  { text: "text-[#0f172a]", bar: "bg-[#0f172a]", ring: "ring-[#0f172a]/20", bg: "bg-slate-100" },
  { text: "text-[#d97706]", bar: "bg-[#d97706]", ring: "ring-[#d97706]/30", bg: "bg-[#d97706]/10" },
  { text: "text-[#0284c7]", bar: "bg-[#0284c7]", ring: "ring-[#0284c7]/30", bg: "bg-[#0284c7]/10" },
  { text: "text-[#9333ea]", bar: "bg-[#9333ea]", ring: "ring-[#9333ea]/30", bg: "bg-[#9333ea]/10" },
];

const DEFAULT_TEAMS = [];

function PlayerPhoto({ url, name, className }) {
  const photo = getImageUrl(url);
  const [failed, setFailed] = useState(false);

  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={name || "Player"}
        draggable="false"
        className={className}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={`${className} flex items-center justify-center bg-slate-200 font-black text-[#E5007D]/40`}>
      {String(name || "P").charAt(0).toUpperCase()}
    </div>
  );
}

export default function PublicLiveView() {
  const { publicSlug } = useParams();
  const [auction, setAuction] = useState(null);
  const [state, setState] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [celebration, setCelebration] = useState(null);

  const currentPlayer = useMemo(() => {
    if (!state) return null;
    return {
      id: state.current_player_id,
      player_name: state.player_name || "",
      category: state.category || "",
      player_role: state.player_role || state.batting_style || "",
      base_price: state.base_price || 0,
      photo_url: state.photo_url,
      jersey_number: state.jersey_number ?? state.player_number,
    };
  }, [state]);

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
        setState((prev) => {
          setCelebration({
            type: "SOLD",
            teamName: payload?.team_name || payload?.sold_team_name || prev?.highest_team_name || "",
            amount: payload?.sold_amount || payload?.bid_amount || prev?.current_bid || 0,
          });
          return payload.state || prev;
        });
        setTimeout(() => setCelebration(null), 2500);
        setSnapshot(payload);
        if (payload.auction) setAuction(payload.auction);
      }
    };

    const handlePlayerUnsold = (payload) => {
      if (payload?.auction?.id === auction.id || payload?.auctionId === auction.id) {
        setCelebration({ type: "UNSOLD" });
        setTimeout(() => setCelebration(null), 2000);
        setSnapshot(payload);
        if (payload.auction) setAuction(payload.auction);
        if (payload.state) setState(payload.state);
      }
    };

    socket.on("auctionSnapshotUpdated", handleSnapshotUpdated);
    socket.on("playerSold", handlePlayerSold);
    socket.on("playerUnsold", handlePlayerUnsold);
    socket.on("playerFinalUnsold", handlePlayerUnsold);

    return () => {
      socket.off("auctionSnapshotUpdated", handleSnapshotUpdated);
      socket.off("playerSold", handlePlayerSold);
      socket.off("playerUnsold", handlePlayerUnsold);
      socket.off("playerFinalUnsold", handlePlayerUnsold);
    };
  }, [auction?.id, publicSlug]);

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#FBF7F9]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#E5007D] border-t-transparent" />
      </div>
    );
  }

  const basePrice = Number(currentPlayer?.base_price || 0);
  const currentBid = Number(state?.current_bid || basePrice || 0);
  const maxBid = auction?.max_bid_cap ?? state?.max_bid ?? (basePrice ? basePrice * 3 : 0);

  const rawTeams = snapshot?.teamsSummary?.length
    ? snapshot.teamsSummary
    : auction?.teams?.length
    ? auction.teams
    : DEFAULT_TEAMS;
  const teams = rawTeams.map((t, i) => ({
    ...t,
    accent: TEAM_ACCENTS[i % TEAM_ACCENTS.length],
    resolvedLogo: t.logo_url ? getImageUrl(t.logo_url) : dicebearLogo(t.team_name),
    displayPurse: t.remaining_purse ?? t.remaining_budget ?? 0,
    startingPurse: t.total_purse ?? t.starting_purse ?? t.total_budget ?? 0,
  }));

  const soldPlayers = snapshot?.soldPlayers || [];

  const recentUpdates = soldPlayers.slice(0, 6).map((p, i) => ({
    id: p.id || i,
    team_name: p.sold_team_name,
    amount: p.sold_price,
    message: p.player_name,
  }));

  const latestBids = soldPlayers.slice(0, 6).map((p, i) => ({
    id: p.id || i,
    player_name: p.player_name,
    player_role: p.player_role,
    photo_url: p.photo_url,
    amount: p.sold_price,
    team_name: p.sold_team_name,
  }));

  const seasonLabel = auction?.season_label || auction?.auction_name || "Auction Arena";

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-[#FBF7F9] font-sans text-slate-900 bg-[url('/publicView-bg.png')] bg-cover bg-center bg-no-repeat">
      <CelebrationOverlay celebration={celebration} />

      {/* Backdrop wash */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-[#E5007D]/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-10 h-[600px] w-[600px] rounded-full bg-[#8CC63F]/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-full bg-gradient-to-br from-[#E5007D]/[0.04] via-transparent to-[#8CC63F]/[0.08]" />

      <div className="relative mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-5 md:px-8 md:py-7">
        {/* ---------------- HEADER ---------------- */}
        <header className="mb-6 flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between lg:gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 lg:contents">
            {/* LEFT: Logo / wordmark */}
            <div className="flex min-w-0 shrink-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#E5007D]/10">
                <Gavel className="h-6 w-6 -rotate-45 text-[#E5007D]" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-2xl font-black uppercase leading-none tracking-tight sm:text-3xl">
                  <span className="text-[#E5007D]">Auction</span> <span className="text-slate-900">Arena</span>
                </div>
                <div className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                  Players &middot; Passion &middot; Bigger Dreams
                </div>
              </div>
            </div>

            {/* RIGHT: Season title + ribbon */}
            <div className="order-3 flex shrink-0 items-center gap-4 lg:order-3">
              <div className="min-w-0 max-w-[200px] text-right sm:max-w-[280px]">
                <div className="truncate text-lg font-black uppercase leading-none tracking-tight text-slate-900 sm:text-xl">
                  {seasonLabel}
                </div>
                <div className="truncate text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Auction Arena
                </div>
              </div>
              <div className="hidden shrink-0 -rotate-6 rounded-lg bg-[#E5007D] px-3 py-1.5 text-right text-[10px] font-black italic uppercase leading-tight text-white shadow-md lg:block">
                Cricket
                <br />
                Builds
                <br />
                Bridges
              </div>
            </div>
          </div>

          {/* MIDDLE: Status Badges */}
          <div className="order-2 flex flex-wrap items-center justify-center gap-2 lg:order-2 lg:flex-1 lg:justify-center">
            <a
              href={`/live/${publicSlug}/dashboard`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700 shadow-sm transition-colors hover:border-[#E5007D] hover:text-[#E5007D]"
            >
              Public Dashboard
            </a>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              Live View
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 shadow-sm">
              Auction ID <strong className="ml-1 text-slate-700">#{auction?.auction_code || publicSlug}</strong>
            </span>
          </div>
        </header>

        {/* ---------------- MAIN GRID ---------------- */}
        <div className="grid min-w-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* PLAYER HERO CARD */}
          <section className="relative flex min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <div className="flex flex-1 flex-col sm:flex-row">
              {/* Photo side */}
              <div className="relative h-[260px] w-full shrink-0 overflow-hidden bg-gradient-to-br from-[#E5007D]/15 to-[#8CC63F]/10 sm:h-auto sm:w-[46%]">
                <div className="pointer-events-none absolute -left-2 top-6 max-w-[90%] select-none text-[15vw] font-black uppercase leading-[0.85] tracking-tighter text-[#E5007D]/10 sm:text-[3.6vw]">
                  {currentPlayer?.player_name || "Waiting"}
                </div>
                <div className="absolute inset-0 flex items-end p-3">
                  <PlayerPhoto
                    url={currentPlayer?.photo_url}
                    name={currentPlayer?.player_name}
                    className="h-full w-full rounded-2xl object-cover object-top"
                  />
                </div>
              </div>

              {/* Info side */}
              <div className="relative flex min-w-0 flex-1 flex-col justify-center p-5 sm:p-7">
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex items-center rounded-full bg-[#E5007D] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                    Current Player
                  </span>
                  {currentPlayer?.jersey_number ? (
                    <div className="select-none text-[clamp(36px,6vw,64px)] font-black leading-none text-[#E5007D]/15">
                      #{currentPlayer.jersey_number}
                    </div>
                  ) : null}
                </div>

                <h1 className="mt-3 break-words text-[clamp(28px,4vw,44px)] font-black uppercase leading-[1.05] tracking-tight text-slate-900">
                  {currentPlayer?.player_name || "Waiting for player..."}
                </h1>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                  {currentPlayer?.player_role && <span>{currentPlayer.player_role}</span>}
                  {currentPlayer?.category && (
                    <span className="rounded-full bg-[#E5007D]/10 px-3 py-1 text-[11px] font-black text-[#E5007D]">
                      {currentPlayer.category}
                    </span>
                  )}
                  {state?.highest_team_name && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase text-slate-600">
                      Leading: {state.highest_team_name}
                    </span>
                  )}
                </div>

                {/* Current Bid Display Box with Hammer & Bid (Zap) Icons */}
                <div className="mt-5 rounded-2xl bg-[#FDEAF3] p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-600">
                    <Gavel className="h-4 w-4 -rotate-45 text-[#E5007D]" />
                    <Zap className="h-4 w-4 text-[#E5007D]" />
                    <span>Current Bid</span>
                  </div>
                  <div className="mt-1 text-[clamp(32px,5vw,52px)] font-black leading-none text-[#E5007D]">
                    ₹{formatAmount(currentBid)}
                  </div>
                </div>

                {/* Base Price and Max Bid (Min Bid removed) */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Base Price</div>
                    <div className="mt-1 truncate text-sm font-black text-slate-900">₹{formatAmount(basePrice)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Max Bid</div>
                    <div className="mt-1 truncate text-sm font-black text-slate-900">₹{formatAmount(maxBid)}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT COLUMN */}
          <div className="flex min-w-0 flex-col gap-5">
            {/* TEAMS & BUDGET */}
            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
                  <Users className="h-4 w-4 text-[#E5007D]" />
                  Teams &amp; Remaining Budget
                </div>
                <button className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#E5007D] hover:opacity-70">
                  View All Teams <ChevronRight className="h-3 w-3" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {teams.slice(0, 6).map((team, index) => {
                  const isLeading = String(state?.highest_team_id) === String(team.id);
                  const pct =
                    team.startingPurse && team.startingPurse > 0
                      ? Math.max(4, Math.min(100, (team.displayPurse / team.startingPurse) * 100))
                      : 60;
                  return (
                    <div
                      key={team.id ?? index}
                      className={`rounded-xl border p-3 ${
                        isLeading
                          ? "border-[#8CC63F] bg-[#8CC63F]/10 ring-1 ring-[#8CC63F]/50"
                          : `border-slate-100 ${team.accent.bg}`
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/70">
                          <img src={team.resolvedLogo} alt={team.team_name} className="h-full w-full object-cover" />
                        </div>
                        <div className="truncate text-[10px] font-black uppercase tracking-wide text-slate-700">
                          {team.team_name}
                        </div>
                      </div>
                      <div className={`mt-2 truncate text-sm font-black ${team.accent.text}`}>
                        ₹{formatAmount(team.displayPurse)}
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
                        <div className={`h-full rounded-full ${team.accent.bar}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {teams.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-10 text-center">
                    <Users className="h-6 w-6 text-slate-300" />
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Teams will appear here
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* RECENT UPDATES */}
            <section className="flex flex-1 flex-col rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
                <Bell className="h-4 w-4 text-[#E5007D]" />
                Recent Updates
              </div>
              <div className="flex flex-1 flex-col space-y-2 overflow-y-auto">
                {recentUpdates.length === 0 && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-10 text-center">
                    <Bell className="h-6 w-6 text-slate-300" />
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Bids will show up here live
                    </div>
                  </div>
                )}
                {recentUpdates.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E5007D]/15 text-[9px] font-black text-[#E5007D]">
                      {String(u.team_name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 truncate text-xs font-semibold text-slate-700">
                      {u.team_name ? (
                        <>
                          <span className="font-black text-slate-900">{u.team_name}</span> placed a bid of{" "}
                          <span className="font-black text-emerald-600">₹{formatAmount(u.amount)}</span>
                        </>
                      ) : (
                        <span className="text-slate-500">Sold: {u.message}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* ---------------- LATEST BIDS STRIP ---------------- */}
        <section className="mt-5 flex flex-col rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
            <Zap className="h-4 w-4 text-[#E5007D]" />
            Latest Bids
          </div>
          <div className="flex min-h-[104px] items-center gap-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {latestBids.length === 0 && (
              <div className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-6 text-center">
                <Zap className="h-6 w-6 text-slate-300" />
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Sold players will appear here as bidding happens
                </div>
              </div>
            )}
            {latestBids.map((b) => (
              <div
                key={b.id}
                className="flex min-w-[190px] shrink-0 items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3"
              >
                <PlayerPhoto
                  url={b.photo_url}
                  name={b.player_name}
                  className="h-14 w-14 shrink-0 overflow-hidden rounded-xl object-cover"
                />
                <div className="min-w-0">
                  <div className="truncate text-xs font-black text-slate-900">{b.player_name}</div>
                  <div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {b.player_role || "-"}
                  </div>
                  <div className="mt-0.5 truncate text-xs font-black text-[#E5007D]">
                    ₹{formatAmount(b.amount)}
                  </div>
                  {b.team_name && (
                    <div className="mt-1 inline-flex items-center gap-1 truncate rounded-full bg-[#E5007D]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#E5007D]">
                      {b.team_name}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- FOOTER ---------------- */}
        <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-6 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <div>
            {seasonLabel} &nbsp;|&nbsp; Players &middot; Passion &middot; Bigger Dreams
          </div>
          <div className="flex items-center gap-1.5 text-[#E5007D]">
            <span className="h-2 w-2 rounded-full bg-[#E5007D]" />
            More Than A Game
          </div>
        </footer>
      </div>
    </div>
  );
}

function CelebrationOverlay({ celebration }) {
  if (!celebration) return null;
  const isSold = celebration.type === "SOLD";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-md">
      <div
        className={`w-full max-w-sm rounded-3xl border bg-white p-6 text-center shadow-2xl ${
          isSold ? "border-emerald-300" : "border-[#E5007D]/30"
        }`}
      >
        <span
          className={`inline-block rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
            isSold ? "bg-emerald-100 text-emerald-700" : "bg-[#E5007D]/10 text-[#E5007D]"
          }`}
        >
          {isSold ? "PLAYER ACQUIRED" : "UNSOLD"}
        </span>

        <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-900">{celebration.type}</h2>

        {isSold && celebration.teamName && (
          <div className="mt-1 text-base font-black uppercase text-slate-600">{celebration.teamName}</div>
        )}

        {isSold && celebration.amount && (
          <div className="mt-3 inline-block rounded-xl border border-slate-100 bg-slate-50 px-5 py-2 text-xl font-black text-emerald-600">
            ₹{formatAmount(celebration.amount)}
          </div>
        )}
      </div>
    </div>
  );
}