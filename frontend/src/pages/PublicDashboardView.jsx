import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  Search,
  Trophy,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Shield,
  Coins,
  Gavel,
  PieChart,
  UserCheck,
  UserMinus,
} from "lucide-react";
import api from "../api/api";
import PlayerAvatar from "../components/ui/PlayerAvatar";
import TeamLogo from "../components/ui/TeamLogo";
import socket from "../utils/socket";

function money(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

// Alternating brand accents used across team cards (pink / lime), matching
// the two-tone identity used throughout the rest of the dashboard.
const ACCENTS = [
  {
    ring: "border-[#EC008C]/25",
    text: "text-[#EC008C]",
    bar: "bg-[#EC008C]",
    barTrack: "bg-[#EC008C]/15",
    badge: "bg-[#EC008C]",
  },
  {
    ring: "border-[#8DC63F]/30",
    text: "text-[#629221]",
    bar: "bg-[#8DC63F]",
    barTrack: "bg-[#8DC63F]/15",
    badge: "bg-[#8DC63F]",
  },
];

export default function PublicDashboardView() {
  const { publicSlug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [activeTab, setActiveTab] = useState("teams");
  const [category, setCategory] = useState("ALL");
  const [search, setSearch] = useState("");

  // Pagination state for Teams tab
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // State for team players modal
  const [viewingTeam, setViewingTeam] = useState(null);

  const auctionIdRef = useRef(null);
  const debounceRef = useRef(null);

  async function loadInitialSnapshot() {
    try {
      const response = await api.get(`/public/auction/${publicSlug}/dashboard`);
      const snapshot = response.data;
      setData(snapshot);
      setViewerCount(snapshot.viewerCount || 0);
      setError("");

      const aid = snapshot.auction?.id;
      if (aid && aid !== auctionIdRef.current) {
        if (auctionIdRef.current) {
          socket.emit("leavePublicAuction", { auctionId: auctionIdRef.current });
        }
        auctionIdRef.current = aid;
        socket.emit("joinPublicAuction", { auctionId: aid });
      }
    } catch (err) {
      console.error(err);
      setError("Auction dashboard not found or backend is not running.");
    }
  }

  useEffect(() => {
    loadInitialSnapshot();

    function mergePayload(payload) {
      if (!payload) return;
      setData((prev) => {
        if (!prev) return payload;
        return {
          ...prev,
          ...payload,
          teamsSummary: payload.teamsSummary ?? prev.teamsSummary,
          teams: payload.teams ?? prev.teams,
          soldPlayers: payload.soldPlayers ?? prev.soldPlayers,
          unsoldPlayers: payload.unsoldPlayers ?? prev.unsoldPlayers,
          pendingPlayers: payload.pendingPlayers ?? prev.pendingPlayers,
          categorySummary: payload.categorySummary ?? prev.categorySummary,
          dashboardSummary: payload.dashboardSummary ?? prev.dashboardSummary,
          auction: payload.auction ?? prev.auction,
          state: payload.state ?? prev.state,
        };
      });
      if (payload.viewerCount !== undefined) setViewerCount(payload.viewerCount);
    }

    function handleLiveEvent(payload) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => mergePayload(payload), 200);
    }

    const handleViewers = ({ viewerCount: vc }) => setViewerCount(vc || 0);

    function handleReconnect() {
      loadInitialSnapshot();
    }

    const events = [
      "auctionSnapshotUpdated",
      "playerSelected",
      "bidPlaced",
      "bidPreviewUpdated",
      "bidIncrementUpdated",
      "playerSold",
      "playerUnsold",
      "playerFinalUnsold",
    ];

    events.forEach((evt) => socket.on(evt, handleLiveEvent));
    socket.on("viewerCountUpdated", handleViewers);
    socket.on("connect", handleReconnect);

    return () => {
      clearTimeout(debounceRef.current);
      events.forEach((evt) => socket.off(evt, handleLiveEvent));
      socket.off("viewerCountUpdated", handleViewers);
      socket.off("connect", handleReconnect);
    };
  }, [publicSlug]);

  const categories = useMemo(() => {
    const all = [...(data?.categorySummary || [])].map((c) => c.category).filter(Boolean);
    return ["ALL", ...Array.from(new Set(all))];
  }, [data]);

  function filterRows(rows = []) {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const catOk = category === "ALL" || row.category === category;
      const qOk =
        !q ||
        `${row.player_name || ""} ${row.player_role || ""} ${
          row.sold_team_name || ""
        } ${row.team_name || ""}`
          .toLowerCase()
          .includes(q);
      return catOk && qOk;
    });
  }

  const filteredTeams = useMemo(() => {
    const rawTeams = data?.teamsSummary || data?.teams || [];
    const q = search.trim().toLowerCase();
    if (!q) return rawTeams;
    return rawTeams.filter((t) =>
      (t.team_name || t.name || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  const totalPages = Math.ceil(filteredTeams.length / itemsPerPage) || 1;
  const paginatedTeams = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTeams.slice(start, start + itemsPerPage);
  }, [filteredTeams, currentPage]);

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((prev) => prev - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
  };

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-center font-sans">
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-rose-600 shadow-lg max-w-md">
          <p className="font-bold">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600 font-sans">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#8DC63F] border-t-transparent" />
          <span className="font-bold tracking-wider uppercase text-xs">Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  const { auction, dashboardSummary = {} } = data;

  return (
    <div
      className="min-h-screen bg-slate-100/70 font-sans text-slate-800 selection:bg-[#EC008C] selection:text-white bg-cover bg-center bg-fixed p-3 sm:p-5 lg:p-6"
      style={{ backgroundImage: "url('/publicDashboard.png')" }}
    >
      <div className="mx-auto max-w-7xl">
        {/* Header Section */}
        <header className="mb-5 sm:mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="hidden xs:flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-white/70 shadow-sm">
              <Gavel size={22} className="text-[#EC008C]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black italic uppercase leading-tight tracking-tight text-slate-900">
                {auction?.auction_name || <span className="text-[#EC008C]">Auction</span>}
              </h1>
              <p className="mt-0.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
                REAL-TIME TEAM ROSTERS &bull; PLAYER BIDS &bull; CATEGORY &bull; ANALYTICS
              </p>
            </div>
          </div>

          <p
            className="hidden md:block -rotate-2 select-none font-serif text-base italic leading-tight text-[#EC008C]/90"
            style={{ fontFamily: "'Brush Script MT', cursive" }}
          >
            Players
            <br />
            Passion
            <br />
            Bigger Dreams
          </p>

          <div className="flex w-full items-center gap-3 sm:w-auto">
            <span className="flex items-center gap-2 rounded-full bg-white px-3 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-bold text-slate-700 shadow-sm border border-slate-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <Eye size={14} className="text-emerald-500" />
              <span>{viewerCount} LIVE VIEWERS</span>
            </span>

            <Link
              to={`/live/${publicSlug}`}
              className="flex items-center gap-2 rounded-xl bg-[#8DC63F] hover:bg-[#7ab332] px-3.5 sm:px-4 py-2 text-[11px] sm:text-xs font-black italic uppercase text-white shadow-sm transition active:scale-95"
            >
              <ArrowLeft size={16} /> LIVE ARENA
            </Link>
          </div>
        </header>

        {/* Analytics Summary */}
        <section className="mb-5 sm:mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="PLAYERS SOLD"
            value={dashboardSummary.sold_players || 0}
            icon={<CheckCircle className="h-5 w-5 text-emerald-500" />}
            badgeBg="bg-emerald-50"
            borderColor="border-emerald-200"
          />
          <StatCard
            label="PENDING"
            value={dashboardSummary.pending_players || 0}
            icon={<Clock className="h-5 w-5 text-amber-500" />}
            badgeBg="bg-amber-50"
            borderColor="border-amber-200"
          />
          <StatCard
            label="UNSOLD QUEUE"
            value={dashboardSummary.unsold_players || 0}
            icon={<XCircle className="h-5 w-5 text-rose-500" />}
            badgeBg="bg-rose-50"
            borderColor="border-rose-200"
          />
          <StatCard
            label="TOTAL BALANCE"
            value={`\u20B9${money(dashboardSummary.total_balance)}`}
            valueColor="text-emerald-600"
            icon={<Wallet className="h-5 w-5 text-emerald-500" />}
            badgeBg="bg-emerald-50"
            borderColor="border-emerald-200"
          />
          <StatCard
            label="HIGHEST BID"
            value={`\u20B9${money(dashboardSummary.highest_bid)}`}
            icon={<Trophy className="h-5 w-5 text-orange-500" />}
            badgeBg="bg-orange-50"
            borderColor="border-orange-200"
            className="col-span-2 sm:col-span-1"
          />
        </section>

        {/* Main Dashboard Container */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-4 shadow-sm">
          {/* Navigation Bar & Controls */}
          <div className="mb-5 sm:mb-6 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            {/* View Tabs */}
            <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 w-full lg:w-auto">
              {[
                ["teams", "TEAMS OVERVIEW", Shield],
                ["sold", "SOLD PLAYERS", UserCheck],
                ["unsold", "UNSOLD PLAYERS", UserMinus],
                ["pending", "PENDING POOL", Clock]
              ].map(([tab, label, Icon]) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setCurrentPage(1);
                  }}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 sm:px-4 py-2.5 text-[11px] sm:text-xs font-black uppercase tracking-wider transition ${
                    activeTab === tab
                      ? "bg-[#EC008C] text-white shadow-md shadow-[#EC008C]/20"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>

            {/* Controls (Category Selector, Search & Pagination Buttons) */}
            <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
              {activeTab !== "teams" && activeTab !== "category" && (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-[#EC008C]"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c === "ALL" ? "All Categories" : c}
                    </option>
                  ))}
                </select>
              )}

              {/* Search Field */}
              <div className="relative flex-1 sm:flex-none sm:w-60">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search team..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold text-slate-700 placeholder-slate-400 outline-none focus:border-[#EC008C] focus:bg-white"
                />
              </div>

              {/* Pagination controls for Teams tab */}
              {activeTab === "teams" && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={handlePrevPage}
                    disabled={currentPage === 1}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Active Tab View */}
          {activeTab === "teams" && (
            <TeamsGrid
              rows={paginatedTeams}
              auction={data.auction}
              soldPlayers={data.soldPlayers || []}
              onViewTeam={setViewingTeam}
            />
          )}
          {activeTab === "sold" && <PlayerTable rows={filterRows(data.soldPlayers)} type="sold" />}
          {activeTab === "unsold" && <PlayerTable rows={filterRows(data.unsoldPlayers)} type="unsold" />}
          {activeTab === "pending" && <PlayerTable rows={filterRows(data.pendingPlayers)} type="pending" />}
          {activeTab === "category" && <CategorySummary rows={data.categorySummary || []} />}
        </section>

        {/* Footer */}
        <footer className="mt-5 sm:mt-6 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-white/40 pt-4 text-[11px] sm:text-xs font-black uppercase tracking-wider text-slate-700">
          <p>
            {auction?.auction_name || "Auction"} <span className="mx-1.5 text-slate-400">|</span> Players
            <span className="mx-1.5 text-slate-400">&bull;</span> Passion
            <span className="mx-1.5 text-slate-400">&bull;</span> Bigger Dreams
          </p>
          <p className="flex items-center gap-2">
            <span
              className="h-3.5 w-3.5 rounded-full shrink-0"
              style={{
                background: "radial-gradient(circle at 35% 30%, #e2745a, #7c1d10)",
              }}
            />
            More Than A Game
          </p>
        </footer>
      </div>

      {viewingTeam && (
        <TeamPlayersModal
          team={viewingTeam}
          players={(data.soldPlayers || []).filter(
            (p) => String(p.sold_team_id) === String(viewingTeam.id)
          )}
          onClose={() => setViewingTeam(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, valueColor = "text-slate-900", icon, badgeBg, borderColor = "border-slate-200/80", className = "" }) {
  return (
    <div className={`flex items-center justify-between rounded-2xl bg-white p-3 sm:p-4 shadow-sm border ${borderColor} ${className}`}>
      <div className="min-w-0">
        <span className="block text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 truncate">
          {label}
        </span>
        <span className={`text-lg sm:text-2xl font-black ${valueColor}`}>{value}</span>
      </div>
      <div className={`shrink-0 rounded-full p-2 sm:p-2.5 ${badgeBg}`}>{icon}</div>
    </div>
  );
}

/* Responsive grid view for Teams: 1 col mobile, 2 cols tablet, 3 on laptop, 4 on large desktop */
function TeamsGrid({ rows = [], auction, soldPlayers = [], onViewTeam }) {
  if (!rows.length) return <Empty text="No teams found matching search criteria" />;

  const squadLimit = auction?.players_per_team || auction?.max_players_per_team || 12;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {rows.map((t, idx) => {
        // Backend returns: id, team_name, owner_name, logo_url, total_purse, remaining_purse, used_amount
        // plus max_bid_allowed (augmented by route handler)
        const totalPurse = Number(t.total_purse || 0);
        const spent = Number(t.used_amount || 0);
        const balance = Number(t.remaining_purse ?? (totalPurse - spent));
        const maxBid = Number(t.max_bid_allowed ?? t.max_bid ?? balance);
        const ownerName = t.owner_name || "";
        // squad_size: count from soldPlayers or use squad_size if server provides it
        const squadSize = typeof t.squad_size === "number"
          ? t.squad_size
          : soldPlayers.filter((p) => String(p.sold_team_id) === String(t.id)).length;
        const slotsLeft = Math.max(0, squadLimit - squadSize);
        const usedPct = totalPurse > 0 ? Math.min(100, Math.round((spent / totalPurse) * 100)) : 0;
        const accent = ACCENTS[idx % ACCENTS.length];

        return (
          <div
            key={t.id}
            className={`group relative overflow-hidden rounded-2xl border ${accent.ring} bg-white p-4 shadow-sm transition hover:shadow-md`}
          >
            <button
              onClick={() => onViewTeam(t)}
              className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-200 hover:text-slate-900 shadow-sm"
              title="View Sold Players"
            >
              <Users size={12} /> Players
            </button>

            {/* Watermark icon */}
            <Shield
              size={110}
              strokeWidth={1}
              className={`pointer-events-none absolute -right-4 -top-2 opacity-[0.06] ${accent.text}`}
            />

            {/* Header: Logo, Name & Owner */}
            <div className="relative flex items-center gap-3 border-b border-slate-100 pb-3">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 ${accent.ring} bg-slate-900 text-white font-black shadow-md`}
              >
                {t.logo_url ? (
                  <TeamLogo team={t} size="sm" />
                ) : (
                  <Shield size={22} className={accent.text} />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-base font-black italic uppercase tracking-tight text-slate-900">
                  {t.team_name || t.name}
                </h3>
                {ownerName && (
                  <p className="truncate text-xs font-semibold text-slate-400">{ownerName}</p>
                )}
              </div>
            </div>

            {/* Financial Metrics Row */}
            <div className="relative mt-3 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-50 p-2 text-center border border-slate-100">
              <div>
                <span className="flex items-center justify-center gap-1 text-[9px] font-black uppercase text-slate-400">
                  <Coins size={10} className="text-pink-500" /> PURSE
                </span>
                <span className="text-xs font-black text-slate-900">
                  &#8377;{money(totalPurse)}
                </span>
              </div>

              <div>
                <span className="flex items-center justify-center gap-1 text-[9px] font-black uppercase text-slate-400">
                  <Coins size={10} className="text-orange-500" /> SPENT
                </span>
                <span className="text-xs font-black text-slate-900">
                  &#8377;{money(spent)}
                </span>
              </div>

              <div>
                <span className="flex items-center justify-center gap-1 text-[9px] font-black uppercase text-slate-400">
                  <Wallet size={10} className="text-emerald-500" /> BALANCE
                </span>
                <span className="text-xs font-black text-emerald-600">
                  &#8377;{money(balance)}
                </span>
              </div>
            </div>

            {/* Squad Metrics Row */}
            <div className="relative mt-2 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-50 p-2 text-center border border-slate-100">
              <div>
                <span className="flex items-center justify-center gap-1 text-[9px] font-black uppercase text-slate-400">
                  <Gavel size={10} className="text-rose-500" /> MAX BID
                </span>
                <span className="text-xs font-black text-slate-900">
                  &#8377;{money(maxBid)}
                </span>
              </div>

              <div>
                <span className="flex items-center justify-center gap-1 text-[9px] font-black uppercase text-slate-400">
                  <Users size={10} className="text-purple-500" /> SQUAD
                </span>
                <span className="text-xs font-black text-slate-900">{squadSize}</span>
              </div>

              <div>
                <span className="flex items-center justify-center gap-1 text-[9px] font-black uppercase text-slate-400">
                  <Users size={10} className="text-blue-500" /> SLOTS LEFT
                </span>
                <span className="text-xs font-black text-blue-600">{slotsLeft}</span>
              </div>
            </div>

            {/* Budget Utilization */}
            <div className="relative mt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Budget Utilization
                </span>
                <span className={`text-[10px] font-black ${accent.text}`}>{usedPct}% USED</span>
              </div>
              <div className={`h-1.5 w-full overflow-hidden rounded-full ${accent.barTrack}`}>
                <div
                  className={`h-full rounded-full ${accent.bar} transition-all`}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlayerTable({ rows = [], type }) {
  if (!rows.length) return <Empty text="No player data matching criteria" />;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50 font-black uppercase tracking-wider text-slate-500">
          <tr>
            <th className="p-3.5">Player</th>
            <th className="p-3.5">Category</th>
            <th className="p-3.5">Role</th>
            <th className="p-3.5">{type === "sold" ? "Acquired By" : "Base Price"}</th>
            <th className="p-3.5">{type === "sold" ? "Final Price" : "Unsold Attempts"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-700">
          {rows.map((p) => (
            <tr key={p.id} className="transition-colors hover:bg-slate-50">
              <td className="p-3.5">
                <div className="flex items-center gap-3">
                  <PlayerAvatar name={p.player_name} photoUrl={p.photo_url} size="xs" />
                  <span className="font-bold text-slate-900">{p.player_name}</span>
                </div>
              </td>
              <td className="p-3.5 text-slate-500">{p.category || "-"}</td>
              <td className="p-3.5 text-slate-500">{p.player_role || "-"}</td>
              <td className="p-3.5 font-bold text-slate-800">
                {type === "sold" ? p.sold_team_name || "-" : `\u20B9${money(p.base_price)}`}
              </td>
              <td className="p-3.5 font-black text-[#629221]">
                {type === "sold" ? `\u20B9${money(p.sold_price)}` : p.unsold_count || 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategorySummary({ rows = [] }) {
  if (!rows.length) return <Empty text="No category data recorded" />;

  return (
    <div className="grid gap-4 grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((c) => (
        <div key={c.category || "none"} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <span className="text-sm font-black uppercase tracking-wider text-[#629221]">
              {c.category || "General"}
            </span>
            <Trophy className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {/* Backend SP returns: category, total, sold, unsold, pending */}
            <Mini label="Total" value={c.total ?? c.total_players ?? 0} />
            <Mini label="Sold" value={c.sold ?? c.sold_players ?? 0} />
            <Mini label="Unsold" value={c.unsold ?? c.unsold_players ?? 0} />
            <Mini label="Pending" value={c.pending ?? c.pending_players ?? 0} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Mini({ label, value, highlight }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-0.5 text-xs font-extrabold ${highlight ? "text-[#629221]" : "text-slate-800"}`}>
        {value}
      </div>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-xs font-bold text-slate-400">
      {text}
    </div>
  );
}

function TeamPlayersModal({ team, players, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-sans backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
              {team.logo_url ? (
                <TeamLogo team={team} size="sm" />
              ) : (
                <Shield className="text-slate-400" size={20} />
              )}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black uppercase italic tracking-tight text-slate-900">
                {team.team_name || team.name}
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {players.length} Players Sold
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <XCircle size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4">
          {players.length === 0 ? (
            <div className="py-10 text-center font-medium text-slate-500">
              No players sold to this team yet.
            </div>
          ) : (
            <div className="grid gap-3">
              {players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-[#8DC63F]"
                >
                  <div className="flex items-center gap-3">
                    <PlayerAvatar name={p.player_name} photoUrl={p.photo_url} size="sm" />
                    <div>
                      <div className="font-bold text-slate-900">{p.player_name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] font-semibold uppercase text-slate-500">
                        <span>{p.category || "N/A"}</span>
                        <span className="h-1 w-1 rounded-full bg-slate-300"></span>
                        <span>{p.player_role || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Sold For
                    </div>
                    <div className="text-sm font-black text-[#629221]">
                      &#8377;{money(p.sold_price)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}