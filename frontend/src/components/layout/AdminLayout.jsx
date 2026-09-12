import React, { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Gavel,
  Shield,
  Users,
  Radio,
  BarChart3,
  Eye,
  Menu,
  X,
  Search,
  ChevronRight,
  LogOut,
  Settings,
  Bell,
  CircleHelp,
} from "lucide-react";
import LiveAuctionTicker from "./LiveAuction";

/* =========================================================
   FONTS — Space Grotesk for numbers/headlines, Inter for body.
   Loaded once here since AdminLayout wraps every page.
========================================================= */
function GlobalType() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap');
      .font-display { font-family: 'Space Grotesk', ui-sans-serif, sans-serif; }
      .font-body { font-family: 'Inter', ui-sans-serif, sans-serif; }
      .tabular { font-variant-numeric: tabular-nums; }
    `}</style>
  );
}

function useNavItems({ auctionId, organizationId, publicSlug }) {
  return useMemo(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const auctionBase = auctionId ? `/admin/auctions/${auctionId}` : "#";

    if (isSuperAdmin) {
      return [
        { label: "Dashboard", icon: LayoutDashboard, to: "/super-admin", scope: "global" },
      ];
    }

    return [
      { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard", scope: "global" },
      { label: "Organizations", icon: Building2, to: "/select-organization", scope: "global" },
      {
        label: "Auctions",
        icon: Gavel,
        to: organizationId ? `/admin/organizations/${organizationId}/auctions` : "#",
        scope: "global",
      },
      { label: "Teams", icon: Shield, to: auctionId ? `${auctionBase}/teams` : "#", scope: "auction" },
      { label: "Players", icon: Users, to: auctionId ? `${auctionBase}/players` : "#", scope: "auction" },
      {
        label: "Live Control",
        icon: Radio,
        to: auctionId ? `${auctionBase}/live-control` : "#",
        scope: "auction",
        isLive: true,
      },
      { label: "Reports", icon: BarChart3, to: auctionId ? `${auctionBase}/reports` : "#", scope: "auction" },
      { label: "Public View", icon: Eye, to: publicSlug ? `/live/${publicSlug}` : "#", scope: "auction" },
      // Not a route — clicking this opens the LiveAuctionTicker as a modal overlay instead of navigating.
      { label: "YouTube Overlay", icon: Radio, scope: "auction", isOverlay: true },
    ];
  }, [auctionId, organizationId, publicSlug]);
}

/* =========================================================
   BRAND MARK
   Drop your file at /public/logo.png — if it's missing or
   fails to load, this falls back to a monogram badge instead
   of a broken image icon.
========================================================= */
function BrandMark() {
  const [broken, setBroken] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/[0.07] ring-1 ring-white/[0.08]">
        {!broken ? (
          <img
            src="/logo.png"
            alt="SportzMitra"
            onError={() => setBroken(true)}
            className="h-full w-full object-contain p-1.5"
          />
        ) : (
          <Gavel size={19} className="text-[#ec008c]" strokeWidth={2.25} />
        )}
      </div>
      <div className="min-w-0 leading-tight">
        <p className="font-display truncate text-[16px] font-bold tracking-tight text-white">
          SportzMitra
        </p>
        <p className="text-[9px] font-semibold tracking-[0.14em] text-emerald-200/40">
          Auction House
        </p>
      </div>
    </div>
  );
}

export default function AdminLayout({
  children,
  active = "Dashboard",
  auctionId,
  organizationId,
  publicSlug,
  liveSummary,
  currentPlayer,
  nextPlayer,
  youtubeUrl,
}) {
  const navigate = useNavigate();
  const navItems = useNavItems({ auctionId, organizationId, publicSlug });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [liveOverlayOpen, setLiveOverlayOpen] = useState(false);

  const globalItems = navItems.filter((item) => item.scope === "global");
  const auctionItems = navItems.filter((item) => item.scope === "auction");

  const handleLogout = (e) => {
    e.preventDefault();
    localStorage.clear();
    navigate("/login");
  };

  const openLiveOverlay = () => {
    setMobileMenuOpen(false);
    setLiveOverlayOpen(true);
  };

  return (
    <div className="font-body min-h-screen bg-[#f5f4f0] text-[#0f1d17] antialiased">
      <GlobalType />

      {/* =========================================================
          DESKTOP SIDEBAR
      ========================================================== */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[264px] flex-col bg-[#03251b] lg:flex">
        {/* faint scoreboard grid texture */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,.9)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.9)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-[#ec008c]/10 blur-3xl" />

        <div className="relative flex h-full flex-col">
          {/* Brand */}
          <div className="border-b border-white/[0.07] px-5 py-6">
            <BrandMark />
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto px-3 pt-5">
            <NavGroup label="Workspace" items={globalItems} active={active} />
            <NavGroup
              label="This auction"
              items={auctionItems}
              active={active}
              onOverlayOpen={openLiveOverlay}
              className="mt-6"
            />

            {/* <div className="mt-6 space-y-0.5 border-t border-white/[0.07] pt-4">
              <UtilityLink icon={CircleHelp} label="Help Center" />
              <UtilityLink icon={Settings} label="Settings" />
            </div> */}
          </div>

          {/* Live status strip */}
          {liveSummary && (
            <div className="relative mx-3 mb-3 overflow-hidden rounded-2xl bg-white/[0.05] p-3.5 ring-1 ring-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ec008c]" />
                <span className="text-[10px] font-bold text-emerald-100/50">Live now</span>
              </div>
              <p className="mt-1.5 truncate text-[13px] font-semibold text-white">
                {liveSummary.title}
              </p>
              <p className="tabular mt-0.5 text-[11px] font-medium text-emerald-100/40">
                {liveSummary.sold}/{liveSummary.total} players sold
              </p>
            </div>
          )}

          {/* Profile */}
          <div className="relative border-t border-white/[0.07] p-3">
            <div className="flex items-center gap-3 rounded-2xl px-2 py-2">
              <div className="relative shrink-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ec008c] text-[11px] font-bold text-white uppercase">
                  {(JSON.parse(localStorage.getItem("user") || "{}").name || "US").slice(0, 2)}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#03251b] bg-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-white">{JSON.parse(localStorage.getItem("user") || "{}").name || "User"}</p>
                <p className="truncate text-[10px] font-medium text-emerald-200/40">{JSON.parse(localStorage.getItem("user") || "{}").role === "SUPER_ADMIN" ? "Super Admin" : "Auction Admin"}</p>
              </div>
              <button
                onClick={handleLogout}
                type="button"
                title="Log out"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-200/40 transition hover:bg-red-500/10 hover:text-red-300"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* =========================================================
          MAIN CONTENT
      ========================================================== */}
      <div className="min-h-screen lg:pl-[264px]">
        <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-[#f5f4f0]/85 backdrop-blur-xl">
          <div className="flex h-[72px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/[0.08] bg-white text-[#0f1d17] shadow-sm lg:hidden"
              >
                <Menu size={19} />
              </button>

              <div className="relative hidden w-[320px] md:block">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search auctions, players, teams…"
                  className="h-10 w-full rounded-xl border border-black/[0.08] bg-white pl-10 pr-9 text-[13px] font-medium text-[#0f1d17] outline-none transition placeholder:text-slate-400 focus:border-[#03251b]/25 focus:ring-4 focus:ring-[#03251b]/[0.04]"
                />
                <span className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-black/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 lg:block">
                  /
                </span>
              </div>

              <div className="min-w-0 md:hidden">
                <p className="font-display truncate text-[15px] font-bold text-[#0f1d17]">
                  {active}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                className="relative hidden h-10 w-10 items-center justify-center rounded-xl border border-black/[0.08] bg-white text-slate-500 transition hover:text-[#0f1d17] sm:flex"
              >
                <Bell size={17} />
                <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#ec008c]" />
              </button>

              <div className="hidden h-8 w-px bg-black/[0.08] sm:block" />

              <div className="hidden text-right sm:block">
                <p className="text-[12px] font-semibold text-[#0f1d17]">{JSON.parse(localStorage.getItem("user") || "{}").name || "User"}</p>
                <p className="text-[10px] font-medium text-slate-400">{JSON.parse(localStorage.getItem("user") || "{}").role === "SUPER_ADMIN" ? "Super Admin" : "Auction Admin"}</p>
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#03251b] text-[11px] font-bold text-white uppercase">
                {(JSON.parse(localStorage.getItem("user") || "{}").name || "US").slice(0, 2)}
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10">{children}</main>
      </div>

      {/* =========================================================
          MOBILE DRAWER
      ========================================================== */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />

          <aside className="absolute inset-y-0 left-0 flex w-[280px] max-w-[88vw] flex-col bg-[#03251b] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-5">
              <BrandMark />
              <button
                onClick={() => setMobileMenuOpen(false)}
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-5">
              <NavGroup label="Workspace" items={globalItems} active={active} onNavigate={() => setMobileMenuOpen(false)} />
              <NavGroup
                label="This auction"
                items={auctionItems}
                active={active}
                onNavigate={() => setMobileMenuOpen(false)}
                onOverlayOpen={openLiveOverlay}
                className="mt-6"
              />
            </div>

            <div className="border-t border-white/[0.07] p-3">
              <button
                onClick={handleLogout}
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 py-3 text-[12px] font-semibold text-red-300 transition hover:bg-red-500 hover:text-white"
              >
                <LogOut size={15} />
                Log out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* =========================================================
          MOBILE BOTTOM NAV
      ========================================================== */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/[0.06] bg-white/95 px-2 py-2 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isSelected = active === item.label;
            return (
              <NavLink
                key={item.label}
                to={item.to}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition ${
                  isSelected ? "text-[#ec008c]" : "text-slate-400"
                }`}
              >
                <Icon size={18} strokeWidth={isSelected ? 2.5 : 2} />
                <span className="text-[9px] font-semibold">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* =========================================================
          LIVE AUCTION / YOUTUBE OVERLAY
          LiveAuctionTicker doesn't manage its own modal chrome — it's a
          normal inline block — so AdminLayout supplies the backdrop,
          centering, and close button here.
      ========================================================== */}
      {liveOverlayOpen && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setLiveOverlayOpen(false)}
        >
          <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLiveOverlayOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg transition hover:bg-slate-100"
            >
              <X size={18} />
            </button>
            <LiveAuctionTicker currentPlayer={currentPlayer} nextPlayer={nextPlayer} youtubeUrl={youtubeUrl} />
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   NAV GROUP + ITEM
========================================================= */

function NavGroup({ label, items, active, onNavigate, onOverlayOpen, className = "" }) {
  if (!items.length) return null;

  return (
    <div className={className}>
      <p className="px-3 pb-2 text-[10px] font-semibold text-emerald-200/30">{label}</p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavItem
            key={item.label}
            item={item}
            active={active}
            onNavigate={onNavigate}
            onOverlayOpen={onOverlayOpen}
          />
        ))}
      </div>
    </div>
  );
}

function NavItem({ item, active, onNavigate, onOverlayOpen }) {
  const Icon = item.icon;
  const isSelected = active === item.label;
  const isDisabled = !item.isOverlay && item.to === "#";

  const sharedClassName = `group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${
    isSelected
      ? "bg-white text-[#03251b]"
      : isDisabled
      ? "pointer-events-none text-emerald-100/20"
      : "text-emerald-100/55 hover:bg-white/[0.06] hover:text-white"
  }`;

  const innerContent = (
    <>
      <Icon size={17} strokeWidth={isSelected ? 2.5 : 2} />
      <span className="flex-1 truncate">{item.label}</span>

      {item.isLive && (
        <span
          className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
            isSelected ? "bg-[#ec008c]/10 text-[#ec008c]" : "bg-[#ec008c]/15 text-[#ff6ec0]"
          }`}
        >
          <span className="h-1 w-1 animate-pulse rounded-full bg-current" />
          Live
        </span>
      )}

      {!isSelected && !item.isLive && !isDisabled && (
        <ChevronRight size={13} className="opacity-0 transition group-hover:opacity-35" />
      )}
    </>
  );

  // Opens the LiveAuctionTicker modal instead of navigating to a route.
  if (item.isOverlay) {
    return (
      <button type="button" onClick={onOverlayOpen} className={sharedClassName}>
        {innerContent}
      </button>
    );
  }

  return (
    <NavLink to={item.to} onClick={onNavigate} className={sharedClassName}>
      {innerContent}
    </NavLink>
  );
}

function UtilityLink({ icon: Icon, label }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-emerald-100/45 transition hover:bg-white/[0.06] hover:text-white"
    >
      <Icon size={17} />
      {label}
    </button>
  );
}