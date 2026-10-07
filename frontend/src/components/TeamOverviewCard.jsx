// ===================== TeamOverviewCard.jsx =====================
import { Shield, ArrowRight, Gavel, Users } from "lucide-react";
import TeamLogo from "../components/ui/TeamLogo";

/**
 * TeamOverviewCard.jsx
 *
 * Single source of truth for the team overview card, used by
 * PublicDashboardView (grid) and PublicLiveView (carousel).
 *
 * Mobile (<sm):  compact row card (logo, name/owner, squad x/y, chevron) with a
 *                thin strip of PURSE / SPENT / BALANCE / MAX BID, each with a tiny bar.
 * Tablet+ (sm+): full card, header + metric boxes with progress bars (no donut rings).
 *
 * Squad count: "taken / required" (e.g. 3/10). It is derived from the live
 * soldPlayers list (and team.squad_size if the backend sends it), so it keeps
 * increasing as players get sold.
 */

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

  // Players required per team
  const squadLimit =
    Number(
      auction?.players_per_team ??
        auction?.max_players_per_team ??
        t.players_per_team ??
        t.max_players ??
        12
    ) || 12;

  // Players already taken (live): the larger of the sold-list count and backend squad_size
  const soldCount = soldPlayers.filter((p) => String(p.sold_team_id) === String(t.id)).length;
  const backendSize = typeof t.squad_size === "number" ? t.squad_size : 0;
  const squadSize = Math.max(soldCount, backendSize);

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

/* Thin progress bar */
function Bar({ pct = 0, color, className = "" }) {
  return (
    <div
      className={`w-full overflow-hidden rounded-full ${className}`}
      style={{ backgroundColor: `${color}26` }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }}
      />
    </div>
  );
}

/* Tablet+ metric box: label, value, progress bar */
function Metric({ label, value, pct, color, valueClass = "text-slate-900", labelClass }) {
  return (
    <div className="min-w-0 rounded-xl border bg-white p-2.5 shadow-sm" style={{ borderColor: `${color}40` }}>
      <div className={`text-[11px] font-black uppercase tracking-wide ${labelClass}`}>{label}</div>
      <div className={`mt-0.5 break-all text-base font-black leading-tight ${valueClass}`}>{money(value)}</div>
      <Bar pct={pct} color={color} className="mt-2 h-1.5" />
    </div>
  );
}

/* Tablet+ Max Bid panel */
function MaxBid({ value, color, labelClass }) {
  return (
    <div
      className="flex min-w-0 flex-col justify-center rounded-xl border bg-white p-2.5 shadow-sm lg:col-span-3 lg:flex-row lg:items-center lg:justify-between xl:col-span-1 xl:flex-col xl:items-start xl:justify-center"
      style={{ borderColor: `${color}40` }}
    >
      <div className={`flex items-center gap-1 text-[11px] font-black uppercase tracking-wide ${labelClass}`}>
        <Gavel size={13} style={{ color }} className="shrink-0" />
        <span>Max Bid</span>
      </div>
      <div className="break-all text-xl font-black leading-none xl:mt-1 xl:text-2xl" style={{ color }}>
        {money(value)}
      </div>
    </div>
  );
}

/* Mobile mini metric: tiny label, value, tiny bar */
function MiniMetric({ label, value, pct, color, valueClass = "text-slate-900", labelClass }) {
  return (
    <div className="min-w-0">
      <div className={`text-[8px] font-black uppercase tracking-wide ${labelClass}`}>{label}</div>
      <div className={`whitespace-nowrap text-[11px] font-black leading-tight ${valueClass}`}>{money(value)}</div>
      <Bar pct={pct} color={color} className="mt-0.5 h-1" />
    </div>
  );
}

export default function TeamOverviewCard({
  team,
  auction,
  soldPlayers = [],
  accentIndex = 0,
  onViewTeam,
  onDownload, // kept for API compatibility (download button is currently disabled)
  variant = "light",
  palette,
  showMaxBid = true,
  className = "",
}) {
  const isTinted = variant === "tinted";
  const activePalette = palette || (isTinted ? LIVE_TEAM_ACCENTS : TEAM_CARD_ACCENTS);
  const accent = activePalette[accentIndex % activePalette.length];
  const { totalPurse, spent, balance, maxBid, ownerName, usedPct, balancePct, squadSize, squadLimit, squadPct } =
    computeTeamMetrics(team, auction, soldPlayers);

  const theme = isTinted
    ? {
        card: `border ${accent.ring} ${accent.tint || "bg-white"} shadow-sm hover:shadow-md`,
        name: "text-white",
        owner: "text-white/60",
        label: "text-slate-500",
        logoRing: `border-2 ${accent.ring} bg-white`,
        btn: "border-black/5 bg-white/90 text-slate-700 hover:bg-white",
        watermark: "opacity-[0.08]",
      }
    : {
        card: `border ${accent.ring} ${accent.soft || "bg-white"} shadow-sm hover:shadow-md`,
        name: "text-slate-900",
        owner: "text-slate-500",
        label: "text-slate-500",
        logoRing: `border-2 ${accent.ring} bg-slate-900`,
        btn: `${accent.btnBorder || "border-slate-200"} bg-white ${accent.btnText || "text-slate-700"} hover:bg-slate-50`,
        watermark: "opacity-[0.06]",
      };

  const teamName = team.team_name || team.name;
  const squadFull = squadSize >= squadLimit;

  const SquadBadge = ({ compact = false }) => (
    <span
      title={`${squadSize} of ${squadLimit} players taken`}
      className={`flex shrink-0 items-center gap-1 rounded-full border font-black ${
        squadFull
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-700"
      } ${compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"}`}
    >
      <Users size={compact ? 10 : 13} className={squadFull ? "text-emerald-600" : accent.text} />
      {squadSize}/{squadLimit}
    </span>
  );

  return (
    <div className={`group relative overflow-hidden rounded-2xl transition ${theme.card} ${className}`}>
      {/* =============== MOBILE: compact row card =============== */}
      <div className="p-2 sm:hidden">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full font-black text-white ${theme.logoRing}`}
          >
            {team.logo_url ? <TeamLogo team={team} size="sm" /> : <Shield size={16} className={accent.text} />}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className={`truncate text-[13px] font-black italic leading-tight tracking-tight ${theme.name}`}>
              {teamName}
            </h3>
            {ownerName && <p className={`truncate text-[10px] font-medium leading-tight ${theme.owner}`}>{ownerName}</p>}
          </div>

          <SquadBadge compact />

          {onViewTeam && (
            <button
              type="button"
              onClick={() => onViewTeam(team)}
              className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-black transition active:scale-95 ${theme.btn}`}
            >
              <span>Squad</span>
              <ArrowRight size={12} className={isTinted ? "" : accent.text} />
            </button>
          )}
        </div>

        <div className={`mt-2 grid gap-2 ${showMaxBid ? "grid-cols-4" : "grid-cols-3"}`}>
          <MiniMetric label="Purse" value={totalPurse} pct={100} color={COLORS.purse} labelClass={theme.label} />
          <MiniMetric label="Spent" value={spent} pct={usedPct} color={COLORS.spent} labelClass={theme.label} />
          <MiniMetric
            label="Balance"
            value={balance}
            pct={balancePct}
            color={COLORS.balance}
            valueClass="text-emerald-600"
            labelClass={theme.label}
          />
          {showMaxBid && (
            <MiniMetric
              label="Max Bid"
              value={maxBid}
              pct={balancePct}
              color={COLORS.maxBid}
              valueClass="text-[#EC008C]"
              labelClass={theme.label}
            />
          )}
        </div>
      </div>

      {/* =============== TABLET / LAPTOP: full card =============== */}
      <div className="relative hidden p-4 sm:block">
        <Shield
          size={130}
          strokeWidth={1}
          className={`pointer-events-none absolute right-1/4 -top-4 ${theme.watermark} ${accent.text}`}
        />

        <div className="relative flex items-center gap-3">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full font-black text-white shadow-md ${theme.logoRing}`}
          >
            {team.logo_url ? <TeamLogo team={team} size="sm" /> : <Shield size={22} className={accent.text} />}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className={`break-words text-lg font-black italic leading-tight tracking-tight ${theme.name}`}>
              {teamName}
            </h3>
            {ownerName && <p className={`truncate text-sm font-medium ${theme.owner}`}>{ownerName}</p>}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5 lg:flex-row lg:items-center">
            <SquadBadge />
            {onViewTeam && (
              <button
                type="button"
                onClick={() => onViewTeam(team)}
                title={`View ${teamName || "team"}'s squad`}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-black transition active:scale-95 ${theme.btn}`}
              >
                <span>View Squad</span>
                <ArrowRight size={13} className={isTinted ? "" : accent.text} />
              </button>
            )}
          </div>
        </div>

        {/* Squad progress */}
        <div className="relative mt-3 flex items-center gap-2">
          <span className={`text-[10px] font-black uppercase tracking-wide ${theme.label}`}>Squad</span>
          <Bar pct={squadPct} color={squadFull ? COLORS.balance : "#64748b"} className="h-1.5 flex-1" />
          <span className="text-[10px] font-black text-slate-600">
            {squadSize}/{squadLimit}
          </span>
        </div>

        <div
          className={`relative mt-3 grid grid-cols-3 gap-3 ${
            showMaxBid ? "sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4" : ""
          }`}
        >
          <Metric label="Purse" value={totalPurse} pct={100} color={COLORS.purse} labelClass={theme.label} />
          <Metric label="Spent" value={spent} pct={usedPct} color={COLORS.spent} labelClass={theme.label} />
          <Metric
            label="Balance"
            value={balance}
            pct={balancePct}
            color={COLORS.balance}
            valueClass="text-emerald-600"
            labelClass={theme.label}
          />
          {showMaxBid && <MaxBid value={maxBid} color={COLORS.maxBid} labelClass={theme.label} />}
        </div>
      </div>
    </div>
  );
}