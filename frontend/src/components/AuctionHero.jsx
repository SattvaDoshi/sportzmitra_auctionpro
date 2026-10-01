import { Link } from "react-router-dom";
import { useState } from "react";
import { Eye, Gavel, Radio, Swords, BarChart3, Target, Star } from "lucide-react";
import { getImageUrl } from "../utils/imageUrl";

const money = (v) => Number(v || 0).toLocaleString("en-IN");
const pick = (obj, keys) => {
  for (const k of keys) if (obj?.[k] !== undefined && obj?.[k] !== null && obj?.[k] !== "") return obj[k];
  return "-";
};

/* ---------- small visual helpers ---------- */
function PlayerPhoto({ url, name }) {
  const photo = getImageUrl(url);
  const [failed, setFailed] = useState(false);
  const mask = "linear-gradient(to bottom, #000 60%, transparent 100%)";
  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={name || "Player"}
        draggable="false"
        onError={() => setFailed(true)}
        className="h-full w-auto max-w-full object-contain object-bottom"
        style={{ WebkitMaskImage: mask, maskImage: mask, filter: "drop-shadow(0 18px 30px rgba(0,0,0,.35))" }}
      />
    );
  }
  return (
    <div className="flex h-full items-center justify-center">
      <span className="aa-display text-8xl text-[#EC008C]/40">{String(name || "P").charAt(0).toUpperCase()}</span>
    </div>
  );
}

/* Rich text player info */
function PlayerInfoBox({ htmlContent, className = "" }) {
  if (!htmlContent) return null;
  return (
    <div className={`w-full rounded-xl border border-white/15 bg-black/35 p-4 text-white backdrop-blur-md ${className}`}>
      <div 
        className="rich-text-content max-w-none"
        dangerouslySetInnerHTML={{ __html: htmlContent }} 
      />
    </div>
  );
}

/* ---------- main export ---------- */
export default function AuctionHero({ auction, state, viewerCount = 0, publicSlug }) {
  const basePrice = Number(state?.base_price || 0);
  const currentBid = Number(state?.current_bid || basePrice || 0);
  const hasPlayer = !!state?.player_name;
  const jersey = state?.jersey_number ?? state?.player_number;
  const role = state?.player_role || state?.batting_style || "";

  const playerInfoHtml = state?.player_info;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');
        .aa-display { font-family: 'Anton', 'Archivo Black', ui-sans-serif, system-ui, sans-serif; }
        
        .rich-text-content {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
        }
        .rich-text-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.5rem 0;
        }
        .rich-text-content th, .rich-text-content td {
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 8px 12px;
          text-align: center;
        }
        .rich-text-content th {
          background-color: rgba(255, 255, 255, 0.1);
          font-weight: 700;
        }
        .rich-text-content ul, .rich-text-content ol {
          text-align: left;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
          list-style: disc;
        }
        .rich-text-content h1, .rich-text-content h2, .rich-text-content h3 {
          font-weight: bold;
          margin: 0.5rem 0;
        }
      `}</style>

      {/* ============ HEADER ============ */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {auction?.auction_logo_url ? (
            <img src={auction.auction_logo_url} alt="Auction logo" className="h-12 w-auto object-contain sm:h-14" />
          ) : (
            <Gavel className="mt-1 h-9 w-9 shrink-0 -rotate-45 text-[#EC008C] sm:h-11 sm:w-11" />
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-black italic uppercase leading-none tracking-tight text-[#EC008C] sm:text-4xl">
              {auction?.auction_name || "Auction"}
            </h1>
            <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500 sm:text-xs">
              Real-time team rosters • Player bids • Category • Analytics
            </p>
          </div>
        </div>

        <p
          className="hidden -rotate-2 select-none text-base italic leading-tight text-[#EC008C] lg:block"
          style={{ fontFamily: "'Brush Script MT', cursive" }}
        >
          Players<br />Passion<br />Bigger Dreams
        </p>

        <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
          <span className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-md sm:px-4 sm:text-xs">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <Eye size={14} className="text-emerald-500" />
            {viewerCount} LIVE VIEWERS
          </span>
          <Link
            to={`/live/${publicSlug}`}
            className="flex items-center gap-2 rounded-full bg-[#EC008C] px-4 py-2 text-[11px] font-black italic uppercase text-white shadow-md shadow-[#EC008C]/30 transition hover:bg-[#d4007e] active:scale-95 sm:text-xs"
          >
            <Radio size={15} /> Live Arena
          </Link>
        </div>
      </header>

      {/* ============ HERO: player + current bid ============
          Mobile order:  name -> photo -> current bid -> 4 stat chips
          Tablet:        photo (full width), then name/stats | bid
          Laptop:        name/stats | photo | bid                         */}
      <section className="mt-4 grid items-end gap-4 md:grid-cols-2 lg:mt-2 lg:grid-cols-[1fr_minmax(280px,380px)_minmax(300px,1fr)] lg:gap-2">
        {/* Photo */}
        <div className="order-2 flex h-[240px] items-end justify-center sm:h-[320px] md:order-first md:col-span-2 lg:order-none lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:h-[420px]">
          <PlayerPhoto url={state?.photo_url} name={state?.player_name} />
        </div>

        {/* Name + role (+ chips on tablet and up) */}
        <div className="order-1 flex flex-col items-center text-center md:order-none md:items-start md:text-left lg:col-start-1 lg:row-start-1 lg:self-center">
          <span className="rounded-full bg-[#EC008C] px-5 py-1.5 text-xs font-bold text-white shadow-md shadow-[#EC008C]/30 sm:text-sm">
            Current Player
          </span>
          <h2 className="aa-display mt-3 break-words text-[clamp(38px,6vw,68px)] uppercase leading-none text-pink [text-shadow:0_4px_24px_rgba(0,0,0,.4)]">
            {hasPlayer ? state.player_name : "Waiting for player..."}
            {jersey ? <span>{jersey}</span> : null}
          </h2>
          <div className="mt-2 flex items-center gap-2">
            {role && <span className="text-sm font-extrabold uppercase text-black sm:text-base">{role}</span>}
            {state?.category && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#EC008C] text-xs font-black text-white">
                {state.category}
              </span>
            )}
          </div>

          {/* Tablet / laptop player info (hidden on mobile) */}
          <PlayerInfoBox htmlContent={playerInfoHtml} className="mt-4 hidden md:block" />
        </div>

        {/* Bid panel */}
        <div className="order-3 rounded-2xl border border-white/10 bg-[#2b0d29]/90 p-5 text-white shadow-2xl backdrop-blur-md sm:p-6 md:order-none lg:col-start-3 lg:row-start-1 lg:mb-4 lg:self-center">
          <div className="flex items-center gap-2 text-xs font-bold sm:text-sm">
            <Gavel size={16} className="-rotate-45" /> CURRENT BID
          </div>
          <div className="aa-display mt-1 text-[clamp(52px,8vw,84px)] leading-none text-[#ff1f9f] [text-shadow:0_0_28px_rgba(236,0,140,.45)]">
            ₹{money(currentBid)}
          </div>
          {state?.highest_team_name && (
            <div className="mt-2 flex flex-col">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Highest Bidder</div>
              <div className="text-sm font-extrabold text-[#8DC63F] uppercase">{state.highest_team_name}</div>
            </div>
          )}
          <div className="mt-3 border-t border-white/15 pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Base Price</div>
            <div className="aa-display text-2xl">₹{money(basePrice)}</div>
          </div>
          {/* <Link
            to={`/live/${publicSlug}`}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#EC008C] py-3 text-sm font-black uppercase tracking-wide shadow-lg shadow-[#EC008C]/40 transition hover:bg-[#d4007e] active:scale-[.98]"
          > */}
            {/* <Gavel size={18} className="-rotate-45" /> Place Bid */}
          {/* </Link> */}
        </div>

        {/* Mobile-only info: below the bid panel */}
        <PlayerInfoBox htmlContent={playerInfoHtml} className="order-4 md:hidden" />
      </section>
    </>
  );
}