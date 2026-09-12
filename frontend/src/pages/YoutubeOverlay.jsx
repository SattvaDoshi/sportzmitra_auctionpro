import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import { io } from "socket.io-client";
import { Radio } from "lucide-react";
import { getImageUrl } from "../utils/imageUrl";

const socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5000", {
  transports: ["websocket", "polling"],
});

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const DEFAULT_PHOTO =
  "https://images.unsplash.com/photo-1607627000458-210e8d2bdb1d?w=200&h=200&fit=crop&crop=faces";

function StatBlock({ label, value, color }) {
  return (
    <div className="flex flex-col">
      <span className="text-[8px] font-bold uppercase tracking-wide text-slate-400 lg:text-[9px]">{label}</span>
      <span className={`text-xs font-black tabular-nums lg:text-sm xl:text-base ${color}`}>{value}</span>
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

export default function YoutubeOverlay() {
  const { publicSlug } = useParams();
  const [auction, setAuction] = useState(null);
  const [state, setState] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

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

  const nextPlayer = useMemo(() => {
    if (!snapshot?.pendingPlayers?.length) return null;
    const next = snapshot.pendingPlayers[0];
    return {
      name: next.player_name || "TBA",
      category: next.category || "Uncategorized",
      role: next.player_role || next.batting_style || "N/A",
      photo: getImageUrl(next.photo_url) || DEFAULT_PHOTO,
    };
  }, [snapshot]);

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
    socket.on("player_sold", handlePlayerSold);
    socket.on("player_unsold", handleSnapshotUpdated);
    socket.on("bid_placed", handleSnapshotUpdated);
    socket.on("auction_started", handleSnapshotUpdated);
    socket.on("auction_paused", handleSnapshotUpdated);
    socket.on("auction_resumed", handleSnapshotUpdated);

    return () => {
      socket.off("auction_snapshot", handleSnapshotUpdated);
      socket.off("player_sold", handlePlayerSold);
      socket.off("player_unsold", handleSnapshotUpdated);
      socket.off("bid_placed", handleSnapshotUpdated);
      socket.off("auction_started", handleSnapshotUpdated);
      socket.off("auction_paused", handleSnapshotUpdated);
      socket.off("auction_resumed", handleSnapshotUpdated);
      socket.emit("leavePublicAuction", { auctionId: auction.id, publicSlug });
    };
  }, [auction?.id, publicSlug]);

  if (!currentPlayer) return null;

  const player = currentPlayer;
  const next = nextPlayer || {
    name: "TBA",
    category: "-",
    role: "-",
    photo: DEFAULT_PHOTO,
  };

  return (
    <div className="fixed inset-x-0 bottom-8 z-50 px-4 md:px-12 bg-transparent">
      <div className="relative w-full max-w-6xl mx-auto drop-shadow-2xl">
        {/* ===== Desktop / tablet: chevron ticker bar over the bg asset ===== */}
        <div className="relative hidden aspect-[2.95/1] w-full overflow-hidden md:block">
          <img src="/ticker-bg.png" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />

          <div className="absolute inset-0 flex items-center">
            {/* Pink segment — current player */}
            <div className="flex h-full w-[78%] items-center gap-2 pl-[1.5%] pr-[4%] lg:gap-3 xl:gap-5">
              {/* Brand / Title */}
              <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#e91e63] text-[#e91e63] lg:h-8 lg:w-8">
                  <Radio size={14} className="lg:w-4 lg:h-4" />
                </span>
                <div className="leading-none">
                  <p className="text-xs font-black uppercase tracking-tight text-slate-900 lg:text-base xl:text-lg">
                    <span className="text-[#e91e63]">Live</span> <span>Auction</span>
                  </p>
                  <p className="mt-0.5 hidden text-[6px] font-bold uppercase tracking-[0.15em] text-slate-400 lg:block xl:text-[7px]">
                    Players &bull; Passion &bull; Bigger Dreams
                  </p>
                </div>
              </div>

              <div className="h-6 w-px shrink-0 bg-slate-300/60 lg:h-10" />

              {/* Player Main Info */}
              <div className="flex min-w-0 shrink-0 items-center gap-2 lg:gap-3">
                <img
                  src={player.photo}
                  alt={player.name}
                  className="h-8 w-8 shrink-0 rounded-xl object-cover object-top ring-2 ring-white lg:h-12 lg:w-12 xl:h-14 xl:w-14"
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-900 lg:text-lg xl:text-xl">{player.name}</p>
                  <div className="mt-0.5 hidden items-center gap-1 sm:flex">
                    <span className="rounded-full bg-[#e91e63]/10 px-1.5 py-0.5 text-[7px] font-bold text-[#e91e63] lg:px-2 lg:text-[9px]">
                      {player.category}
                    </span>
                    <span className="rounded-full bg-[#00c853]/10 px-1.5 py-0.5 text-[7px] font-bold text-[#00c853] lg:px-2 lg:text-[9px]">
                      {player.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* Player Stats (Base Price, Current Bid) - TIME LEFT REMOVED */}
              <div className="ml-auto flex shrink-0 items-center gap-2 lg:gap-4 xl:gap-6">
                <StatBlock label="Base Price" value={`₹ ${formatAmount(player.basePrice)}`} color="text-[#e91e63]" />
                <StatBlock label="Current Bid" value={`₹ ${formatAmount(player.currentBid)}`} color="text-[#00c853]" />
              </div>
            </div>

            {/* Green segment — next player */}
            <div className="flex h-full w-[22%] items-center justify-between pl-[5%] pr-[2%]">
              <div className="min-w-0 flex-1">
                <p className="text-[7px] font-black uppercase tracking-[0.12em] text-emerald-700 lg:text-[8px] xl:text-[9px]">
                  Next Player
                </p>
                <p className="truncate text-xs font-black text-slate-900 lg:text-sm xl:text-base">{next.name}</p>
                <div className="mt-0.5 hidden flex-wrap items-center gap-1 xl:flex">
                  <span className="rounded-full bg-[#e91e63]/10 px-1.5 py-0.5 text-[7px] font-bold text-[#e91e63]">
                    {next.category}
                  </span>
                  <span className="rounded-full bg-[#00c853]/10 px-1.5 py-0.5 text-[7px] font-bold text-[#00c853]">
                    {next.role}
                  </span>
                </div>
              </div>

              <img
                src={next.photo}
                alt={next.name}
                className="h-8 w-8 shrink-0 rounded-xl object-cover object-top ring-2 ring-white lg:h-11 lg:w-11 xl:h-12 xl:w-12"
              />
            </div>
          </div>
        </div>

        {/* ===== Mobile fallback: stacked card ===== */}
        <div className="overflow-hidden rounded-2xl border border-[#e91e63]/20 shadow-sm md:hidden">
          <div className="flex items-center gap-3 bg-gradient-to-br from-[#fde3ee] to-[#fdf2f6] p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[#e91e63] text-[#e91e63]">
              <Radio size={13} />
            </span>
            <img
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

          <div className="flex items-center gap-2.5 border-t border-emerald-100 bg-gradient-to-br from-[#e3f7ec] to-[#f4fbf7] p-2.5">
            <img
              src={next.photo}
              alt={next.name}
              className="h-8 w-8 shrink-0 rounded-lg object-cover object-top ring-2 ring-white"
            />
            <div className="min-w-0">
              <p className="text-[7px] font-black uppercase tracking-[0.15em] text-emerald-700">Next Player</p>
              <p className="truncate text-xs font-black text-slate-900">{next.name}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
