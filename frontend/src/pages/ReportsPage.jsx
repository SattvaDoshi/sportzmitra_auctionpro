
import { useMemo, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import AdminLayout from "../components/layout/AdminLayout";
import api from "../api/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import {
  Users,
  UserCheck,
  UserX,
  IndianRupee,
  Download,
  ChevronDown,
  Crown,
  Medal,
  TrendingUp,
  TrendingDown,
  Search,
  BarChart3,
  Trophy,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";

/* ---------------------------------------------------------
   Theme
   --------------------------------------------------------- */

const theme = {
  canvas: "#F8F4F2",
  ink: "#1C1917",
  sub: "#78716C",
  line: "#E8DDD9",

  rose: "#B8265B",
  roseLight: "#F9E8EF",

  amber: "#D97706",
  amberLight: "#FEF3C7",

  emerald: "#059669",
  emeraldLight: "#D1FAE5",

  indigo: "#4F46E5",
  indigoLight: "#EEF2FF",
};




/* ---------------------------------------------------------
   Helpers
   --------------------------------------------------------- */

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

function getTeamName(player) {
  return player?.team_name || null;
}

function getBasePrice(player) {
  return player?.base_price ?? null;
}

const AVATAR_PALETTE = [
  "B8265B",
  "D97706",
  "059669",
  "4F46E5",
  "C2410C",
  "0891B2",
];

function paletteFor(name) {
  const seed = String(name || "P")
    .split("")
    .reduce((sum, ch) => sum + ch.charCodeAt(0), 0);

  return AVATAR_PALETTE[seed % AVATAR_PALETTE.length];
}

/* ---------------------------------------------------------
   Player Avatar
   --------------------------------------------------------- */

function PlayerAvatar({
  player,
  size = 32,
  ring = false,
}) {
  const name = player?.player_name || "Player";

  const dim = `${size}px`;

  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name
  )}&background=${paletteFor(
    name
  )}&color=fff&bold=true&size=128`;

  const imageSource = player?.photo_url || fallback;

  return (
    <img
      src={imageSource}
      alt={name}
      style={{
        width: dim,
        height: dim,
        minWidth: dim,
      }}
      className={`shrink-0 rounded-full object-cover ${
        ring
          ? "ring-2 ring-white shadow-md"
          : "border-2 border-white"
      }`}
      onError={(event) => {
        if (event.currentTarget.src !== fallback) {
          event.currentTarget.src = fallback;
        }
      }}
    />
  );
}

/* ---------------------------------------------------------
   Status Pill
   --------------------------------------------------------- */

function StatusPill({ status }) {
  const isSold = status === "SOLD";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide"
      style={{
        backgroundColor: isSold
          ? theme.emeraldLight
          : "#FEF2F2",
        color: isSold
          ? theme.emerald
          : "#DC2626",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: isSold
            ? theme.emerald
            : "#DC2626",
        }}
      />

      {isSold ? "Sold" : "Unsold"}
    </span>
  );
}

/* ---------------------------------------------------------
   Panel
   --------------------------------------------------------- */

function Panel({
  title,
  action,
  children,
  className = "",
}) {
  return (
    <div
      className={`rounded-2xl border border-[#EDE8E5] bg-white ${className}`}
      style={{
        boxShadow:
          "0 1px 3px rgba(28,25,23,0.06), 0 1px 2px rgba(28,25,23,0.04)",
      }}
    >
      {title && (
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <h3 className="text-[14px] font-semibold tracking-tight text-[#1C1917]">
            {title}
          </h3>

          {action}
        </div>
      )}

      <div className={title ? "p-6 pt-4" : "p-6"}>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Empty State
   --------------------------------------------------------- */

function EmptyState({ children }) {
  return (
    <div className="py-14 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5F0EE]">
        <BarChart3 className="h-5 w-5 text-[#B7ACA4]" />
      </div>

      <p className="mx-auto max-w-sm text-[13px] font-medium leading-relaxed text-[#8A8078]">
        {children}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------
   Stat Card
   --------------------------------------------------------- */

function StatCard({
  label,
  value,
  icon,
  accent,
  accentBg,
  delta,
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-[#EDE8E5] bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D4C9C4]"
      style={{
        boxShadow: "0 1px 3px rgba(28,25,23,0.06)",
      }}
    >
      <div
        className="absolute left-0 right-0 top-0 h-0.5 rounded-t-2xl"
        style={{
          background: `linear-gradient(90deg, ${accent}, ${accent}88)`,
        }}
      />

      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium uppercase tracking-wider text-[#8A8078]">
            {label}
          </p>

          <p className="mt-2 text-[28px] font-bold leading-none tracking-tight text-[#1C1917]">
            {value}
          </p>
        </div>

        <div
          className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: accentBg,
            color: accent,
          }}
        >
          {icon}
        </div>
      </div>

      {delta !== undefined && delta !== null && (
        <div className="mt-3 flex items-center gap-1.5 text-[12px] font-medium">
          {delta >= 0 ? (
            <div className="flex items-center gap-1 text-emerald-600">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>+{Math.abs(delta)}%</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-rose-600">
              <TrendingDown className="h-3.5 w-3.5" />
              <span>-{Math.abs(delta)}%</span>
            </div>
          )}

          <span className="text-[#B7ACA4]">
            vs last auction
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Legend
   --------------------------------------------------------- */

function LegendRow({
  color,
  label,
  count,
  total,
}) {
  const pct = total
    ? Math.round((count / total) * 100)
    : 0;

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-3 w-3 shrink-0 rounded-full"
        style={{
          backgroundColor: color,
        }}
      />

      <div>
        <p className="text-[13px] font-semibold text-[#1C1917]">
          {label}
        </p>

        <p className="text-[12px] text-[#8A8078]">
          {count} players · {pct}%
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Sold Donut
   --------------------------------------------------------- */

function SoldDonut({ sold, unsold }) {
  const total = sold + unsold;

  const pct = total ? sold / total : 0;

  const r = 58;
  const c = 2 * Math.PI * r;
  const soldLen = c * pct;

  return (
    <div className="flex flex-col items-center gap-8 py-2 sm:flex-row sm:justify-center">
      <div className="relative h-44 w-44 shrink-0">
        <svg
          viewBox="0 0 144 144"
          className="h-full w-full -rotate-90"
        >
          <circle
            cx="72"
            cy="72"
            r={r}
            fill="none"
            stroke="#F0E8E4"
            strokeWidth="16"
          />

          {total > 0 && (
            <circle
              cx="72"
              cy="72"
              r={r}
              fill="none"
              stroke={theme.emerald}
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={`${soldLen} ${c - soldLen}`}
              style={{
                filter:
                  "drop-shadow(0 0 6px rgba(5,150,105,0.3))",
              }}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[32px] font-bold leading-none text-[#1C1917]">
            {total ? Math.round(pct * 100) : 0}%
          </span>

          <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[#8A8078]">
            sold
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <LegendRow
          color={theme.emerald}
          label="Sold"
          count={sold}
          total={total}
        />

        <LegendRow
          color="#E8DDD9"
          label="Unsold"
          count={unsold}
          total={total}
        />

        {total > 0 && (
          <div className="mt-1 rounded-xl bg-[#F8F4F2] px-3 py-2">
            <p className="text-[11px] font-medium text-[#8A8078]">
              Total players
            </p>

            <p className="text-[18px] font-bold text-[#1C1917]">
              {total}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Ranking Styles
   --------------------------------------------------------- */

const RANK_STYLES = [
  {
    icon: Crown,
    color: theme.amber,
    bg: theme.amberLight,
    label: "1st",
  },
  {
    icon: Medal,
    color: "#9CA3AF",
    bg: "#F3F4F6",
    label: "2nd",
  },
  {
    icon: Medal,
    color: "#C2793D",
    bg: "#FEF3E8",
    label: "3rd",
  },
];

/* ---------------------------------------------------------
   Leaderboard
   --------------------------------------------------------- */

function Leaderboard({ players }) {
  const top = Math.max(
    ...players.map((p) =>
      Number(p.sold_price || 0)
    ),
    1
  );

  return (
    <div className="space-y-3">
      {players.length > 0 ? (
        players.map((player, index) => {
          const price = Number(
            player.sold_price || 0
          );

          const rank = RANK_STYLES[index];

          const barPct = Math.max(
            (price / top) * 100,
            4
          );

          const RankIcon = rank?.icon;

          return (
            <div
              key={player.id || index}
              className="group flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-[#F8F4F2]"
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                style={
                  rank
                    ? {
                        backgroundColor: rank.bg,
                        color: rank.color,
                      }
                    : {
                        backgroundColor: "#F5F0EE",
                        color: "#8A8078",
                      }
                }
              >
                {RankIcon ? (
                  <RankIcon className="h-3.5 w-3.5" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>

              <PlayerAvatar
                player={player}
                size={36}
                ring
              />

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-semibold text-[#1C1917]">
                    {player.player_name}
                  </p>

                  <p className="shrink-0 text-[13px] font-bold text-[#1C1917]">
                    ₹{formatAmount(price)}
                  </p>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F0E8E4]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${barPct}%`,
                      background:
                        index === 0
                          ? `linear-gradient(90deg, ${theme.amber}, #F59E0B)`
                          : `linear-gradient(90deg, ${theme.rose}, #E05C8A)`,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <EmptyState>
          No players sold yet — results will show up here once
          bidding starts.
        </EmptyState>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Auction Summary
   --------------------------------------------------------- */

function AuctionSummaryTab({
  sold,
  unsold,
  topPlayers,
  avgSalePrice,
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <Panel
          title="Sold vs Unsold"
          className="h-full"
        >
          <SoldDonut
            sold={sold.length}
            unsold={unsold.length}
          />
        </Panel>
      </div>

      <div className="lg:col-span-3">
        <Panel
          title="Top 5 Most Expensive"
          action={
            sold.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg bg-[#F8F4F2] px-2.5 py-1">
                <TrendingUp className="h-3 w-3 text-[#8A8078]" />

                <span className="text-[11px] font-semibold text-[#8A8078]">
                  Avg ₹{formatAmount(avgSalePrice)}
                </span>
              </div>
            )
          }
        >
          <Leaderboard players={topPlayers} />
        </Panel>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Team Performance
   --------------------------------------------------------- */

function TeamPerformanceTab({ sold, teamsData = [], globalPurse = 0 }) {
  const [viewTeam, setViewTeam] = useState(null);

  const downloadTeamPdf = async (team) => {
    try {
      const doc = new jsPDF();
      
      doc.setFontSize(16);
      doc.text(`Team: ${team.name}`, 14, 20);
      doc.setFontSize(11);
      doc.text(`Total Players: ${team.players.length}`, 14, 28);
      doc.text(`Total Spend: Rs. ${formatAmount(team.spend)}`, 14, 34);
      
      const tableData = team.players.map(p => [
        p.player_name, 
        p.category || '-', 
        p.player_role || '-', 
        formatAmount(p.sold_price)
      ]);
      
      autoTable(doc, {
        startY: 42,
        head: [['Player Name', 'Category', 'Role', 'Price (Rs.)']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [184, 38, 91] }, // theme.rose
      });
      
      doc.save(`${team.name.replace(/\s+/g, '_')}_players.pdf`);
    } catch (error) {
      console.error("PDF generation failed", error);
      alert("Failed to generate PDF. Please ensure jspdf libraries are installed.");
    }
  };

  const teams = useMemo(() => {
    const map = new Map();

    sold.forEach((p) => {
      const name = getTeamName(p);

      if (!name) return;

      const entry =
        map.get(name) || {
          name,
          players: [],
          spend: 0,
        };

      entry.players.push(p);

      entry.spend += Number(
        p.sold_price || 0
      );

      map.set(name, entry);
    });

    return [...map.values()].sort(
      (a, b) => b.spend - a.spend
    );
  }, [sold]);

  if (sold.length === 0) {
    return (
      <Panel>
        <EmptyState>
          No players have been sold yet — team spend will show
          up here as bidding closes.
        </EmptyState>
      </Panel>
    );
  }

  if (teams.length === 0) {
    return (
      <Panel>
        <EmptyState>
          Sold players don&apos;t have a team on record yet.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {teams.map((team, teamIndex) => (
        <div
          key={team.name}
          className="rounded-2xl border border-[#EDE8E5] bg-white p-5 transition-all duration-200 hover:border-[#D4C9C4] hover:shadow-md"
          style={{
            boxShadow:
              "0 1px 3px rgba(28,25,23,0.06)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl text-[14px] font-bold text-white shadow-sm"
                style={{
                  background: `linear-gradient(135deg, #${paletteFor(
                    team.name
                  )}, #${paletteFor(team.name)}CC)`,
                }}
              >
                {team.name.charAt(0).toUpperCase()}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-bold text-[#1C1917]">
                    {team.name}
                  </p>

                  {teamIndex === 0 && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                      TOP
                    </span>
                  )}
                </div>

                <p className="text-[12px] text-[#8A8078]">
                  {team.players.length} players · ₹
                  {formatAmount(team.spend)}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => setViewTeam(team)}
                className="rounded-lg bg-[#F8F4F2] px-2.5 py-1.5 text-[11px] font-bold text-[#8A8078] transition-colors hover:bg-[#E8DDD9] hover:text-[#1C1917]"
              >
                Open
              </button>
              <button
                onClick={() => downloadTeamPdf(team)}
                className="rounded-lg bg-[#F8F4F2] px-2.5 py-1.5 text-[11px] font-bold text-[#8A8078] transition-colors hover:bg-[#E8DDD9] hover:text-[#1C1917]"
              >
                Download
              </button>
            </div>
          </div>

          {(() => {
            const matchedTeam = teamsData.find(t => t.team_name === team.name || t.name === team.name);
            let totalPurse = matchedTeam ? Number(matchedTeam.total_purse) : 0;
            if (totalPurse === 0) totalPurse = globalPurse;
            const spendPct = totalPurse > 0 ? Math.min((team.spend / totalPurse) * 100, 100) : 0;
            const remaining = Math.max(totalPurse - team.spend, 0);

            return (
              <div className="mt-4 space-y-1">
                <div className="flex justify-between text-[11px] font-medium text-[#8A8078]">
                  <span>Spend (₹{formatAmount(team.spend)})</span>
                  <span>Remaining (₹{formatAmount(remaining)})</span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-[#F0E8E4]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.max(spendPct, 2)}%`,
                      background: `linear-gradient(90deg, ${theme.rose}, #E05C8A)`,
                    }}
                  />
                </div>
              </div>
            );
          })()}

          <div className="mt-4 flex flex-wrap gap-1.5">
            {team.players
              .slice(0, 8)
              .map((p, i) => (
                <div
                  key={p.id || i}
                  className="flex items-center gap-1.5 rounded-full border border-[#EDE8E5] bg-[#F8F4F2] py-1 pl-1 pr-2.5 transition-colors hover:border-[#D4C9C4]"
                >
                  <PlayerAvatar
                    player={p}
                    size={18}
                  />

                  <span className="text-[11px] font-medium text-[#1C1917]">
                    {p.player_name}
                  </span>
                </div>
              ))}

            {team.players.length > 8 && (
              <span className="self-center rounded-full bg-[#F0E8E4] px-2 py-1 text-[11px] font-semibold text-[#8A8078]">
                +{team.players.length - 8} more
              </span>
            )}
          </div>
        </div>
      ))}
      </div>

      {viewTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 font-sans backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#F0E8E4] p-5">
              <div>
                <h3 className="text-lg font-bold text-[#1C1917]">{viewTeam.name}</h3>
                <p className="text-[12px] font-medium text-[#8A8078]">
                  {viewTeam.players.length} players • ₹{formatAmount(viewTeam.spend)}
                </p>
              </div>
              <button
                onClick={() => setViewTeam(null)}
                className="rounded-full p-2 text-[#8A8078] transition hover:bg-[#F8F4F2] hover:text-[#1C1917]"
              >
                <UserX size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-[#F8F4F2]/50 p-4">
              <div className="grid gap-3">
                {viewTeam.players.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl border border-[#EDE8E5] bg-white p-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <PlayerAvatar player={p} size={32} />
                      <div>
                        <div className="text-[13px] font-bold text-[#1C1917]">{p.player_name}</div>
                        <div className="text-[11px] font-medium text-[#8A8078]">
                          {p.category || "N/A"} • {p.player_role || "N/A"}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase text-[#8A8078]">Sold For</div>
                      <div className="text-[13px] font-bold text-[#059669]">₹{formatAmount(p.sold_price)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------
   Player Results
   --------------------------------------------------------- */

function PlayerResultsTab({ players }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("ALL");

  const filtered = useMemo(() => {
    return players.filter((p) => {
      const matchesStatus =
        statusFilter === "ALL" ||
        p.status === statusFilter;

      const matchesQuery = (
        p.player_name || ""
      )
        .toLowerCase()
        .includes(
          query.trim().toLowerCase()
        );

      return matchesStatus && matchesQuery;
    });
  }, [players, query, statusFilter]);

  return (
    <Panel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B7ACA4]" />

          <input
            value={query}
            onChange={(e) =>
              setQuery(e.target.value)
            }
            placeholder="Search players..."
            className="h-10 w-full rounded-xl border border-[#EDE8E5] bg-[#F8F4F2] pl-9 pr-3 text-[13px] text-[#1C1917] outline-none transition-colors placeholder:text-[#B7ACA4] focus:border-[#B8265B] focus:bg-white"
          />
        </div>

        <div className="flex gap-1 rounded-xl border border-[#EDE8E5] bg-[#F8F4F2] p-1">
          {[
            {
              key: "ALL",
              label: "All",
              count: players.length,
            },
            {
              key: "SOLD",
              label: "Sold",
              count: players.filter(
                (p) => p.status === "SOLD"
              ).length,
            },
            {
              key: "UNSOLD",
              label: "Unsold",
              count: players.filter(
                (p) => p.status === "UNSOLD"
              ).length,
            },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() =>
                setStatusFilter(opt.key)
              }
              type="button"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
                statusFilter === opt.key
                  ? "bg-white text-[#1C1917] shadow-sm"
                  : "text-[#8A8078] hover:bg-white/60 hover:text-[#1C1917]"
              }`}
            >
              {opt.label}

              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  statusFilter === opt.key
                    ? "bg-[#F0E8E4] text-[#8A8078]"
                    : "bg-transparent"
                }`}
              >
                {opt.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        {filtered.length > 0 ? (
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className="border-b border-[#F0E8E4]">
                <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#B7ACA4]">
                  Player
                </th>

                <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#B7ACA4]">
                  Team
                </th>

                <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#B7ACA4]">
                  Status
                </th>

                <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#B7ACA4]">
                  Price
                </th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((p, i) => {
                const team = getTeamName(p);
                const base = getBasePrice(p);

                return (
                  <tr
                    key={p.id || i}
                    className="group border-b border-[#F8F4F2] transition-colors last:border-0 hover:bg-[#FDFAF9]"
                  >
                    <td className="py-3">
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar
                          player={p}
                          size={30}
                        />

                        <span className="text-[13px] font-semibold text-[#1C1917]">
                          {p.player_name}
                        </span>
                      </div>
                    </td>

                    <td className="py-3">
                      {team ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#F8F4F2] px-2 py-1 text-[12px] font-medium text-[#5C534E]">
                          {team}
                        </span>
                      ) : (
                        <span className="text-[13px] text-[#C4B9B4]">
                          —
                        </span>
                      )}
                    </td>

                    <td className="py-3">
                      <StatusPill status={p.status} />
                    </td>

                    <td className="py-3 text-right">
                      <span className="text-[13px] font-bold text-[#1C1917]">
                        {p.status === "SOLD" ? (
                          `₹${formatAmount(
                            p.sold_price
                          )}`
                        ) : base ? (
                          <span className="font-medium text-[#8A8078]">
                            ₹{formatAmount(base)} base
                          </span>
                        ) : (
                          <span className="text-[#C4B9B4]">
                            —
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState>
            No players match your search.
          </EmptyState>
        )}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------
   Sold / Unsold List
   --------------------------------------------------------- */

function SoldUnsoldList({
  players,
  kind,
}) {
  const isSold = kind === "SOLD";

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[#EDE8E5] bg-white"
      style={{
        boxShadow:
          "0 1px 3px rgba(28,25,23,0.06)",
      }}
    >
      <div
        className="flex items-center justify-between border-b border-[#F0E8E4] px-6 py-4"
        style={{
          background: isSold
            ? "linear-gradient(135deg, #F0FDF8, #ECFDF5)"
            : "linear-gradient(135deg, #FFF5F5, #FEF2F2)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              backgroundColor: isSold
                ? theme.emeraldLight
                : "#FEE2E2",
              color: isSold
                ? theme.emerald
                : "#DC2626",
            }}
          >
            {isSold ? (
              <UserCheck className="h-4 w-4" />
            ) : (
              <UserX className="h-4 w-4" />
            )}
          </div>

          <h3 className="text-[14px] font-bold text-[#1C1917]">
            {isSold
              ? "Sold Players"
              : "Unsold Players"}
          </h3>
        </div>

        <span
          className="rounded-full px-3 py-1 text-[12px] font-bold"
          style={{
            backgroundColor: isSold
              ? theme.emeraldLight
              : "#FEE2E2",
            color: isSold
              ? theme.emerald
              : "#DC2626",
          }}
        >
          {players.length}
        </span>
      </div>

      <div className="max-h-[460px] overflow-y-auto divide-y divide-[#F8F4F2]">
        {players.length > 0 ? (
          players.map((p, i) => {
            const team = getTeamName(p);
            const base = getBasePrice(p);

            return (
              <div
                key={p.id || i}
                className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-[#FDFAF9]"
              >
                <PlayerAvatar
                  player={p}
                  size={36}
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#1C1917]">
                    {p.player_name}
                  </p>

                  {team && (
                    <p className="truncate text-[12px] text-[#8A8078]">
                      {team}
                    </p>
                  )}
                </div>

                <p className="shrink-0 text-[13px] font-bold text-[#1C1917]">
                  {isSold
                    ? `₹${formatAmount(
                        p.sold_price
                      )}`
                    : base
                    ? (
                      <span className="font-medium text-[#8A8078]">
                        ₹{formatAmount(base)}
                      </span>
                    )
                    : "—"}
                </p>
              </div>
            );
          })
        ) : (
          <EmptyState>
            {isSold
              ? "No players sold yet."
              : "No unsold players — everyone found a team!"}
          </EmptyState>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Sold / Unsold Tab
   --------------------------------------------------------- */

function SoldUnsoldTab({
  sold,
  unsold,
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <SoldUnsoldList
        players={sold}
        kind="SOLD"
      />

      <SoldUnsoldList
        players={unsold}
        kind="UNSOLD"
      />
    </div>
  );
}

/* ---------------------------------------------------------
   Loading Skeleton
   --------------------------------------------------------- */

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-2xl border border-[#EDE8E5] bg-white"
          />
        ))}
      </div>

      <div className="h-12 rounded-xl border border-[#EDE8E5] bg-white" />

      <div className="h-64 rounded-2xl border border-[#EDE8E5] bg-white" />
    </div>
  );
}

/* ---------------------------------------------------------
   Tabs
   --------------------------------------------------------- */

const TABS = [
  {
    key: "Auction summary",
    icon: BarChart3,
  },
  {
    key: "Team performance",
    icon: Trophy,
  },
  {
    key: "Player results",
    icon: Search,
  },
  {
    key: "Sold / Unsold",
    icon: Sparkles,
  },
];

/* ---------------------------------------------------------
   Main Page
   --------------------------------------------------------- */

function exportToCsv(players, auctionName) {
  const rows = [
    ["Player", "Category", "Role", "Base Price", "Status", "Sold To", "Sold Price"],
    ...players.map((p) => [
      p.player_name,
      p.category || "-",
      p.player_role || "-",
      p.base_price || 0,
      p.status,
      p.sold_team_name || "-",
      p.sold_price || 0,
    ]),
  ];
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${auctionName || "report"}-players.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { auctionId } = useParams();
  const [players, setPlayers] = useState([]);
  const [reportTeams, setReportTeams] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [auctionName, setAuctionName] = useState("Auction Report");
  const [globalPurse, setGlobalPurse] = useState(0);
  const [activeTab, setActiveTab] = useState(TABS[0].key);

  useEffect(() => {
    async function load() {
      try {
        const [reportRes, dashRes] = await Promise.all([
          api.get(`/auctions/${auctionId}/reports`),
          api.get(`/auctions/${auctionId}/dashboard`).catch(() => ({ data: {} })),
        ]);
        setPlayers(reportRes.data.players || []);
        setReportTeams(reportRes.data.teams || []);
        setSummary(reportRes.data.summary || {});
        setAuctionName(dashRes.data?.auction?.auction_name || "Auction Report");
        setGlobalPurse(Number(dashRes.data?.auction?.total_purse_per_team || 0));
      } catch (err) {
        console.error("reports load error", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [auctionId]);

  const sold = useMemo(() => players.filter((p) => p.status === "SOLD"), [players]);
  const unsold = useMemo(() => players.filter((p) => ["UNSOLD", "FINAL_UNSOLD"].includes(p.status)), [players]);

  const totalSaleValue = useMemo(
    () => sold.reduce((sum, p) => sum + Number(p.sold_price || 0), 0),
    [sold]
  );

  const topPlayers = useMemo(
    () => [...sold].sort((a, b) => Number(b.sold_price || 0) - Number(a.sold_price || 0)).slice(0, 5),
    [sold]
  );

  const avgSalePrice = sold.length ? Math.round(totalSaleValue / sold.length) : 0;

  // Enrich players with team_name for TeamPerformanceTab compatibility
  const enrichedPlayers = useMemo(
    () => players.map((p) => ({ ...p, team_name: p.sold_team_name || p.team_name || null })),
    [players]
  );
  const enrichedSold = useMemo(() => enrichedPlayers.filter((p) => p.status === "SOLD"), [enrichedPlayers]);

  return (
    <AdminLayout
      title="Reports"
      subtitle="View and export auction analytics"
      active="Reports"
      auctionId={auctionId}
    >
      <div
        className="font-sans"
        style={{ backgroundColor: theme.canvas }}
      >
        <div className="mx-auto max-w-6xl">

          {/* Header */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-xl"
                  style={{ background: `linear-gradient(135deg, ${theme.rose}, #E05C8A)` }}
                >
                  <BarChart3 className="h-4 w-4 text-white" />
                </div>
                <h1 className="text-[24px] font-bold tracking-tight text-[#1C1917]">
                  Reports — {auctionName}
                </h1>
              </div>
              <p className="ml-10 text-[14px] text-[#8A8078]">
                View and export auction analytics
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#EDE8E5] bg-white px-4 text-[13px] font-semibold text-[#1C1917] transition-all hover:border-[#B8265B]"
                onClick={() => window.print()}
              >
                Print
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${theme.rose}, #C93070)`,
                  boxShadow: `0 2px 8px ${theme.rose}40`,
                }}
                onClick={() => exportToCsv(players, auctionName)}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Total Players"
                  value={summary.total_players ?? players.length}
                  icon={<Users className="h-5 w-5" />}
                  accent={theme.indigo}
                  accentBg={theme.indigoLight}
                />
                <StatCard
                  label="Sold Players"
                  value={summary.sold_players ?? sold.length}
                  icon={<UserCheck className="h-5 w-5" />}
                  accent={theme.emerald}
                  accentBg={theme.emeraldLight}
                />
                <StatCard
                  label="Unsold Players"
                  value={summary.unsold_players ?? unsold.length}
                  icon={<UserX className="h-5 w-5" />}
                  accent={theme.rose}
                  accentBg={theme.roseLight}
                />
                <StatCard
                  label="Total Sale Value"
                  value={`₹${formatAmount(summary.total_sale_value ?? totalSaleValue)}`}
                  icon={<IndianRupee className="h-5 w-5" />}
                  accent={theme.amber}
                  accentBg={theme.amberLight}
                />
              </div>

              {/* Tabs */}
              <div
                className="mt-6 flex w-full gap-1 overflow-x-auto rounded-2xl border border-[#EDE8E5] bg-white p-1.5"
                style={{ boxShadow: "0 1px 3px rgba(28,25,23,0.06)" }}
              >
                {TABS.map((tab) => {
                  const TabIcon = tab.icon;
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all duration-200 ${
                        isActive
                          ? "text-white shadow-sm"
                          : "text-[#8A8078] hover:bg-[#F8F4F2] hover:text-[#1C1917]"
                      }`}
                      style={
                        isActive
                          ? {
                              background: `linear-gradient(135deg, ${theme.rose}, #C93070)`,
                              boxShadow: `0 2px 8px ${theme.rose}30`,
                            }
                          : undefined
                      }
                    >
                      <TabIcon className="h-3.5 w-3.5 shrink-0" />
                      <span className="hidden sm:inline">{tab.key}</span>
                      <span className="sm:hidden">{tab.key.split(" ")[0]}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div className="mt-5">
                {activeTab === "Auction summary" && (
                  <AuctionSummaryTab
                    sold={enrichedSold}
                    unsold={unsold}
                    topPlayers={topPlayers}
                    avgSalePrice={avgSalePrice}
                  />
                )}
                {activeTab === "Team performance" && (
                  <TeamPerformanceTab sold={enrichedSold} teamsData={reportTeams} globalPurse={globalPurse} />
                )}
                {activeTab === "Player results" && (
                  <PlayerResultsTab players={enrichedPlayers} />
                )}
                {activeTab === "Sold / Unsold" && (
                  <SoldUnsoldTab sold={enrichedSold} unsold={unsold} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}