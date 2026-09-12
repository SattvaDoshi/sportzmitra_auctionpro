import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Eye, Radio, Search, Trophy, Users, CheckCircle, XCircle, Clock, Wallet } from "lucide-react";
import api from "../api/api";
import PlayerAvatar from "../components/ui/PlayerAvatar";
import TeamLogo from "../components/ui/TeamLogo";
import socket from "../utils/socket";

function money(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

export default function PublicDashboardView() {
  const { publicSlug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [activeTab, setActiveTab] = useState("teams");
  const [category, setCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  // Track the auctionId so we can join/leave the right room
  const auctionIdRef = useRef(null);
  // Debounce timer ref for rapid socket events
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

    /**
     * Merge a socket payload directly into state — NO HTTP refetch.
     * This is the key scaling fix: 1000 viewers no longer each fire
     * an HTTP request on every bid event.
     */
    function mergePayload(payload) {
      if (!payload) return;
      setData((prev) => {
        if (!prev) return payload;
        return {
          ...prev,
          ...payload,
          // Preserve rich lists from the latest payload if provided
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

    /**
     * Debounced handler: if multiple events fire within 200ms (e.g. rapid
     * bid-preview updates) we coalesce them into one state update.
     */
    function handleLiveEvent(payload) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => mergePayload(payload), 200);
    }

    const handleViewers = ({ viewerCount: vc }) => setViewerCount(vc || 0);

    // On socket reconnect, do one full HTTP reload to get fresh consistent data
    function handleReconnect() {
      loadInitialSnapshot();
    }

    const events = [
      "auctionSnapshotUpdated", "playerSelected", "bidPlaced",
      "bidPreviewUpdated", "bidIncrementUpdated", "playerSold",
      "playerUnsold", "playerFinalUnsold",
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicSlug]);


  const categories = useMemo(() => {
    const all = [...(data?.categorySummary || [])].map((c) => c.category).filter(Boolean);
    return ["ALL", ...Array.from(new Set(all))];
  }, [data]);

  function filterRows(rows = []) {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const catOk = category === "ALL" || row.category === category;
      const qOk = !q || `${row.player_name || ""} ${row.player_role || ""} ${row.sold_team_name || ""} ${row.team_name || ""}`.toLowerCase().includes(q);
      return catOk && qOk;
    });
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center font-sans">
        <div className="rounded-2xl border border-red-200 bg-white p-8 text-red-600 shadow-lg max-w-md">
          <p className="font-bold">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600 font-sans">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-3 border-[#8CC63F] border-t-transparent" />
          <span className="font-bold tracking-wider uppercase text-xs">Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  const { auction, dashboardSummary = {} } = data;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-[#8CC63F] selection:text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        
        {/* Header Section */}
        <header className="relative mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#8CC63F]/30 bg-[#8CC63F]/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-[#629221]">
                <Radio className="h-3.5 w-3.5 animate-pulse text-[#E5007D]" /> Live Public Dashboard
              </div>
              <h1 className="mt-2 text-2xl font-black uppercase tracking-tight text-slate-900 sm:text-4xl">
                {auction?.auction_name}
              </h1>
              <p className="mt-1 text-xs font-semibold tracking-wider text-slate-500 sm:text-sm">
                Real-time Team Rosters • Player Bids • Category Analytics
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Badge icon={<Eye className="h-4 w-4 text-[#8CC63F]" />} label={`${viewerCount} Live Viewers`} />
              <Link
                to={`/live/${publicSlug}`}
                className="inline-flex items-center gap-2 rounded-xl bg-[#8CC63F] hover:bg-[#7ab332] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm transition-all active:scale-95"
              >
                <ArrowLeft className="h-4 w-4" /> Live Arena
              </Link>
            </div>
          </div>
        </header>

        {/* Analytics Summary */}
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Players Sold" value={dashboardSummary.sold_players || 0} icon={<CheckCircle className="h-4 w-4 text-[#8CC63F]" />} />
          <Stat label="Pending" value={dashboardSummary.pending_players || 0} icon={<Clock className="h-4 w-4 text-amber-500" />} />
          <Stat label="Unsold Queue" value={dashboardSummary.unsold_players || 0} icon={<XCircle className="h-4 w-4 text-[#E5007D]" />} />
          <Stat label="Total Balance" value={`₹${money(dashboardSummary.total_balance)}`} highlight icon={<Wallet className="h-4 w-4 text-[#8CC63F]" />} />
          <Stat label="Highest Bid" value={`₹${money(dashboardSummary.highest_bid)}`} icon={<Trophy className="h-4 w-4 text-amber-500" />} />
        </section>

        {/* Main Content Area */}
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          
          {/* Navigation Tabs */}
          <div className="no-scrollbar mb-6 flex gap-2 overflow-x-auto border-b border-slate-200 pb-3">
            {[
              ["teams", "Teams Overview"],
              ["sold", "Sold Players"],
              ["unsold", "Unsold Players"],
              ["pending", "Pending Pool"],
              ["category", "Category Stats"],
            ].map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === tab
                    ? "bg-[#8CC63F] text-white shadow-sm"
                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Filter Toolbar (Clean Light Form Fields) */}
          {activeTab !== "teams" && activeTab !== "category" && (
            <div className="mb-6 grid gap-3 sm:grid-cols-[220px_1fr]">
              <div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-900 outline-none transition-all focus:border-[#8CC63F] focus:bg-white focus:ring-1 focus:ring-[#8CC63F]"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c === "ALL" ? "All Categories" : c}</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-4 text-xs font-bold text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-[#8CC63F] focus:bg-white focus:ring-1 focus:ring-[#8CC63F]"
                  placeholder="Search player name, role or team..."
                />
              </div>
            </div>
          )}

          {/* Tab Views */}
          {activeTab === "teams" && <TeamsTable rows={data.teamsSummary || data.teams || []} auction={data.auction} soldPlayers={data.soldPlayers || []} />}
          {activeTab === "sold" && <PlayerTable rows={filterRows(data.soldPlayers)} type="sold" />}
          {activeTab === "unsold" && <PlayerTable rows={filterRows(data.unsoldPlayers)} type="unsold" />}
          {activeTab === "pending" && <PlayerTable rows={filterRows(data.pendingPlayers)} type="pending" />}
          {activeTab === "category" && <CategorySummary rows={data.categorySummary || []} />}
        </section>
      </div>
    </div>
  );
}

function Badge({ icon, label }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-slate-700">
      {icon} {label}
    </div>
  );
}

function Stat({ label, value, highlight, icon }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 transition-all ${
      highlight 
        ? "border-[#8CC63F]/40 bg-[#8CC63F]/10" 
        : "border-slate-200 bg-white"
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
        {icon}
      </div>
      <div className={`mt-2 text-xl font-black tracking-tight sm:text-2xl ${highlight ? "text-[#629221]" : "text-slate-900"}`}>
        {value}
      </div>
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
                {type === "sold" ? (p.sold_team_name || "-") : `₹${money(p.base_price)}`}
              </td>
              <td className="p-3.5 font-black text-[#629221]">
                {type === "sold" ? `₹${money(p.sold_price)}` : (p.unsold_count || 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamsTable({ rows = [], auction, soldPlayers = [] }) {
  if (!rows.length) return <Empty text="No teams available" />;

  const squadLimit = auction?.players_per_team || auction?.max_players_per_team || 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((t) => {
        const purchased = soldPlayers.filter(p => p.sold_team_id === t.id).length;
        const slotsLeft = Math.max(0, squadLimit - purchased);
        const maxBid = t.max_bid_allowed ?? t.remaining_purse;

        return (
          <div key={t.id} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-[#8CC63F] hover:shadow-md">
            <div className="flex items-center gap-3.5">
              <TeamLogo team={t} size="sm" />
              <div>
                <h3 className="text-base font-black uppercase tracking-wide text-slate-900 group-hover:text-[#629221]">
                  {t.team_name}
                </h3>
                <p className="text-xs font-bold text-slate-400">{t.owner_name || "Team Owner"}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <Mini label="Purse" value={`₹${money(t.total_purse)}`} />
              <Mini label="Spent" value={`₹${money(t.used_amount)}`} />
              <Mini label="Balance" value={`₹${money(t.remaining_purse)}`} highlight />
              <Mini label="Max Bid" value={`₹${money(maxBid)}`} />
              <Mini label="Squad Size" value={purchased} />
              <Mini label="Slots Left" value={slotsLeft} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategorySummary({ rows = [] }) {
  if (!rows.length) return <Empty text="No category data recorded" />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((c) => (
        <div key={c.category || "none"} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <span className="text-sm font-black uppercase tracking-wider text-[#629221]">
              {c.category || "General"}
            </span>
            <Trophy className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Mini label="Total" value={c.total_players} />
            <Mini label="Sold" value={c.sold_players} />
            <Mini label="Unsold" value={c.unsold_players} />
            <Mini label="Pending" value={c.pending_players} />
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