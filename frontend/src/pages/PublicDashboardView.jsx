import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Search,
  Trophy,
  Clock,
  XCircle,
  Shield,
  UserCheck,
  UserMinus,
  X,
} from "lucide-react";
import api from "../api/api";
import { getImageUrl } from "../utils/imageUrl";
import TeamOverviewCard from "../components/TeamOverviewCard";
import AuctionHero from "../components/AuctionHero";
import TeamLogo from "../components/ui/TeamLogo";
import socket from "../utils/socket";

/* Plain number, no currency symbol */
function money(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

/* Age can come under different field names depending on the endpoint */
function getAge(p) {
  const a = p?.age ?? p?.player_age;
  return a === undefined || a === null || a === "" ? "-" : a;
}

export default function PublicDashboardView() {
  const { publicSlug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [activeTab, setActiveTab] = useState("teams");
  const [category, setCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("NAME_ASC");

  // Team players modal + enlarged photo viewer
  const [viewingTeam, setViewingTeam] = useState(null);
  const [previewPlayer, setPreviewPlayer] = useState(null);

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
      if (auctionIdRef.current) {
        socket.emit("joinPublicAuction", { auctionId: auctionIdRef.current });
      }
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

  function sortRows(rows = []) {
    return [...rows].sort((a, b) => {
      if (sortBy === "NAME_ASC") {
        return String(a.player_name || "").localeCompare(String(b.player_name || ""), undefined, { sensitivity: "base" });
      } else if (sortBy === "NAME_DESC") {
        return String(b.player_name || "").localeCompare(String(a.player_name || ""), undefined, { sensitivity: "base" });
      } else if (sortBy === "POINTS_DESC") {
        return Number(b.sold_price || b.base_price || 0) - Number(a.sold_price || a.base_price || 0);
      } else if (sortBy === "POINTS_ASC") {
        return Number(a.sold_price || a.base_price || 0) - Number(b.sold_price || b.base_price || 0);
      }
      return 0;
    });
  }

  // All teams are shown together on one page (no pagination)
  const filteredTeams = useMemo(() => {
    const rawTeams = data?.teamsSummary || data?.teams || [];
    const q = search.trim().toLowerCase();
    if (!q) return rawTeams;
    return rawTeams.filter((t) =>
      (t.team_name || t.name || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-center font-sans">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-rose-600 shadow-lg">
          <p className="font-bold">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 font-sans text-slate-600">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#8DC63F] border-t-transparent" />
          <span className="text-xs font-bold uppercase tracking-wider">Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  const { auction, dashboardSummary = {} } = data;

  // Same short labels on mobile, tablet and laptop
  const tabDefs = [
    { key: "teams", label: "Teams", Icon: Shield, count: null },
    { key: "sold", label: "Sold", Icon: UserCheck, count: data.soldPlayers?.length || 0 },
    { key: "unsold", label: "Unsold", Icon: UserMinus, count: data.unsoldPlayers?.length || 0 },
    { key: "pending", label: "Pending", Icon: Clock, count: data.pendingPlayers?.length || 0 },
  ];

  const showPlayerFilters = activeTab !== "teams" && activeTab !== "category";

  return (
    <div
      className="min-h-screen bg-slate-100/70 bg-cover bg-fixed bg-center p-2.5 font-sans text-slate-800 selection:bg-[#EC008C] selection:text-white sm:p-5 lg:p-6"
      style={{ backgroundImage: "url('/publicDashboard.png')" }}
    >
      <div className="mx-auto max-w-7xl">
        <AuctionHero
          auction={auction}
          state={data.state}
          dashboardSummary={dashboardSummary}
          viewerCount={viewerCount}
          publicSlug={publicSlug}
        />

        {/* Main Dashboard Container */}
        <section className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm sm:mt-5 sm:p-4">
          {/* Navigation Bar & Controls */}
          <div className="mb-3 flex flex-col items-stretch justify-between gap-2.5 border-b border-slate-100 pb-3 sm:mb-5 sm:gap-4 sm:pb-4 lg:flex-row lg:items-center">
            {/* Tabs: identical labels on every screen size */}
            <div className="grid w-full grid-cols-4 gap-1 sm:flex sm:w-auto sm:items-center sm:gap-1.5">
              {tabDefs.map(({ key, label, Icon, count }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-1 py-2 text-[11px] font-black tracking-tight transition sm:px-4 sm:py-2.5 sm:text-sm ${
                    activeTab === key
                      ? "bg-[#EC008C] text-white shadow-md shadow-[#EC008C]/20"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  <Icon size={14} className="hidden shrink-0 sm:block" />
                  <span>{label}</span>
                  {count !== null && <span className="shrink-0">({count})</span>}
                </button>
              ))}
            </div>

            {/* Controls: 2-column grid on mobile, wrapping row on tablet, single row on laptop */}
            <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-3 lg:w-auto lg:flex-nowrap lg:justify-end">
              {showPlayerFilters && (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-700 outline-none focus:border-[#EC008C] sm:w-auto sm:px-3"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c === "ALL" ? "All Categories" : c}
                    </option>
                  ))}
                </select>
              )}

              {showPlayerFilters && (
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-700 outline-none focus:border-[#EC008C] sm:w-auto sm:px-3"
                >
                  <option value="NAME_ASC">Name (A-Z)</option>
                  <option value="NAME_DESC">Name (Z-A)</option>
                  <option value="POINTS_DESC">Points (High to Low)</option>
                  <option value="POINTS_ASC">Points (Low to High)</option>
                </select>
              )}

              <div className="relative col-span-2 min-w-0 sm:col-span-1 sm:w-60 sm:flex-none">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={activeTab === "teams" ? "Search team..." : "Search player..."}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold text-slate-700 placeholder-slate-400 outline-none focus:border-[#EC008C] focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Active Tab View */}
          {activeTab === "teams" && (
            <TeamsGrid
              rows={filteredTeams}
              auction={data.auction}
              soldPlayers={data.soldPlayers || []}
              onViewTeam={setViewingTeam}
            />
          )}
          {activeTab === "sold" && (
            <PlayerList rows={sortRows(filterRows(data.soldPlayers))} type="sold" onPhotoClick={setPreviewPlayer} />
          )}
          {activeTab === "unsold" && (
            <PlayerList rows={sortRows(filterRows(data.unsoldPlayers))} type="unsold" onPhotoClick={setPreviewPlayer} />
          )}
          {activeTab === "pending" && (
            <PlayerList
              rows={sortRows(filterRows(data.pendingPlayers))}
              type="pending"
              onPhotoClick={setPreviewPlayer}
            />
          )}
          {activeTab === "category" && <CategorySummary rows={data.categorySummary || []} />}
        </section>

        {/* Footer */}
        <footer className="mt-4 flex flex-col items-center justify-between gap-2 border-t border-white/40 pt-3 text-[10px] font-black uppercase tracking-wider text-slate-700 sm:mt-6 sm:flex-row sm:pt-4 sm:text-xs">
          <p className="text-center">
            {auction?.auction_name || "Auction"} <span className="mx-1.5 text-slate-400">|</span> Players
            <span className="mx-1.5 text-slate-400">&bull;</span> Passion
            <span className="mx-1.5 text-slate-400">&bull;</span> Bigger Dreams
          </p>
          <p className="flex items-center gap-2">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ background: "radial-gradient(circle at 35% 30%, #e2745a, #7c1d10)" }}
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
          onPhotoClick={setPreviewPlayer}
        />
      )}

      {previewPlayer && <PhotoLightbox player={previewPlayer} onClose={() => setPreviewPlayer(null)} />}
    </div>
  );
}

/* Responsive grid for Teams: 1 col mobile/tablet, 2 cols on laptop and up.
   Every team is rendered on the same page. */
function TeamsGrid({ rows = [], auction, soldPlayers = [], onViewTeam }) {
  if (!rows.length) return <Empty text="No teams found matching search criteria" />;

  return (
    <div className="grid grid-cols-1 gap-2 sm:gap-4 lg:grid-cols-2">
      {rows.map((t, idx) => (
        <TeamOverviewCard
          key={t.id}
          team={t}
          auction={auction}
          soldPlayers={soldPlayers}
          accentIndex={idx}
          onViewTeam={onViewTeam}
        />
      ))}
    </div>
  );
}

/* Photo avatar. When a photo exists and onClick is passed, it opens the big view.
   sizes: xs / sm are square, lg is a portrait photo used on the player cards. */
function SquareAvatar({ name, photoUrl, size = "sm", onClick }) {
  const sizes = {
    xs: "h-8 w-8",
    sm: "h-10 w-10",
    md: "h-14 w-14",
    lg: "h-[72px] w-[60px] sm:h-20 sm:w-16",
  };
  const cls = sizes[size] || sizes.sm;
  const radius = size === "lg" ? "rounded-lg" : "rounded-md";
  const photo = getImageUrl(photoUrl);
  const [failed, setFailed] = useState(false);

  if (photo && !failed) {
    const img = (
      <img
        src={photo}
        alt={name || "Player"}
        draggable="false"
        className={`${cls} shrink-0 ${radius} border border-slate-200 object-cover object-top ${
          onClick ? "cursor-zoom-in transition hover:ring-2 hover:ring-[#EC008C]/60" : ""
        }`}
        onError={() => setFailed(true)}
      />
    );
    return onClick ? (
      <button
        type="button"
        onClick={onClick}
        aria-label={`View ${name || "player"} photo`}
        className={`shrink-0 ${radius} focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C]`}
      >
        {img}
      </button>
    ) : (
      img
    );
  }
  return (
    <div
      className={`${cls} flex shrink-0 items-center justify-center ${radius} border border-slate-200 bg-slate-200 font-black text-slate-500 ${
        size === "lg" ? "text-3xl" : ""
      }`}
    >
      {String(name || "P").charAt(0).toUpperCase()}
    </div>
  );
}

/* Full-screen big view of a player's photo */
function PhotoLightbox({ player, onClose }) {
  const photo = getImageUrl(player.photo_url);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 sm:right-6 sm:top-6"
      >
        <X size={22} />
      </button>

      <div className="flex max-h-full w-full max-w-md flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {photo && !failed ? (
          <img
            src={photo}
            alt={player.player_name || "Player"}
            draggable="false"
            onError={() => setFailed(true)}
            className="max-h-[75vh] w-full rounded-2xl border border-white/20 bg-white/5 object-contain shadow-2xl"
          />
        ) : (
          <div className="flex h-64 w-64 max-w-full items-center justify-center rounded-2xl bg-slate-700 text-7xl font-black text-white/70">
            {String(player.player_name || "P").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="text-center text-white">
          <div className="break-words text-lg font-black uppercase tracking-tight sm:text-xl">
            {player.serial_number ? `${player.serial_number} - ` : ""}{player.player_name}
          </div>
          <div className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-white/70">
            {[player.player_role, player.category].filter(Boolean).join(" • ")}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Sold / Unsold / Pending: photo on the left, player properties on the right.
   Grid: 1 col on mobile, 2 on tablet, 3 on small laptop, 4 on laptop and up. */
function PlayerList({ rows = [], type, onPhotoClick }) {
  if (!rows.length) return <Empty text="No player data matching criteria" />;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((p) => (
        <PlayerCard key={p.id} p={p} type={type} onPhotoClick={onPhotoClick} />
      ))}
    </div>
  );
}

/* Compact card: photo on the left, all properties on the right.
   Same card size as before - only the photo is a little bigger. */
function PlayerCard({ p, type, onPhotoClick }) {
  const isSold = type === "sold";
  const isPending = type === "pending";
  const age = getAge(p);
  const labelCls = "text-[8px] font-black uppercase tracking-wider text-slate-400 sm:text-[9px]";

  // Rows shown on the right (first row is highlighted)
  const rows = [
    isSold
      ? { label: "Final Points", value: money(p.sold_price), highlight: true }
      : { label: "Base Points", value: money(p.base_price), highlight: true },
  ];
  if (isSold) rows.push({ label: "Acquired By", value: p.sold_team_name || "-" });
  else if (isPending || age !== "-") rows.push({ label: "Age", value: age });

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition hover:border-[#8DC63F] sm:p-2.5">
      {/* Photo (left) */}
      <SquareAvatar
        name={p.player_name}
        photoUrl={p.photo_url}
        size="lg"
        onClick={onPhotoClick ? () => onPhotoClick(p) : undefined}
      />

      {/* Properties (right) */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="truncate text-[13px] font-bold leading-tight text-slate-900 sm:text-sm">
          {p.serial_number ? `${p.serial_number} - ` : ""}{p.player_name}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[9px] font-semibold uppercase text-slate-500 sm:text-[10px]">
          <span className="truncate">{p.player_role || "N/A"}</span>
          <span className="h-1 w-1 shrink-0 rounded-full bg-slate-300" />
          <span className="truncate">{p.category || "N/A"}</span>
        </div>

        <div className="mt-1.5 grid gap-1 border-t border-slate-100 pt-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-2">
              <span className={labelCls}>{r.label}</span>
              <span
                className={`min-w-0 truncate text-right font-black ${
                  r.highlight ? "text-sm text-[#629221]" : "text-[11px] text-slate-800"
                }`}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategorySummary({ rows = [] }) {
  if (!rows.length) return <Empty text="No category data recorded" />;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((c) => (
        <div key={c.category || "none"} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <span className="text-sm font-black uppercase tracking-wider text-[#629221]">
              {c.category || "General"}
            </span>
            <Trophy className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
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

function TeamPlayersModal({ team, players, onClose, onPhotoClick }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 font-sans backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 sm:h-12 sm:w-12">
              {team.logo_url ? (
                <TeamLogo team={team} size="sm" />
              ) : (
                <Shield className="text-slate-400" size={20} />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-black uppercase italic tracking-tight text-slate-900 sm:text-lg">
                {team.team_name || team.name}
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {players.length} Players Sold
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <XCircle size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-3 sm:p-4">
          {players.length === 0 ? (
            <div className="py-10 text-center font-medium text-slate-500">
              No players sold to this team yet.
            </div>
          ) : (
            <div className="grid gap-2 sm:gap-3">
              {players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:border-[#8DC63F] sm:p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <SquareAvatar
                      name={p.player_name}
                      photoUrl={p.photo_url}
                      size="sm"
                      onClick={onPhotoClick ? () => onPhotoClick(p) : undefined}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-900">
                        {p.serial_number ? `${p.serial_number} - ` : ""}{p.player_name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold uppercase text-slate-500">
                        <span>{p.player_role || "N/A"}</span>
                        <span className="h-1 w-1 rounded-full bg-slate-300"></span>
                        <span>{p.category || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Points</div>
                    <div className="text-sm font-black text-[#629221]">{money(p.sold_price)}</div>
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