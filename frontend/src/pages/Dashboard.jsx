import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../components/layout/AdminLayout";
import {
  UserCheck,
  CircleDollarSign,
  UserX,
  Gavel,
  ArrowUpRight,
  ArrowRight,
  Clock3,
  ChevronRight,
  Trophy,
  Zap,
} from "lucide-react";
import api from "../api/api";

// ── Fallback avatar shown when a player has no photo ─────────────────────────
const AVATAR_FALLBACK =
  "https://images.unsplash.com/photo-1566577739112-5180d4bf9390?auto=format&fit=crop&w=200&q=80";

// ── Format a raw number into ₹X.XXL / ₹X.XXCr ───────────────────────────────
function formatSaleValue(value) {
  const n = Number(value || 0);
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

// ── Time-of-day greeting ──────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Default / loading shapes that keep the render happy before data arrives ──
const DEFAULT_LIVE = { title: "—", sold: 0, total: 0 };
const DEFAULT_STATS = [
  { title: "Active auctions",  value: "—",  change: "", icon: Gavel },
  { title: "Players sold",     value: "—",  change: "", icon: UserCheck },
  { title: "Total sale value", value: "—",  change: "", icon: CircleDollarSign },
  { title: "Unsold players",   value: "—",  change: "", icon: UserX, down: true },
];

export default function Dashboard() {
  const today = new Date();
  const dateString = today.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const displayRole =
    user.role === "SUPER_ADMIN"
      ? "Super Admin"
      : user.role === "AUCTION_ADMIN"
      ? "Auction Admin"
      : "User";

  // ── State ────────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [liveAuction, setLiveAuction] = useState(DEFAULT_LIVE);
  const [liveAuctionId, setLiveAuctionId] = useState(null);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [upcomingAuctions, setUpcomingAuctions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [recentPlayers, setRecentPlayers] = useState([]);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      try {
        const { data } = await api.get("/auctions/admin-dashboard-summary");
        if (cancelled) return;

        // Hero — live auction
        if (data.liveAuction) {
          setLiveAuction({
            title: data.liveAuction.title,
            sold:  data.liveAuction.sold,
            total: data.liveAuction.total,
          });
          setLiveAuctionId(data.liveAuction.id);
        }

        // Stat strip
        const s = data.stats || {};
        setStats([
          {
            title:  "Active auctions",
            value:  String(s.activeAuctions ?? 0).padStart(2, "0"),
            change: "",
            icon:   Gavel,
          },
          {
            title:  "Players sold",
            value:  String(s.playersSold ?? 0),
            change: "",
            icon:   UserCheck,
          },
          {
            title:  "Total sale value",
            value:  formatSaleValue(s.totalSaleValue),
            change: "",
            icon:   CircleDollarSign,
          },
          {
            title:  "Unsold players",
            value:  String(s.unsoldPlayers ?? 0),
            change: "",
            icon:   UserX,
            down:   true,
          },
        ]);

        // Upcoming auctions
        setUpcomingAuctions(data.upcomingAuctions || []);

        // Teams leaderboard
        setTeams(data.teams || []);

        // Recently sold
        setRecentPlayers(
          (data.recentPlayers || []).map((p) => ({
            ...p,
            image: p.photoUrl || AVATAR_FALLBACK,
          }))
        );
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        // On error keep defaults — dashboard stays visible, just with "—" values
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDashboard();
    return () => { cancelled = true; };
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const progress =
    liveAuction.total > 0
      ? Math.round((liveAuction.sold / liveAuction.total) * 100)
      : 0;

  const liveControlPath = liveAuctionId
    ? `/admin/auctions/${liveAuctionId}/live-control`
    : "#";

  const hasLive = !!liveAuctionId;

  return (
    <AdminLayout active="Dashboard" liveSummary={liveAuction}>
      {/* =========================================================
          HERO — scoreboard treatment: one big number, one image.
      ========================================================== */}
      <section className="relative mb-6 overflow-hidden rounded-[28px] bg-[#03251b]">
        <img
          src="https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=1600&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-[0.16]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#03251b] via-[#03251b]/97 to-[#03251b]/60" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#ec008c]/15 blur-3xl" />

        <div className="relative grid gap-8 px-6 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1.3fr_1fr] lg:items-center lg:px-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ec008c]" />
              <span className="text-[11px] font-semibold text-emerald-100/50">
                {dateString}
                {hasLive ? ` · ${liveAuction.title} is live` : " · No live auction"}
              </span>
            </div>

            <h1 className="font-display mt-3 max-w-lg text-[32px] font-bold leading-[1.1] tracking-tight text-white sm:text-[38px]">
              {getGreeting()}, {displayRole}.
            </h1>
            <p className="mt-3 max-w-md text-[14px] leading-6 text-emerald-100/50">
              {hasLive
                ? "One auction is running right now — here's where the bids, the purses and the players stand."
                : "No auction is running right now. Set up your next auction to get started."}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to={liveControlPath}
                className={`group flex items-center gap-2 rounded-xl bg-[#ec008c] px-5 py-3 text-[13px] font-bold text-white transition hover:bg-[#d9007e] ${!hasLive ? "pointer-events-none opacity-50" : ""}`}
              >
                <Zap size={15} />
                Open Live Control
                <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/select-organization"
                className="rounded-xl border border-white/15 px-5 py-3 text-[13px] font-semibold text-white/80 transition hover:bg-white/[0.06] hover:text-white"
              >
                View schedule
              </Link>
            </div>
          </div>

          {/* Live score block */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <div className="flex items-baseline justify-between">
              <span className="tabular font-display text-5xl font-bold text-white">
                {loading ? "—" : liveAuction.sold}
              </span>
              <span className="tabular text-lg font-medium text-emerald-100/35">
                / {loading ? "—" : liveAuction.total}
              </span>
            </div>
            <p className="mt-1 text-[11px] font-semibold text-emerald-100/40">
              players sold so far
            </p>

            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8dc63f] to-[#ec008c] transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-4 flex items-center justify-between text-[11px] font-medium text-emerald-100/40">
              <span className="flex items-center gap-1.5">
                <Clock3 size={12} />
                {hasLive ? "Auction in progress" : "Not started"}
              </span>
              <span>{progress}% complete</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          STAT STRIP — one panel, divided, instead of four
          separate cards.
      ========================================================== */}
      <section className="mb-6 grid grid-cols-2 divide-y divide-black/[0.06] rounded-[24px] border border-black/[0.06] bg-white sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.title} className="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <Icon size={18} className="text-[#03251b]/70" strokeWidth={2.25} />
                {stat.change && (
                  <span
                    className={`text-[11px] font-bold ${
                      stat.down ? "text-rose-500" : "text-emerald-600"
                    }`}
                  >
                    {stat.change}
                  </span>
                )}
              </div>
              <p className="font-display tabular mt-4 text-[26px] font-bold tracking-tight text-[#0f1d17]">
                {loading ? (
                  <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-slate-100" />
                ) : (
                  stat.value
                )}
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-slate-400">{stat.title}</p>
            </div>
          );
        })}
      </section>

      {/* =========================================================
          UPCOMING AUCTIONS
      ========================================================== */}
      <section className="mb-6 rounded-[24px] border border-black/[0.06] bg-white p-6 sm:p-7">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[17px] font-bold text-[#0f1d17]">Upcoming auctions</h3>
          <Link
            to="/select-organization"
            className="flex items-center gap-1 text-[12px] font-semibold text-[#ec008c] hover:underline"
          >
            View all
            <ArrowRight size={13} />
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {loading ? (
            // Skeleton cards while loading
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-black/[0.06] p-4">
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
                  <div className="h-4 w-14 animate-pulse rounded-md bg-slate-100" />
                </div>
                <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            ))
          ) : upcomingAuctions.length === 0 ? (
            <p className="col-span-3 py-4 text-center text-[13px] font-medium text-slate-400">
              No upcoming auctions scheduled.
            </p>
          ) : (
            upcomingAuctions.map((auction) => (
              <div
                key={auction.id ?? auction.title}
                className="group rounded-2xl border border-black/[0.06] p-4 transition hover:border-[#03251b]/15"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#03251b] text-[10px] font-bold text-white">
                    {auction.short}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      auction.status === "Ready"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {auction.status}
                  </span>
                </div>
                <p className="mt-3 truncate text-[13px] font-bold text-[#0f1d17]">{auction.title}</p>
                <p className="mt-1 text-[11px] font-medium text-slate-400">
                  {auction.date ? `${auction.date} · ${auction.time}` : "Date TBD"}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* =========================================================
          LOWER GRID
      ========================================================== */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Team purse leaderboard */}
        <div className="rounded-[24px] border border-black/[0.06] bg-white p-6 sm:p-7 xl:col-span-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[17px] font-bold text-[#0f1d17]">Team purse</h3>
            <Trophy size={18} className="text-[#8dc63f]" />
          </div>

          <div className="mt-6 space-y-5">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-7 w-7 animate-pulse rounded-lg bg-slate-100" />
                      <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                    </div>
                    <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                  </div>
                  <div className="mt-2 ml-10 h-1.5 w-full animate-pulse rounded-full bg-slate-100" />
                </div>
              ))
            ) : teams.length === 0 ? (
              <p className="py-4 text-center text-[13px] font-medium text-slate-400">
                {hasLive ? "No teams registered yet." : "Select a live auction to see teams."}
              </p>
            ) : (
              teams.map((team) => (
                <div key={team.rank}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold ${
                          team.rank === 1 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {String(team.rank).padStart(2, "0")}
                      </span>
                      <span className="text-[13px] font-bold text-[#0f1d17]">{team.name}</span>
                    </div>
                    <span className="tabular text-[12px] font-bold text-[#0f1d17]">{team.purse}</span>
                  </div>
                  <div className="mt-2 ml-10 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#03251b] transition-all duration-700"
                      style={{ width: `${team.percent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recently sold */}
        <div className="rounded-[24px] border border-black/[0.06] bg-white p-6 sm:p-7 xl:col-span-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[17px] font-bold text-[#0f1d17]">Recently sold</h3>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold text-emerald-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Live
            </span>
          </div>

          <div className="mt-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`flex items-center gap-3 py-3 ${i !== 3 ? "border-b border-black/[0.05]" : ""}`}>
                  <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
                  </div>
                  <div className="space-y-1.5 text-right">
                    <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-12 animate-pulse rounded bg-slate-100" />
                  </div>
                </div>
              ))
            ) : recentPlayers.length === 0 ? (
              <p className="py-6 text-center text-[13px] font-medium text-slate-400">
                {hasLive ? "No players sold yet." : "Start an auction to see sold players."}
              </p>
            ) : (
              recentPlayers.map((player, index) => (
                <div
                  key={player.id ?? player.name}
                  className={`group flex items-center gap-3 py-3 ${
                    index !== recentPlayers.length - 1 ? "border-b border-black/[0.05]" : ""
                  }`}
                >
                  <img
                    src={player.image}
                    alt={player.name}
                    className="h-10 w-10 rounded-full object-cover"
                    onError={(e) => { e.currentTarget.src = AVATAR_FALLBACK; }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-[#0f1d17]">{player.name}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-400">{player.team}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-[12px] font-bold text-[#0f1d17]">{player.amount}</p>
                    <p className="mt-0.5 text-[10px] font-medium text-slate-400">{player.time}</p>
                  </div>
                  <ChevronRight
                    size={14}
                    className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#ec008c]"
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Brand card */}
        <div className="relative min-h-[260px] overflow-hidden rounded-[24px] bg-[#03251b] p-7 xl:col-span-3">
          <img
            src="https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=800&q=80"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-[0.14]"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#03251b] via-[#03251b]/85 to-[#ec008c]/15" />

          <div className="relative flex h-full flex-col justify-between">
            <ArrowUpRight size={20} className="text-[#8dc63f]" />
            <div>
              <p className="font-display text-[20px] font-bold italic leading-tight text-white">
                Same passion.
                <br />
                <span className="text-[#8dc63f]">A bigger stage.</span>
              </p>
              <p className="mt-4 text-[12px] leading-5 text-emerald-100/45">
                Powering better auctions, stronger teams and unforgettable
                sporting moments.
              </p>
            </div>
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}