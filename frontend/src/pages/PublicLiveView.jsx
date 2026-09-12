import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import { getImageUrl } from "../utils/imageUrl";
import { io } from "socket.io-client";
import { Clock, User, Users, ChevronRight } from "lucide-react";

const socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5000", {
  transports: ["websocket", "polling"],
});

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function dicebearLogo(seed) {
  return `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
}

const TEAM_ACCENTS = [
  { ring: "ring-[#e91e63]/30", text: "text-[#e91e63]", bar: "bg-[#e91e63]" },
  { ring: "ring-[#00c853]/30", text: "text-[#00c853]", bar: "bg-[#00c853]" },
  { ring: "ring-[#0284c7]/30", text: "text-[#0284c7]", bar: "bg-[#0284c7]" },
  { ring: "ring-[#d97706]/30", text: "text-[#d97706]", bar: "bg-[#d97706]" },
  { ring: "ring-[#9333ea]/30", text: "text-[#9333ea]", bar: "bg-[#9333ea]" },
  { ring: "ring-[#0d9488]/30", text: "text-[#0d9488]", bar: "bg-[#0d9488]" },
];

const DEFAULT_TEAMS = [
  { team_name: "STRIKERS", remaining_purse: 875000, starting_purse: 1000000 },
  { team_name: "WARRIORS", remaining_purse: 640000, starting_purse: 1000000 },
  { team_name: "TITANS", remaining_purse: 520000, starting_purse: 1000000 },
  { team_name: "ROYALS", remaining_purse: 410000, starting_purse: 1000000 },
  { team_name: "CHALLENGERS", remaining_purse: 385000, starting_purse: 1000000 },
  { team_name: "SUPER KINGS", remaining_purse: 295000, starting_purse: 1000000 },
];

const DEFAULT_PLAYER_PHOTO =
  "https://images.unsplash.com/photo-1607627000458-210e8d2bdb1d?w=400&h=400&fit=crop&crop=faces";

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
      player_name: state.player_name || "Rohit Sharma",
      category: state.category || "Category A",
      player_role: state.player_role || state.batting_style || "Right Hand Batter",
      base_price: state.base_price || 200000,
      photo_url: state.photo_url,
      player_number: state.player_number || "1023",
      nationality: state.nationality || "India",
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
            teamName: payload?.team_name || payload?.sold_team_name || prev?.highest_team_name || "STRIKERS",
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
      <div className="flex min-h-screen w-full items-center justify-center bg-[#fdf2f6]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#e91e63] border-t-transparent" />
      </div>
    );
  }

  const currentBid = Number(state?.current_bid || currentPlayer?.base_price || 640000);
  const timeLeft = state?.time_left ?? state?.timer_seconds ?? 18;

  const rawTeams = auction?.teams?.length ? auction.teams : DEFAULT_TEAMS;
  const teams = rawTeams.map((t, i) => ({
    ...t,
    accent: TEAM_ACCENTS[i % TEAM_ACCENTS.length],
    resolvedLogo: t.logo_url ? getImageUrl(t.logo_url) : dicebearLogo(t.team_name),
    displayPurse: t.remaining_purse ?? t.remaining_budget ?? 0,
    startingPurse: t.starting_purse ?? t.total_budget ?? 1000000,
  }));

  const recentUpdates = state?.recent_updates || auction?.recent_updates || [
    { time: "10:24 PM", team_name: "WARRIORS", amount: 640000 },
    { time: "10:23 PM", team_name: "STRIKERS", amount: 580000 },
    { time: "10:22 PM", team_name: "TITANS", amount: 520000 },
    { time: "10:21 PM", team_name: "ROYALS", amount: 460000 },
    { time: "10:20 PM", message: "Auction started for Rohit Sharma" },
  ];

  const playerQueue = auction?.player_queue || state?.player_queue || [
    { id: 1, player_name: "Virat Kohli", category: "Category A", role: "Right Hand Batter" },
    { id: 2, player_name: "Jasprit Bumrah", category: "Category A", role: "Right Arm Fast" },
    { id: 3, player_name: "Suryakumar Yadav", category: "Category B", role: "Right Hand Batter" },
    { id: 4, player_name: "Rishabh Pant", category: "Category B", role: "Wicket Keeper" },
  ];

  const playerPhoto = currentPlayer?.photo_url
    ? getImageUrl(currentPlayer.photo_url)
    : DEFAULT_PLAYER_PHOTO;

  return (
    <div className="relative min-h-screen w-full bg-[#fdf2f6] bg-[url('/publicView-bg.png')] bg-cover bg-center bg-no-repeat bg-scroll lg:bg-fixed font-sans text-slate-800 antialiased">
      <CelebrationOverlay celebration={celebration} />

      <div className="relative z-10 mx-auto flex w-full max-w-[1340px] flex-col gap-4 p-3 sm:p-5 md:gap-5 md:p-6 lg:p-8">
        {/* Header */}
        <header className="flex flex-col gap-3 rounded-2xl bg-white/40 p-3.5 backdrop-blur-md border border-white/40 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="text-center sm:text-left">
            <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl md:text-4xl">
              <span className="text-[#e91e63]">LIVE</span>{" "}
              <span className="text-slate-900">AUCTION</span>
            </h1>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.3em] text-slate-400 sm:text-[11px]">
              Players &bull; Passion &bull; Bigger Dreams
            </p>
          </div>

          <div className="flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
              Public View
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 shadow-sm">
              Auction ID <strong className="ml-1 text-slate-700">#{auction?.auction_code || "AUC2025"}</strong>
            </span>
          </div>
        </header>

        {/* Main Grid: Left side details & Right side Team sidebar */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          {/* Left Column (8 cols) */}
          <div className="flex flex-col gap-4 lg:col-span-8 lg:gap-5">
            {/* Current Player Main Card */}
            <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur-md sm:p-6">
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-[#e91e63] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                <User size={12} />
                Current Player
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-center">
                {/* Player Photo Container */}
                <div className="flex justify-center sm:col-span-4 lg:col-span-4">
                  <div className="relative h-44 w-44 overflow-hidden rounded-2xl border-4 border-white bg-gradient-to-t from-pink-100 to-rose-50 shadow-md sm:h-52 sm:w-full max-w-[210px]">
                    <img
                      src={playerPhoto}
                      alt={currentPlayer?.player_name || "Player"}
                      className="h-full w-full object-cover object-top"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = DEFAULT_PLAYER_PHOTO;
                      }}
                    />
                  </div>
                </div>

                {/* Player details & Bid status */}
                <div className="flex flex-col justify-between sm:col-span-8 lg:col-span-8">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 sm:text-3xl lg:text-4xl">
                        {currentPlayer?.player_name || "Rohit Sharma"}
                      </h2>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-pink-100/70 px-2.5 py-0.5 text-[10px] font-bold text-[#e91e63]">
                          {currentPlayer?.category || "Category A"}
                        </span>
                        <span className="rounded-full bg-emerald-100/70 px-2.5 py-0.5 text-[10px] font-bold text-[#00c853]">
                          {currentPlayer?.player_role || "Right Hand Batter"}
                        </span>
                      </div>

                      <div className="mt-4">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Base Price
                        </span>
                        <span className="text-2xl font-black text-[#e91e63] sm:text-3xl">
                          ₹ {formatAmount(currentPlayer?.base_price || 200000)}
                        </span>
                      </div>
                    </div>

                    {/* Current Bid & Timer Box */}
                    <div className="flex flex-col items-start sm:items-end gap-2 rounded-2xl bg-slate-50/80 p-3 sm:bg-transparent sm:p-0">
                      <div>
                        <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400 sm:text-right">
                          Current Bid
                        </span>
                        <span className="text-2xl font-black tracking-tight text-[#00c853] sm:text-3xl lg:text-4xl">
                          ₹ {formatAmount(currentBid)}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-2 rounded-xl bg-emerald-50/70 border border-emerald-100/80 px-3 py-1.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-rose-500 shadow-sm border border-rose-100">
                          <Clock size={16} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[7px] font-black uppercase tracking-wider text-slate-400">Time Left</span>
                          <span className="text-sm font-black tabular-nums text-slate-900">
                            {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:
                            {String(timeLeft % 60).padStart(2, "0")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Additional Metadata footer grid */}
                  <div className="mt-6 grid grid-cols-2 gap-2 border-t border-slate-200/60 pt-3 text-left sm:grid-cols-4">
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400">Player ID</span>
                      <span className="text-xs font-black text-slate-800">
                        #{currentPlayer?.player_number || "1023"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400">Nationality</span>
                      <span className="text-xs font-black text-slate-800">
                        {currentPlayer?.nationality || "India"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400">Category</span>
                      <span className="text-xs font-black text-slate-800">
                        {currentPlayer?.category?.replace("Category ", "") || "A"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400">Role</span>
                      <span className="truncate text-xs font-black text-slate-800 block">
                        {currentPlayer?.player_role || "Right Hand Batter"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Updates & Player Queue split section */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5">
              {/* Recent Updates */}
              <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur-md sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Clock size={14} className="text-slate-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Recent Updates
                  </h3>
                </div>

                <div className="max-h-56 space-y-2.5 overflow-y-auto pr-1">
                  {recentUpdates.map((u, i) => (
                    <div key={i} className="flex items-center justify-between text-xs border-b border-slate-100 pb-2 last:border-b-0">
                      <span className="text-[10px] font-semibold text-slate-400 min-w-[55px]">{u.time || "10:24 PM"}</span>
                      <div className="flex-1 text-right truncate">
                        {u.team_name ? (
                          <span>
                            <strong className="font-black text-slate-900">{u.team_name}</strong>{" "}
                            <span className="text-slate-500">placed a bid of</span>{" "}
                            <strong className="font-bold text-[#00c853]">₹ {formatAmount(u.amount)}</strong>
                          </span>
                        ) : (
                          <span className="text-slate-500">{u.message}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Player Queue */}
              <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur-md sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-slate-400" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Player Queue
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">Next Players</span>
                </div>

                <div className="max-h-56 space-y-2.5 overflow-y-auto pr-1">
                  {playerQueue.map((p, i) => (
                    <div key={p.id || i} className="flex items-center gap-2 text-xs border-b border-slate-100 pb-2 last:border-b-0">
                      <span className="w-4 text-[10px] font-black text-slate-400">{i + 1}</span>
                      <img
                        src={p.photo_url ? getImageUrl(p.photo_url) : DEFAULT_PLAYER_PHOTO}
                        alt={p.player_name}
                        className="h-7 w-7 rounded-full object-cover shrink-0 border border-slate-100"
                      />
                      <span className="min-w-0 flex-1 truncate font-bold text-slate-800">
                        {p.player_name}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="rounded-full bg-pink-50 px-1.5 py-0.5 text-[8px] font-bold text-[#e91e63]">
                          {p.category}
                        </span>
                        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold text-[#00c853]">
                          {p.role || p.player_role}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Teams & Remaining Budget Sidebar (4 cols) */}
          <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur-md sm:p-5 lg:col-span-4">
            <div className="mb-4 flex items-center gap-2">
              <Users size={16} className="text-[#e91e63]" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Teams &amp; Remaining Budget
              </h3>
            </div>

            <div className="space-y-3">
              {teams.map((team, idx) => {
                const pct =
                  team.startingPurse && team.startingPurse > 0
                    ? Math.max(0, Math.min(100, (team.displayPurse / team.startingPurse) * 100))
                    : 100;
                return (
                  <div key={idx} className="group rounded-2xl border border-slate-100 bg-white/90 p-3 shadow-2xs transition-all hover:border-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-50 ring-2 ${team.accent.ring}`}>
                          <img src={team.resolvedLogo} alt={team.team_name} className="h-full w-full object-cover" />
                        </div>
                        <span className="truncate text-xs font-black uppercase tracking-wide text-slate-800">
                          {team.team_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-black tabular-nums ${team.accent.text}`}>
                          ₹ {formatAmount(team.displayPurse)}
                        </span>
                        <ChevronRight size={12} className="text-slate-300" />
                      </div>
                    </div>
                    {/* Remaining Budget Bar */}
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full transition-all duration-300 ${team.accent.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CelebrationOverlay({ celebration }) {
  if (!celebration) return null;
  const isSold = celebration.type === "SOLD";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className={`w-full max-w-sm rounded-3xl border bg-white p-6 text-center shadow-2xl ${isSold ? "border-[#00c853]/30" : "border-[#e91e63]/30"}`}>
        <span className={`inline-block rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${isSold ? "bg-emerald-100 text-[#00c853]" : "bg-pink-100 text-[#e91e63]"}`}>
          {isSold ? "PLAYER ACQUIRED" : "UNSOLD"}
        </span>

        <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-900">
          {celebration.type}
        </h2>

        {isSold && celebration.teamName && (
          <div className="mt-1 text-base font-black uppercase text-slate-600">{celebration.teamName}</div>
        )}

        {isSold && celebration.amount && (
          <div className="mt-3 inline-block rounded-xl bg-slate-50 border border-slate-100 px-5 py-2 text-xl font-black text-[#00c853]">
            ₹ {formatAmount(celebration.amount)}
          </div>
        )}
      </div>
    </div>
  );
}