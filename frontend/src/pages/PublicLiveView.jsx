import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import { getImageUrl } from "../utils/imageUrl";
import socket from "../utils/socket";
import TeamOverviewCard from "../components/TeamOverviewCard";
import { Gavel, Users, Zap, ChevronRight, ChevronLeft } from "lucide-react";

/**
 * PublicLiveView.jsx
 */

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const DEFAULT_TEAMS = [];

/* Loads the display typeface used across every headline/number in the
   design (Anton) once per mount. Scoped with a data attribute so it never
   collides with the rest of the app's font-sans body copy. */
function DisplayFontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');
      .aa-display { font-family: 'Anton', 'Archivo Black', ui-sans-serif, system-ui, sans-serif; }
    `}</style>
  );
}

function PlayerPhoto({ url, name, className }) {
  const photo = getImageUrl(url);
  const [failed, setFailed] = useState(false);

  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={name || "Player"}
        draggable="false"
        className={className}
        onError={() => setFailed(true)}
        style={{
          // Fades the photo's own edges (and any flat studio background it
          // was shot on) into the card instead of showing a hard white box.
          WebkitMaskImage:
            "radial-gradient(120% 100% at 62% 38%, #000 55%, transparent 96%)",
          maskImage:
            "radial-gradient(120% 100% at 62% 38%, #000 55%, transparent 96%)",
          filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.45))",
        }}
      />
    );
  }
  return (
    <div
      className={`${className} flex items-center justify-center bg-transparent font-black text-[#E5007D]/50`}
    >
      <span className="aa-display text-6xl">{String(name || "P").charAt(0).toUpperCase()}</span>
    </div>
  );
}

/* Full-width, responsive carousel of the exact same team card used on the
   public dashboard. Works down to mobile via native horizontal scroll-snap;
   arrows + dot pagination are layered on top for laptop/tablet/desktop. */
function TeamsOverviewCarousel({ teams, auction, soldPlayers, publicSlug }) {
  const scrollRef = useRef(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const recalc = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !el.firstChild) return;
    const cardWidth = el.firstChild.getBoundingClientRect().width + 16; // gap-4 = 16px
    const perView = Math.max(1, Math.round(el.clientWidth / cardWidth));
    setPageCount(Math.max(1, Math.ceil(teams.length / perView)));
  }, [teams.length]);

  useEffect(() => {
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [recalc]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };

  const goTo = (target) => {
    const el = scrollRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(pageCount - 1, target));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  };

  return (
    <section className="mt-5 rounded-3xl border border-white/15 bg-slate-950/65 p-5 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="aa-display flex items-center gap-2 text-lg uppercase tracking-wide text-white">
          <Users className="h-4 w-4 text-[#E5007D]" />
          Teams <span className="text-[#E5007D]">Overview</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/live/${publicSlug}/dashboard`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#E5007D] hover:opacity-70 sm:flex"
          >
            View All Teams <ChevronRight className="h-3 w-3" />
          </a>
          {teams.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => goTo(page - 1)}
                disabled={page === 0}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E5007D] text-white shadow-sm transition disabled:opacity-30"
                aria-label="Previous teams"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => goTo(page + 1)}
                disabled={page >= pageCount - 1}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E5007D] text-white shadow-sm transition disabled:opacity-30"
                aria-label="Next teams"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-10 text-center">
          <Users className="h-6 w-6 text-white/30" />
          <div className="text-xs font-bold uppercase tracking-wide text-white/40">Teams will appear here</div>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {teams.map((t, idx) => (
              <div key={t.id ?? idx} className="w-[80%] max-w-[280px] shrink-0 snap-start sm:w-[280px]">
                <TeamOverviewCard
                  team={t}
                  auction={auction}
                  soldPlayers={soldPlayers}
                  accentIndex={idx}
                  variant="tinted"
                />
              </div>
            ))}
          </div>

          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {Array.from({ length: pageCount }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === page ? "w-5 bg-[#E5007D]" : "w-1.5 bg-white/20"
                  }`}
                  aria-label={`Go to teams page ${i + 1}`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function PublicLiveView() {
  const { publicSlug } = useParams();
  const [auction, setAuction] = useState(null);
  const [state, setState] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [celebration, setCelebration] = useState(null);

  const currentPlayer = useMemo(() => {
    if (!state) return null;
    return {
      id: state.current_player_id,
      player_name: state.player_name || "",
      category: state.category || "",
      player_role: state.player_role || state.batting_style || "",
      base_price: state.base_price || 0,
      photo_url: state.photo_url,
      jersey_number: state.jersey_number ?? state.player_number,
    };
  }, [state]);

  const loadAuction = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/public/auction/${publicSlug}`);
      setSnapshot(response.data);
      setAuction(response.data.auction || null);
      setState(response.data.state || null);
    } catch (error) {
      console.error("Public auction load error:", error);
    } finally {
      setLoading(false);
    }
  }, [publicSlug]);

  useEffect(() => {
    loadAuction();
  }, [loadAuction]);

  useEffect(() => {
    if (!auction?.id) return;

    socket.emit("joinPublicAuction", { auctionId: auction.id, publicSlug });

    const handleSnapshotUpdated = (payload) => {
      if (payload?.auction?.id === auction.id || payload?.auctionId === auction.id) {
        setSnapshot(payload);
        if (payload.auction) setAuction(payload.auction);
        if (payload.state) setState(payload.state);
      }
    };

    const handlePlayerSold = (payload) => {
      if (payload?.auction?.id === auction.id || payload?.auctionId === auction.id) {
        setState((prev) => {
          setCelebration({
            type: "SOLD",
            teamName: payload?.team_name || payload?.sold_team_name || prev?.highest_team_name || "",
            amount: payload?.sold_amount || payload?.bid_amount || prev?.current_bid || 0,
          });
          return payload.state || prev;
        });
        setTimeout(() => setCelebration(null), 2500);
        setSnapshot(payload);
        if (payload.auction) setAuction(payload.auction);
      }
    };

    const handlePlayerUnsold = (payload) => {
      if (payload?.auction?.id === auction.id || payload?.auctionId === auction.id) {
        setCelebration({ type: "UNSOLD" });
        setTimeout(() => setCelebration(null), 2000);
        setSnapshot(payload);
        if (payload.auction) setAuction(payload.auction);
        if (payload.state) setState(payload.state);
      }
    };

    socket.on("auctionSnapshotUpdated", handleSnapshotUpdated);
    socket.on("playerSold", handlePlayerSold);
    socket.on("playerUnsold", handlePlayerUnsold);
    socket.on("playerFinalUnsold", handlePlayerUnsold);

    return () => {
      socket.off("auctionSnapshotUpdated", handleSnapshotUpdated);
      socket.off("playerSold", handlePlayerSold);
      socket.off("playerUnsold", handlePlayerUnsold);
      socket.off("playerFinalUnsold", handlePlayerUnsold);
    };
  }, [auction?.id, publicSlug]);

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#0B0F1A]">
        <DisplayFontLoader />
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#E5007D] border-t-transparent" />
      </div>
    );
  }

  const basePrice = Number(currentPlayer?.base_price || 0);
  const currentBid = Number(state?.current_bid || basePrice || 0);
  const maxBid = auction?.max_bid_cap ?? state?.max_bid ?? (basePrice ? basePrice * 3 : 0);

  const teams = snapshot?.teamsSummary?.length
    ? snapshot.teamsSummary
    : auction?.teams?.length
    ? auction.teams
    : DEFAULT_TEAMS;

  const soldPlayers = snapshot?.soldPlayers || [];

  const seasonLabel = auction?.season_label || auction?.auction_name || "Auction Arena";

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-[#0B0F1A] font-sans text-white bg-[url('/publicView-bg.png')] bg-cover bg-center bg-no-repeat">
      <DisplayFontLoader />

      {/* Dark scrim so the stadium photo stays moody and every card reads clearly on top of it */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0B0F1A]/90 via-[#0B0F1A]/80 to-[#0B0F1A]/95" />

      <CelebrationOverlay celebration={celebration} />

      {/* Backdrop wash */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-[#E5007D]/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-10 h-[600px] w-[600px] rounded-full bg-[#8CC63F]/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-full bg-gradient-to-br from-[#E5007D]/[0.05] via-transparent to-[#8CC63F]/[0.08]" />

      <div className="relative mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-5 md:px-8 md:py-7">
        {/* ---------------- HEADER ---------------- */}
        <header className="mb-6 flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between lg:gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 lg:contents">
            {/* LEFT: Logo / wordmark */}
            <div className="flex min-w-0 shrink-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#E5007D]/15">
                <Gavel className="h-6 w-6 -rotate-45 text-[#E5007D]" />
              </div>
              <div className="min-w-0">
                <div className="aa-display truncate text-3xl uppercase leading-none tracking-tight sm:text-4xl">
                  <span className="text-[#E5007D]">Auction</span> <span className="text-white">Arena</span>
                </div>
                <div className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 sm:text-[11px]">
                  Players &middot; Passion &middot; Bigger Dreams
                </div>
              </div>
            </div>

            {/* RIGHT: Season title + ribbon */}
            <div className="order-3 flex shrink-0 items-center gap-4 lg:order-3">
              <div className="min-w-0 max-w-[200px] text-right sm:max-w-[280px]">
                <div className="aa-display truncate text-lg uppercase leading-none tracking-tight text-white sm:text-xl">
                  {seasonLabel}
                </div>
                <div className="truncate text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                  Auction Arena
                </div>
              </div>
              <div className="hidden shrink-0 -rotate-6 rounded-lg bg-[#E5007D] px-3 py-1.5 text-right text-[10px] font-black italic uppercase leading-tight text-white shadow-md lg:block">
                Cricket
                <br />
                Builds
                <br />
                Bridges
              </div>
            </div>
          </div>

          {/* MIDDLE: Status Badges — restyled as dark glass pills to sit on the stadium background */}
          <div className="order-2 flex flex-wrap items-center justify-center gap-2 lg:order-2 lg:flex-1 lg:justify-center">
            <a
              href={`/live/${publicSlug}/dashboard`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/80 shadow-sm backdrop-blur-md transition-colors hover:border-[#E5007D] hover:text-[#E5007D]"
            >
              Public Dashboard
            </a>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/80 shadow-sm backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              Live View
            </span>
            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 shadow-sm backdrop-blur-md">
              Auction ID <strong className="ml-1 text-white/80">#{auction?.auction_code || publicSlug}</strong>
            </span>
          </div>
        </header>

        {/* ---------------- PLAYER HERO CARD ---------------- */}
        <div className="min-w-0 flex-1">
          <section className="relative flex min-w-0 flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-950/65 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-1 flex-col sm:flex-row">
              {/* Photo side */}
              <div className="relative h-[260px] w-full shrink-0 overflow-hidden bg-gradient-to-br from-[#E5007D]/15 to-[#8CC63F]/10 sm:h-auto sm:w-[46%]">
                <div className="pointer-events-none absolute -left-2 top-6 max-w-[90%] select-none text-[15vw] font-black uppercase leading-[0.85] tracking-tighter text-[#E5007D]/10 sm:text-[3.6vw]">
                  {currentPlayer?.player_name || "Waiting"}
                </div>
                <div className="absolute inset-0 flex items-end p-3">
                  <PlayerPhoto
                    url={currentPlayer?.photo_url}
                    name={currentPlayer?.player_name}
                    className="h-full w-full object-cover object-top"
                  />
                </div>
                {/* Bottom fade so the photo melts into the info panel instead of ending in a hard edge */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
              </div>

              {/* Info side */}
              <div className="relative flex min-w-0 flex-1 flex-col justify-center p-5 sm:p-7">
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex items-center rounded-full bg-[#E5007D] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                    Current Player
                  </span>
                  {currentPlayer?.jersey_number ? (
                    <div className="aa-display select-none text-[clamp(44px,7vw,80px)] leading-none text-[#E5007D]/20">
                      #{currentPlayer.jersey_number}
                    </div>
                  ) : null}
                </div>

                <h1 className="aa-display mt-4 break-words text-[clamp(48px,7.5vw,96px)] uppercase leading-[0.82] tracking-tight text-white [text-shadow:0_4px_24px_rgba(0,0,0,0.35)]">
                  {currentPlayer?.player_name || "Waiting for player..."}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  {currentPlayer?.player_role && (
                    <span className="aa-display text-xl uppercase tracking-wide text-white/70 sm:text-2xl">
                      {currentPlayer.player_role}
                    </span>
                  )}
                  {currentPlayer?.category && (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E5007D] text-xs font-black text-white">
                      {currentPlayer.category}
                    </span>
                  )}
                  {state?.highest_team_name && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-black uppercase text-white/70">
                      Leading: {state.highest_team_name}
                    </span>
                  )}
                </div>

                {/* Current Bid Display Box with Hammer & Bid (Zap) Icons */}
                <div className="mt-6 rounded-2xl border border-[#E5007D]/30 bg-[#E5007D]/10 p-4 shadow-lg backdrop-blur-md sm:p-5">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/70">
                    <Gavel className="h-4 w-4 -rotate-45 text-[#E5007D]" />
                    <Zap className="h-4 w-4 text-[#E5007D]" />
                    <span>Current Bid</span>
                  </div>
                  <div className="aa-display mt-1 text-[clamp(56px,8.5vw,110px)] leading-none text-[#E5007D]">
                    ₹{formatAmount(currentBid)}
                  </div>
                </div>

                {/* Base Price and Max Bid (Min Bid removed) */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/45">Base Price</div>
                    <div className="aa-display mt-1 truncate text-2xl text-white sm:text-3xl">₹{formatAmount(basePrice)}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/45">Max Bid</div>
                    <div className="aa-display mt-1 truncate text-2xl text-white sm:text-3xl">₹{formatAmount(maxBid)}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ---------------- TEAMS OVERVIEW (same card layout as the public dashboard) ---------------- */}
        <TeamsOverviewCarousel teams={teams} auction={auction} soldPlayers={soldPlayers} publicSlug={publicSlug} />

        {/* ---------------- FOOTER ---------------- */}
        <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-6 text-[10px] font-bold uppercase tracking-widest text-white/40">
          <div>
            {seasonLabel} &nbsp;|&nbsp; Players &middot; Passion &middot; Bigger Dreams
          </div>
          <div className="flex items-center gap-1.5 text-[#E5007D]">
            <span className="h-2 w-2 rounded-full bg-[#E5007D]" />
            More Than A Game
          </div>
        </footer>
      </div>
    </div>
  );
}

function CelebrationOverlay({ celebration }) {
  if (!celebration) return null;
  const isSold = celebration.type === "SOLD";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
      <div
        className={`w-full max-w-sm rounded-3xl border bg-slate-950/90 p-6 text-center shadow-2xl ${
          isSold ? "border-emerald-400/40" : "border-[#E5007D]/40"
        }`}
      >
        <span
          className={`inline-block rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
            isSold ? "bg-emerald-500/15 text-emerald-400" : "bg-[#E5007D]/15 text-[#E5007D]"
          }`}
        >
          {isSold ? "PLAYER ACQUIRED" : "UNSOLD"}
        </span>

        <h2 className="aa-display mt-2 text-3xl uppercase tracking-tight text-white">{celebration.type}</h2>

        {isSold && celebration.teamName && (
          <div className="mt-1 text-base font-black uppercase text-white/70">{celebration.teamName}</div>
        )}

        {isSold && celebration.amount && (
          <div className="aa-display mt-3 inline-block rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-xl text-emerald-400">
            ₹{formatAmount(celebration.amount)}
          </div>
        )}
      </div>
    </div>
  );
}