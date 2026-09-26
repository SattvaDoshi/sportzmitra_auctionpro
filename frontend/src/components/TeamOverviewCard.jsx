import { Shield, Users, Coins, Wallet, Gavel, Eye } from "lucide-react";
import TeamLogo from "../components/ui/TeamLogo";

/**
 * TeamOverviewCard.jsx
 *
 * Single source of truth for the "team overview" card design (logo, owner,
 * purse/spent/balance, max bid/squad/slots left, budget utilization bar).
 * Used by PublicDashboardView (grid + pagination) and PublicLiveView
 * (horizontal carousel) so both pages render the exact same card layout.
 *
 * `variant`:
 *  - "light" (default): plain white card, colored border only — used on the
 *    public dashboard.
 *  - "tinted": each card's background is tinted with its own accent color
 *    (pink / green / navy / orange / blue / purple), matching the original
 *    Auction Arena live-view mockup. Pass `palette` to control the colors
 *    (defaults to LIVE_TEAM_ACCENTS below).
 */

// Two-tone palette used by the (white) dashboard cards.
export const TEAM_CARD_ACCENTS = [
  { ring: "border-[#EC008C]/25", text: "text-[#EC008C]", bar: "bg-[#EC008C]", barTrack: "bg-[#EC008C]/15" },
  { ring: "border-[#8DC63F]/30", text: "text-[#629221]", bar: "bg-[#8DC63F]", barTrack: "bg-[#8DC63F]/15" },
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

function money(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

/**
 * Normalizes team metrics across the slightly different field names used by
 * the dashboard endpoint (total_purse/used_amount/max_bid_allowed) and the
 * live-view endpoint (remaining_purse/remaining_budget), so this card works
 * unmodified with data from either page.
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

  return { totalPurse, spent, balance, maxBid, ownerName, squadSize, slotsLeft, usedPct };
}

export default function TeamOverviewCard({
  team,
  auction,
  soldPlayers = [],
  accentIndex = 0,
  onViewTeam,
  variant = "light",
  palette,
  className = "",
}) {
  const isTinted = variant === "tinted";
  const activePalette = palette || (isTinted ? LIVE_TEAM_ACCENTS : TEAM_CARD_ACCENTS);
  const accent = activePalette[accentIndex % activePalette.length];
  const { totalPurse, spent, balance, maxBid, ownerName, squadSize, slotsLeft, usedPct } = computeTeamMetrics(
    team,
    auction,
    soldPlayers
  );

  const theme = isTinted
    ? {
        card: `border ${accent.ring} ${accent.tint || "bg-white"} shadow-sm hover:shadow-md`,
        headerBorder: "border-black/5",
        name: "text-white",
        owner: "text-white/60",
        statBox: "bg-white/70 border-white/60",
        statLabel: "text-slate-500",
        statValue: "text-slate-900",
        balanceValue: "text-emerald-600",
        slotsValue: "text-blue-600",
        trackBase: "bg-white/60",
        watermark: "opacity-[0.08]",
        viewBtn: "bg-white/90 text-slate-700 hover:bg-white hover:text-slate-900 border border-black/5",
        logoRing: `border-2 ${accent.ring} bg-white`,
      }
    : {
        card: `border ${accent.ring} bg-white shadow-sm hover:shadow-md`,
        headerBorder: "border-slate-100",
        name: "text-slate-900",
        owner: "text-slate-400",
        statBox: "bg-slate-50 border-slate-100",
        statLabel: "text-slate-400",
        statValue: "text-slate-900",
        balanceValue: "text-emerald-600",
        slotsValue: "text-blue-600",
        trackBase: accent.barTrack || "bg-slate-100",
        watermark: "opacity-[0.06]",
        viewBtn: "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 border border-transparent",
        logoRing: `border-2 ${accent.ring} bg-slate-900`,
      };

  return (
    <div className={`group relative overflow-hidden rounded-2xl p-4 transition ${theme.card} ${className}`}>
      {/* Watermark icon */}
      <Shield
        size={110}
        strokeWidth={1}
        className={`pointer-events-none absolute -right-4 -top-2 ${theme.watermark} ${accent.text}`}
      />

      {/* Header: Logo, Name & Owner — full name, no truncation (wraps if
          long). The "View Squad" button gets its own row below so it never
          competes with the name for width. */}
      <div className={`relative border-b pb-3 ${theme.headerBorder}`}>
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-white font-black shadow-md ${theme.logoRing}`}
          >
            {team.logo_url ? (
              <TeamLogo team={team} size="sm" />
            ) : (
              <Shield size={22} className={accent.text} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className={`break-words text-base font-black italic uppercase leading-tight tracking-tight ${theme.name}`}>
              {team.team_name || team.name}
            </h3>
            {ownerName && <p className={`truncate text-xs font-semibold ${theme.owner}`}>{ownerName}</p>}
          </div>
        </div>

        {onViewTeam && (
          <button
            onClick={() => onViewTeam(team)}
            className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider shadow-sm transition hover:scale-[1.02] active:scale-95 ${theme.viewBtn}`}
            title={`View ${team.team_name || team.name || "team"}'s squad`}
          >
            <Eye size={12} />
            <span>View Squad</span>
          </button>
        )}
      </div>

      {/* Financial Metrics Row */}
      <div className={`relative mt-3 grid grid-cols-3 gap-1.5 rounded-xl border p-2 text-center ${theme.statBox}`}>
        <div>
          <span className={`flex items-center justify-center gap-1 text-[9px] font-black uppercase ${theme.statLabel}`}>
            <Coins size={10} className="text-pink-500" /> PURSE
          </span>
          <span className={`text-xs font-black ${theme.statValue}`}>&#8377;{money(totalPurse)}</span>
        </div>
        <div>
          <span className={`flex items-center justify-center gap-1 text-[9px] font-black uppercase ${theme.statLabel}`}>
            <Coins size={10} className="text-orange-500" /> SPENT
          </span>
          <span className={`text-xs font-black ${theme.statValue}`}>&#8377;{money(spent)}</span>
        </div>
        <div>
          <span className={`flex items-center justify-center gap-1 text-[9px] font-black uppercase ${theme.statLabel}`}>
            <Wallet size={10} className="text-emerald-500" /> BALANCE
          </span>
          <span className={`text-xs font-black ${theme.balanceValue}`}>&#8377;{money(balance)}</span>
        </div>
      </div>

      {/* Squad Metrics Row */}
      <div className={`relative mt-2 grid grid-cols-3 gap-1.5 rounded-xl border p-2 text-center ${theme.statBox}`}>
        <div>
          <span className={`flex items-center justify-center gap-1 text-[9px] font-black uppercase ${theme.statLabel}`}>
            <Gavel size={10} className="text-rose-500" /> MAX BID
          </span>
          <span className={`text-xs font-black ${theme.statValue}`}>&#8377;{money(maxBid)}</span>
        </div>
        <div>
          <span className={`flex items-center justify-center gap-1 text-[9px] font-black uppercase ${theme.statLabel}`}>
            <Users size={10} className="text-purple-500" /> SQUAD
          </span>
          <span className={`text-xs font-black ${theme.statValue}`}>{squadSize}</span>
        </div>
        <div>
          <span className={`flex items-center justify-center gap-1 text-[9px] font-black uppercase ${theme.statLabel}`}>
            <Users size={10} className="text-blue-500" /> SLOTS LEFT
          </span>
          <span className={`text-xs font-black ${theme.slotsValue}`}>{slotsLeft}</span>
        </div>
      </div>

      {/* Budget Utilization */}
      <div className="relative mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className={`text-[9px] font-black uppercase tracking-wider ${theme.statLabel}`}>
            Budget Utilization
          </span>
          <span className={`text-[10px] font-black ${accent.text}`}>{usedPct}% USED</span>
        </div>
        <div className={`h-1.5 w-full overflow-hidden rounded-full ${theme.trackBase}`}>
          <div className={`h-full rounded-full ${accent.bar} transition-all`} style={{ width: `${usedPct}%` }} />
        </div>
      </div>
    </div>
  );
}