// ===================== AuctionHero.jsx =====================
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { Eye, Gavel, Radio } from "lucide-react";
import { getImageUrl } from "../utils/imageUrl";

const money = (v) => Number(v || 0).toLocaleString("en-IN");

/* Team initials used for the small code badge (e.g. "Mumbai Lions" -> "ML") */
function initials(name = "") {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "--";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/* ---------- player_info parsing ----------
   player_info is rich text (HTML). We try to turn it into stat items
   [{ label, value }] so the laptop view can render the stats bar.
   Supported shapes:
     - table:  first row = labels, second row = values
     - list:   <li>match:10</li>  (label:value)
     - lines:  <p>match: 10</p>   (label:value)
   Returns { hasContent, stats }.
   hasContent is false when the HTML has no visible text -> section is hidden. */
function parsePlayerInfo(html) {
  if (!html || typeof window === "undefined") return { hasContent: false, stats: [] };

  const doc = new DOMParser().parseFromString(String(html), "text/html");
  const text = (doc.body.textContent || "").replace(/\u00a0/g, " ").trim();
  if (!text) return { hasContent: false, stats: [] };

  const stats = [];
  const clean = (s) => String(s || "").replace(/\u00a0/g, " ").trim();

  // 1) table: header row + first value row
  const table = doc.querySelector("table");
  if (table) {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length >= 2) {
      const heads = Array.from(rows[0].children).map((c) => clean(c.textContent));
      const vals = Array.from(rows[1].children).map((c) => clean(c.textContent));
      heads.forEach((h, i) => {
        if (h && vals[i]) stats.push({ label: h, value: vals[i] });
      });
    }
  }

  // 2) "label:value" in list items, then in paragraphs
  if (!stats.length) {
    const nodes = doc.querySelectorAll("li").length
      ? Array.from(doc.querySelectorAll("li"))
      : Array.from(doc.querySelectorAll("p"));
    nodes.forEach((n) => {
      const t = clean(n.textContent);
      const idx = t.indexOf(":");
      if (idx > 0) {
        const label = clean(t.slice(0, idx));
        const value = clean(t.slice(idx + 1));
        if (label && value) stats.push({ label, value });
      }
    });
  }

  return { hasContent: true, stats };
}

/* ---------- small visual helpers ---------- */

/* Small square photo used in the compact mobile card */
function MobilePlayerPhoto({ url, name }) {
  const photo = getImageUrl(url);
  const [failed, setFailed] = useState(false);
  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={name || "Player"}
        draggable="false"
        onError={() => setFailed(true)}
        className="h-[88px] w-[76px] shrink-0 rounded-xl border border-white/20 bg-white/5 object-cover object-top"
      />
    );
  }
  return (
    <div className="aa-display flex h-[88px] w-[76px] shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/5 text-4xl text-[#EC008C]/60">
      {String(name || "P").charAt(0).toUpperCase()}
    </div>
  );
}

/* Larger square photo used on the left of the tablet / laptop card */
function DesktopPlayerPhoto({ url, name }) {
  const photo = getImageUrl(url);
  const [failed, setFailed] = useState(false);
  const box =
    "h-[200px] w-[170px] shrink-0 rounded-2xl border border-white/20 bg-white/5 lg:h-[270px] lg:w-[230px]";
  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={name || "Player"}
        draggable="false"
        onError={() => setFailed(true)}
        className={`${box} object-cover object-top`}
      />
    );
  }
  return (
    <div className={`${box} aa-display flex items-center justify-center text-7xl text-[#EC008C]/60`}>
      {String(name || "P").charAt(0).toUpperCase()}
    </div>
  );
}

/* Laptop-only stats bar (label on top, big pink value, vertical dividers).
   Falls back to the raw rich text inside the same panel if the HTML
   could not be split into label/value pairs. */
function StatsBar({ stats = [], html }) {
  const panel =
    "mt-3 w-full overflow-hidden rounded-2xl border border-[#EC008C]/70 bg-[#1a0618]/90 text-white shadow-[0_0_28px_rgba(236,0,140,0.35)] backdrop-blur-md";

  if (stats.length) {
    return (
      <div className={`${panel} overflow-x-auto`}>
        <div className="flex min-w-max items-stretch lg:min-w-0">
          {stats.map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              className={`flex min-w-[110px] flex-1 flex-col items-center justify-center px-3 py-4 text-center ${
                i > 0 ? "border-l border-white/15" : ""
              }`}
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/80">{s.label}</div>
              <div className="aa-display mt-1 text-[clamp(28px,3vw,40px)] leading-none text-[#ff1f9f] [text-shadow:0_0_18px_rgba(236,0,140,.55)]">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`${panel} p-4 sm:p-5`}>
      <div className="rich-text-content max-w-none overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
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
  const roundNo = state?.round_number ?? state?.round_no ?? state?.round;

  // Category is always shown when present (same as the live view),
  // even if it has the same text as the role.
  const category = state?.category ? String(state.category).trim() : "";
  const showCategory = !!category;

  const playerInfoHtml = state?.player_info;

  // Stats: laptop only. Hidden completely when there is no value.
  const { hasContent: hasStats, stats } = useMemo(() => parsePlayerInfo(playerInfoHtml), [playerInfoHtml]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');
        .aa-display { font-family: 'Anton', 'Archivo Black', ui-sans-serif, system-ui, sans-serif; }

        /* ---------- Rich text fallback (used only if stats can't be split into label/value) ---------- */
        .rich-text-content {
          width: 100%;
          text-align: left;
          font-size: 0.9rem;
          line-height: 1.55;
          color: rgba(255, 255, 255, 0.92);
        }
        .rich-text-content > :first-child { margin-top: 0; }
        .rich-text-content > :last-child { margin-bottom: 0; }

        .rich-text-content p { margin: 0.35rem 0; }
        .rich-text-content strong, .rich-text-content b { color: #ff7cc6; font-weight: 800; }
        .rich-text-content a { color: #8DC63F; text-decoration: underline; text-underline-offset: 3px; }

        .rich-text-content h1, .rich-text-content h2, .rich-text-content h3 {
          margin: 0.75rem 0 0.4rem;
          font-weight: 900;
          line-height: 1.15;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          color: #fff;
        }
        .rich-text-content h1 { font-size: 1.25rem; }
        .rich-text-content h2 { font-size: 1.1rem; }
        .rich-text-content h3 { font-size: 0.95rem; color: #ff7cc6; }

        .rich-text-content ul {
          list-style: none;
          margin: 0.4rem 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .rich-text-content ul li {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0;
          padding: 0.35rem 0.8rem;
          border-radius: 9999px;
          border: 1px solid rgba(236, 0, 140, 0.5);
          background: rgba(236, 0, 140, 0.18);
          font-size: 0.8rem;
          font-weight: 700;
          color: #fff;
        }
        .rich-text-content ul li::before {
          content: "";
          width: 6px;
          height: 6px;
          flex-shrink: 0;
          border-radius: 9999px;
          background: #ff1f9f;
          box-shadow: 0 0 8px rgba(255, 31, 159, 0.8);
        }

        .rich-text-content ol {
          margin: 0.4rem 0;
          padding-left: 1.4rem;
          list-style: decimal;
        }
        .rich-text-content ol li { margin: 0.2rem 0; padding-left: 0.25rem; }
        .rich-text-content ol li::marker { color: #ff1f9f; font-weight: 800; }

        .rich-text-content table {
          width: 100%;
          min-width: 280px;
          margin: 0.5rem 0;
          border-collapse: separate;
          border-spacing: 0;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 0.75rem;
        }
        .rich-text-content th, .rich-text-content td {
          padding: 0.5rem 0.75rem;
          text-align: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .rich-text-content th + th, .rich-text-content td + td {
          border-left: 1px solid rgba(255, 255, 255, 0.1);
        }
        .rich-text-content tr:last-child td { border-bottom: 0; }
        .rich-text-content th {
          background: rgba(236, 0, 140, 0.35);
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .rich-text-content tbody tr:nth-child(even) td { background: rgba(255, 255, 255, 0.04); }
      `}</style>

      {/* =====================================================================
          MOBILE (below md): compact header + compact player card
          (stats removed on mobile)
          ===================================================================== */}
      <div className="md:hidden">
        {/* Header */}
        <header>
          <div className="flex items-center justify-between gap-2">
            {auction?.auction_logo_url ? (
              <img src={auction.auction_logo_url} alt="Auction logo" className="h-10 w-auto object-contain" />
            ) : (
              <Gavel className="h-8 w-8 shrink-0 -rotate-45 text-[#EC008C]" />
            )}
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700 shadow-md">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                <Eye size={12} className="text-emerald-500" />
                {viewerCount} LIVE
              </span>
              {/* <Link
                to={`/live/${publicSlug}`}
                className="flex items-center gap-1.5 rounded-full bg-[#EC008C] px-3 py-1.5 text-[10px] font-black italic uppercase text-white shadow-md shadow-[#EC008C]/30 active:scale-95"
              >
                <Radio size={13} /> Live Arena
              </Link> */}
            </div>
          </div>
          <h1 className="mt-3 break-words text-center text-2xl font-black italic uppercase leading-tight tracking-tight text-[#EC008C]">
            {auction?.auction_name || "Auction"}
          </h1>
          <p className="mt-1 text-center text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Real-time team rosters • Player bids • Category • Analytics
          </p>
        </header>

        {/* Compact player card */}
        <section className="mt-3 rounded-2xl border border-white/10 bg-[#2b0d29]/95 p-3 text-white shadow-2xl backdrop-blur-md">
          {/* Row 1: Round / current player + category */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-white/90">
              {roundNo ? (
                <>
                  Round {roundNo} <span className="mx-1 text-white/40">|</span>
                </>
              ) : null}
              <span className={roundNo ? "text-white/70" : ""}>Current Player</span>
            </div>
            {showCategory && (
              <span className="max-w-[45%] truncate rounded-full border border-[#8DC63F]/70 bg-[#8DC63F]/20 px-3 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#b9e36d]">
                {category}
              </span>
            )}
          </div>

          {/* Row 2: photo | name + role */}
          <div className="mt-2.5 flex items-start gap-3">
            <MobilePlayerPhoto url={state?.photo_url} name={state?.player_name} />

            <div className="min-w-0 flex-1 self-center">
              <h2 className="break-words text-base font-black uppercase leading-tight text-white">
                {hasPlayer ? state.player_name : "Waiting for player..."}
                {jersey ? <span className="ml-1.5 text-[#ff1f9f]">{jersey}</span> : null}
              </h2>
              {role && (
                <div className="mt-0.5 text-[11px] font-black uppercase tracking-wide text-[#ff7cc6]">{role}</div>
              )}
            </div>
          </div>

          {/* Row 3: Base | Bid — full width, big amounts */}
          <div className="mt-3 grid grid-cols-[1fr_1.25fr] gap-2">
            <div className="flex flex-col items-center justify-center rounded-xl bg-[#8DC63F] px-2 py-2 text-slate-900 shadow-md">
              <div className="text-[9px] font-black uppercase tracking-widest">Base</div>
              <div className="aa-display whitespace-nowrap text-[22px] leading-tight">₹ {money(basePrice)}</div>
            </div>
            <div className="flex flex-col items-center justify-center rounded-xl bg-[#EC008C] px-2 py-2 text-white shadow-md shadow-[#EC008C]/40">
              <div className="text-[9px] font-black uppercase tracking-widest">Bid</div>
              <div className="aa-display whitespace-nowrap text-[28px] leading-tight">₹ {money(currentBid)}</div>
            </div>
          </div>

          {/* Row 4: highest bid */}
          {state?.highest_team_name && (
            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EC008C]/20 text-[#ff1f9f]">
                  <Gavel size={14} className="-rotate-45" />
                </span>
                <div className="min-w-0 truncate text-[11px] font-semibold text-white/70">
                  Highest Bid:{" "}
                  <span className="font-black text-[#8DC63F]">{state.highest_team_name}</span>
                </div>
              </div>
              <span className="shrink-0 rounded bg-[#EC008C] px-2 py-1 text-[10px] font-black text-white">
                {initials(state.highest_team_name)}
              </span>
            </div>
          )}
        </section>
      </div>

      {/* =====================================================================
          TABLET / LAPTOP (md and up): same theme as mobile, photo on the left
          ===================================================================== */}
      <header className="hidden flex-wrap items-start justify-between gap-3 md:flex">
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
          {/* <Link
            to={`/live/${publicSlug}`}
            className="flex items-center gap-2 rounded-full bg-[#EC008C] px-4 py-2 text-[11px] font-black italic uppercase text-white shadow-md shadow-[#EC008C]/30 transition hover:bg-[#d4007e] active:scale-95 sm:text-xs"
          >
            <Radio size={15} /> Live Arena
          </Link> */}
        </div>
      </header>

      <section className="mt-4 hidden md:block">
        {/* Player card (same dark plum theme as mobile) */}
        <div className="rounded-2xl border border-white/10 bg-[#2b0d29]/95 p-4 text-white shadow-2xl backdrop-blur-md lg:p-5">
          {/* Row 1: Round / current player + category */}
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold uppercase tracking-wide text-white/90 lg:text-sm">
              {roundNo ? (
                <>
                  Round {roundNo} <span className="mx-1.5 text-white/40">|</span>
                </>
              ) : null}
              <span className={roundNo ? "text-white/70" : ""}>Current Player</span>
            </div>
            {showCategory && (
              <span className="max-w-[45%] truncate rounded-full border border-[#8DC63F]/70 bg-[#8DC63F]/20 px-4 py-1 text-xs font-black uppercase tracking-wide text-[#b9e36d]">
                {category}
              </span>
            )}
          </div>

          {/* Row 2: photo (left) | name + role + base/bid + highest bid */}
          <div className="mt-4 flex items-center gap-5 lg:gap-7">
            <DesktopPlayerPhoto url={state?.photo_url} name={state?.player_name} />

            <div className="min-w-0 flex-1">
              <h2 className="aa-display break-words text-[clamp(30px,4vw,56px)] uppercase leading-none text-white">
                {hasPlayer ? state.player_name : "Waiting for player..."}
                {jersey ? <span className="ml-2 text-[#ff1f9f]">{jersey}</span> : null}
              </h2>
              {role && (
                <div className="mt-1.5 text-sm font-black uppercase tracking-wide text-[#ff7cc6] lg:text-base">
                  {role}
                </div>
              )}

              {/* Base | Bid */}
              <div className="mt-4 grid max-w-xl grid-cols-[1fr_1.25fr] gap-3">
                <div className="flex flex-col items-center justify-center rounded-xl bg-[#8DC63F] px-3 py-3 text-slate-900 shadow-md">
                  <div className="text-[10px] font-black uppercase tracking-widest">Base</div>
                  <div className="aa-display whitespace-nowrap text-[clamp(24px,2.6vw,34px)] leading-tight">
                    ₹ {money(basePrice)}
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center rounded-xl bg-[#EC008C] px-3 py-3 text-white shadow-md shadow-[#EC008C]/40">
                  <div className="text-[10px] font-black uppercase tracking-widest">Bid</div>
                  <div className="aa-display whitespace-nowrap text-[clamp(30px,3.4vw,46px)] leading-tight">
                    ₹ {money(currentBid)}
                  </div>
                </div>
              </div>

              {/* Highest bid */}
              {state?.highest_team_name && (
                <div className="mt-3 flex max-w-xl items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EC008C]/20 text-[#ff1f9f]">
                      <Gavel size={16} className="-rotate-45" />
                    </span>
                    <div className="min-w-0 truncate text-xs font-semibold text-white/70 lg:text-sm">
                      Highest Bid:{" "}
                      <span className="font-black text-[#8DC63F]">{state.highest_team_name}</span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-[#EC008C] px-2.5 py-1 text-xs font-black text-white">
                    {initials(state.highest_team_name)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats bar: laptop/tablet only, hidden when there is no value */}
        {hasStats && <StatsBar stats={stats} html={playerInfoHtml} />}
      </section>
    </>
  );
}