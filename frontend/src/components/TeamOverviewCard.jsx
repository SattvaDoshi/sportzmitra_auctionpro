import { Shield, ArrowRight, Download, Gavel } from "lucide-react";
import TeamLogo from "../components/ui/TeamLogo";

/**
 * TeamOverviewCard.jsx
 *
 * Single source of truth for the team overview card, used by
 * PublicDashboardView (grid) and PublicLiveView (carousel).
 *
 * Layout: header (logo, name, owner, View Squad, Download) followed by
 * PURSE / SPENT / BALANCE columns (each with a ring and a progress bar)
 * plus a MAX BID panel.
 *
 * `variant`:
 *  - "light" (default): white card with a faint accent tint, colored border.
 *  - "tinted": card background tinted with its accent color (live view).
 *
 * Optional props: `onViewTeam(team)` shows "View Squad",
 * `onDownload(team)` shows the download button,
 * `showMaxBid` (default true) toggles the Max Bid panel.
 */

// Two-tone palette used by the dashboard cards (pink / green alternate).
export const TEAM_CARD_ACCENTS = [
  {
    ring: "border-[#EC008C]/30",
    text: "text-[#EC008C]",
    bar: "bg-[#EC008C]",
    barTrack: "bg-[#EC008C]/15",
    soft: "bg-[#EC008C]/[0.03]",
    btnBorder: "border-[#EC008C]/30",
    btnText: "text-[#EC008C]",
  },
  {
    ring: "border-[#8DC63F]/40",
    text: "text-[#629221]",
    bar: "bg-[#8DC63F]",
    barTrack: "bg-[#8DC63F]/15",
    soft: "bg-[#8DC63F]/[0.04]",
    btnBorder: "border-[#8DC63F]/40",
    btnText: "text-[#629221]",
  },
];

// Six-color rotating palette used by the tinted live-view cards.
export const LIVE_TEAM_ACCENTS = [
  { ring: "border-[#E5007D]/30", text: "text-[#E5007D]", bar: "bg-[#E5007D]", tint: "bg-[#E5007D]/10" },
  { ring: "border-[#00c853]/30", text: "text-[#00a844]", bar: "bg-[#00c853]", tint: "bg-[#00c853]/10" },
  { ring: "border-[#ef4444]/30", text: "text-[#ef4444]", bar: "bg-[#ef4444]", tint: "bg-[#ef4444]/10" },
  { ring: "border-[#d97706]/30", text: "text-[#d97706]", bar: "bg-[#d97706]", tint: "bg-[#d97706]/10" },
  { ring: "border-[#0284c7]/30", text: "text-[#0284c7]", bar: "bg-[#0284c7]", tint: "bg-[#0284c7]/10" },
  { ring: "border-[#9333ea]/30", text: "text-[#9333ea]", bar: "bg-[#9333ea]", tint: "bg-[#9333ea]/10" },
];

const COLORS = {
  purse: "#EC008C",
  spent: "#F59E0B",
  balance: "#22C55E",
  maxBid: "#EC008C",
};

function money(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

/**
 * Normalizes team metrics across the different field names used by the
 * dashboard endpoint and the live-view endpoint.
 */
export function computeTeamMetrics(t, auction, soldPlayers = []) {
  const totalPurse = Number(t.total_purse ?? t.starting_purse ?? t.total_budget ?? 0);
  const explicitBalance = t.remaining_purse ?? t.remaining_budget;
  const spent =
    t.used_amount !== undefined && t.used_amount !== null
      ? Number(t.used_amount)
      : Math.max(0, totalPurse - Number(explicitBalance ?? totalPurse));
  const balance = Number(explicitBalance ?? totalPurse - spent);
  const maxBid = Number(t.max_bid_allowed ?? t.max_bid ?? balance);
  const ownerName = t.owner_name || "";
  const squadLimit = auction?.players_per_team || auction?.max_players_per_team || 12;
  const squadSize =
    typeof t.squad_size === "number"
      ? t.squad_size
      : soldPlayers.filter((p) => String(p.sold_team_id) === String(t.id)).length;
  const slotsLeft = Math.max(0, squadLimit - squadSize);
  const usedPct = totalPurse > 0 ? Math.min(100, Math.round((spent / totalPurse) * 100)) : 0;
  const balancePct = totalPurse > 0 ? Math.max(0, 100 - usedPct) : 0;
  const squadPct = squadLimit > 0 ? Math.min(100, Math.round((squadSize / squadLimit) * 100)) : 0;

  return {
    totalPurse,
    spent,
    balance,
    maxBid,
    ownerName,
    squadSize,
    squadLimit,
    slotsLeft,
    usedPct,
    balancePct,
    squadPct,
  };
}

/* Circular percentage ring */
function Ring({ pct = 0, color }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const safe = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative h-8 w-8 shrink-0 sm:h-11 sm:w-11">
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeOpacity="0.15" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * safe) / 100}
          className="transition-all"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-slate-800 sm:text-[10px]">
        {safe}%
      </span>
    </div>
  );
}

/* One metric column: value + label, ring, and a bar underneath */
function Metric({ label, value, pct, ringPct, color, valueClass = "text-slate-900", labelClass }) {
  return (
    <div
      className="min-w-0 rounded-xl border bg-white p-1.5 shadow-sm sm:p-2.5"
      style={{ borderColor: `${color}40` }}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0">
          <div className={`truncate text-xs font-black sm:text-base ${valueClass}`}>&#8377;{money(value)}</div>
          <div className={`text-[9px] font-black uppercase tracking-wide sm:text-[11px] ${labelClass}`}>{label}</div>
        </div>
        <Ring pct={ringPct} color={color} />
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: `${color}26` }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/* Max Bid panel.
   - mobile (<sm):   full-width strip under the 3 metrics (label left, value right)
   - tablet (sm-lg): 4th column with a left divider
   - laptop (lg-xl): cards are narrow (2 per row), so back to the strip
   - desktop (xl+):  4th column again */
function MaxBid({ value, color, labelClass }) {
  return (
    <div
      className="col-span-3 flex items-center justify-between gap-2 rounded-xl border bg-white p-2 shadow-sm sm:p-2.5
                 sm:col-span-1 sm:flex-col sm:items-start sm:justify-center
                 lg:col-span-3 lg:flex-row lg:items-center lg:justify-between
                 xl:col-span-1 xl:flex-col xl:items-start xl:justify-center"
      style={{ borderColor: `${color}40` }}
    >
      <div className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wide sm:text-[11px] ${labelClass}`}>
        <Gavel size={13} style={{ color }} className="shrink-0" />
        <span>Max Bid</span>
      </div>
      <div className="truncate text-base font-black leading-none sm:text-xl xl:text-2xl" style={{ color }}>
        &#8377;{money(value)}
      </div>
    </div>
  );
}

export default function TeamOverviewCard({
  team,
  auction,
  soldPlayers = [],
  accentIndex = 0,
  onViewTeam,
  onDownload,
  variant = "light",
  palette,
  showMaxBid = true,
  className = "",
}) {
  const isTinted = variant === "tinted";
  const activePalette = palette || (isTinted ? LIVE_TEAM_ACCENTS : TEAM_CARD_ACCENTS);
  const accent = activePalette[accentIndex % activePalette.length];
  const { totalPurse, spent, balance, maxBid, ownerName, usedPct, balancePct, squadPct } = computeTeamMetrics(
    team,
    auction,
    soldPlayers
  );

  const theme = isTinted
    ? {
        card: `border ${accent.ring} ${accent.tint || "bg-white"} shadow-sm hover:shadow-md`,
        name: "text-white",
        owner: "text-white/60",
        label: "text-slate-500",
        logoRing: `border-2 ${accent.ring} bg-white`,
        btn: "border-black/5 bg-white/90 text-slate-700 hover:bg-white",
        iconBtn: "border-black/5 bg-white/90 text-slate-700 hover:bg-white",
        watermark: "opacity-[0.08]",
      }
    : {
        card: `border ${accent.ring} ${accent.soft || "bg-white"} shadow-sm hover:shadow-md`,
        name: "text-slate-900",
        owner: "text-slate-500",
        label: "text-slate-500",
        logoRing: `border-2 ${accent.ring} bg-slate-900`,
        btn: `${accent.btnBorder || "border-slate-200"} bg-white ${accent.btnText || "text-slate-700"} hover:bg-slate-50`,
        iconBtn: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        watermark: "opacity-[0.06]",
      };

  const teamName = team.team_name || team.name;

  return (
    <div className={`group relative overflow-hidden rounded-2xl p-3 transition sm:p-4 ${theme.card} ${className}`}>
      {/* Watermark icon */}
      <Shield
        size={130}
        strokeWidth={1}
        className={`pointer-events-none absolute right-1/4 -top-4 ${theme.watermark} ${accent.text}`}
      />

      {/* Header: logo, name/owner, actions */}
      <div className="relative flex items-center gap-2.5 sm:gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full font-black text-white shadow-md sm:h-14 sm:w-14 ${theme.logoRing}`}
        >
          {team.logo_url ? <TeamLogo team={team} size="sm" /> : <Shield size={22} className={accent.text} />}
        </div>

        <div className="min-w-0 flex-1">
          <h3
            className={`break-words text-sm font-black italic leading-tight tracking-tight sm:text-lg ${theme.name}`}
          >
            {teamName}
          </h3>
          {ownerName && <p className={`truncate text-xs font-medium sm:text-sm ${theme.owner}`}>{ownerName}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {onViewTeam && (
            <button
              type="button"
              onClick={() => onViewTeam(team)}
              title={`View ${teamName || "team"}'s squad`}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-black transition active:scale-95 sm:gap-1.5 sm:px-3 sm:py-2 sm:text-xs ${theme.btn}`}
            >
              <span>View Squad</span>
              <ArrowRight size={13} className={isTinted ? "" : accent.text} />
            </button>
          )}
          {onDownload && (
            <button
              type="button"
              onClick={() => onDownload(team)}
              title={`Download ${teamName || "team"} squad`}
              aria-label="Download squad"
              className={`flex h-7 w-7 items-center justify-center rounded-lg border transition active:scale-95 sm:h-9 sm:w-9 ${theme.iconBtn}`}
            >
              <Download size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Metrics: PURSE / SPENT / BALANCE / MAX BID */}
      <div
        className={`relative mt-3 grid grid-cols-3 gap-1.5 sm:mt-4 sm:gap-3 ${
          showMaxBid ? "sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4" : ""
        }`}
      >
        <Metric
          label="Purse"
          value={totalPurse}
          pct={100}
          ringPct={squadPct}
          color={COLORS.purse}
          labelClass={theme.label}
        />
        <Metric
          label="Spent"
          value={spent}
          pct={usedPct}
          ringPct={usedPct}
          color={COLORS.spent}
          labelClass={theme.label}
        />
        <Metric
          label="Balance"
          value={balance}
          pct={balancePct}
          ringPct={balancePct}
          color={COLORS.balance}
          valueClass="text-emerald-600"
          labelClass={theme.label}
        />
        {showMaxBid && <MaxBid value={maxBid} color={COLORS.maxBid} labelClass={theme.label} />}
      </div>
    </div>
  );
}