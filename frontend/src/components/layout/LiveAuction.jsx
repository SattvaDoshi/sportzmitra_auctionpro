import React, { useState } from "react";
import { Radio, Clock3, X } from "lucide-react";

/* =========================================================
   Helpers
========================================================= */
function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function getYoutubeEmbedUrl(url) {
  if (!url) return null;
  if (url.includes("/embed/")) return url;
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}?autoplay=1`;
  const liveMatch = url.match(/youtube\.com\/live\/([^?&]+)/);
  if (liveMatch) return `https://www.youtube.com/embed/${liveMatch[1]}?autoplay=1`;
  const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}?autoplay=1`;
  return url;
}

const DEFAULT_PHOTO =
  "https://images.unsplash.com/photo-1607627000458-210e8d2bdb1d?w=200&h=200&fit=crop&crop=faces";

/* =========================================================
   LiveAuctionTicker
========================================================= */
export default function LiveAuctionTicker({ currentPlayer, nextPlayer, youtubeUrl }) {
  const [showStream, setShowStream] = useState(false);
  const embedUrl = getYoutubeEmbedUrl(youtubeUrl);

  const player = {
    name: "Rohit Sharma",
    photo: DEFAULT_PHOTO,
    category: "Category A",
    role: "Right Hand Batter",
    basePrice: 200000,
    currentBid: 640000,
    timeLeft: 18,
    ...currentPlayer,
  };
  const next = {
    name: "Virat Kohli",
    photo: DEFAULT_PHOTO,
    category: "Category A",
    role: "Right Hand Batter",
    ...nextPlayer,
  };

  return (
    <>
      <div className="relative w-full">
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

              {/* Player Stats (Base Price, Current Bid, Time Left) */}
              <div className="ml-auto flex shrink-0 items-center gap-2 lg:gap-4 xl:gap-6">
                <StatBlock label="Base Price" value={`₹ ${formatAmount(player.basePrice)}`} color="text-[#e91e63]" />
                <StatBlock label="Current Bid" value={`₹ ${formatAmount(player.currentBid)}`} color="text-[#00c853]" />
                
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold uppercase tracking-wide text-slate-400 lg:text-[9px]">Time Left</span>
                  <span className="flex items-center gap-1 text-xs font-black tabular-nums text-slate-900 lg:text-sm xl:text-base">
                    <Clock3 size={12} className="text-[#e91e63] lg:w-3.5 lg:h-3.5" />
                    {String(Math.floor((player.timeLeft || 0) / 60)).padStart(2, "0")}:
                    {String((player.timeLeft || 0) % 60).padStart(2, "0")}
                  </span>
                </div>
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

          {youtubeUrl && (
            <button
              type="button"
              onClick={() => setShowStream(true)}
              className="absolute top-1/2 hidden -translate-y-1/2 items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-red-600 shadow-md ring-1 ring-black/5 transition hover:bg-white xl:flex"
              style={{ right: "1.5%" }}
            >
              <Radio size={14} />
              Watch Live
            </button>
          )}
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
            {youtubeUrl && (
              <button
                type="button"
                onClick={() => setShowStream(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-red-600 shadow-sm ring-1 ring-black/5"
              >
                <Radio size={14} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 divide-x divide-[#e91e63]/10 border-t border-[#e91e63]/10 bg-white text-center">
            <StatBlockMobile label="Base Price" value={`₹ ${formatAmount(player.basePrice)}`} />
            <StatBlockMobile label="Current Bid" value={`₹ ${formatAmount(player.currentBid)}`} accent />
            <StatBlockMobile
              label="Time Left"
              value={`${String(Math.floor((player.timeLeft || 0) / 60)).padStart(2, "0")}:${String(
                (player.timeLeft || 0) % 60
              ).padStart(2, "0")}`}
            />
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

      {/* ===== YouTube overlay ===== */}
      {showStream && embedUrl && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-black shadow-2xl">
            <button
              type="button"
              onClick={() => setShowStream(false)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
            >
              <X size={16} />
            </button>
            <div className="aspect-video w-full">
              <iframe
                src={embedUrl}
                title="Live auction stream"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

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