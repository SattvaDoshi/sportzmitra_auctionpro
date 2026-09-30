import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import { getImageUrl } from "../utils/imageUrl";
import socket from "../utils/socket";
import { Gavel, Users } from "lucide-react";

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

/* Player cut-out. The photo's bottom edge is faded out so the player blends
   into the stadium smoke behind the name, like the design. */
function PlayerPhoto({ url, name, className }) {
  const photo = getImageUrl(url);
  const [failed, setFailed] = useState(false);

  if (photo && !failed) {
    const mask = "linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%)";
    return (
      <img
        src={photo}
        alt={name || "Player"}
        draggable="false"
        className={className}
        onError={() => setFailed(true)}
        style={{
          WebkitMaskImage: mask,
          maskImage: mask,
          filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.45))",
        }}
      />
    );
  }
  return (
    <div
      className={`${className} flex min-w-[10rem] items-center justify-center bg-transparent font-black text-[#E5007D]/50`}
    >
      <span className="aa-display text-7xl">{String(name || "P").charAt(0).toUpperCase()}</span>
    </div>
  );
}

/* Resolves the logo of a team from whichever field the API provides. */
function getTeamLogo(team, state) {
  return getImageUrl(
    state?.highest_team_logo_url ||
      state?.leading_team_logo_url ||
      team?.logo_url ||
      team?.team_logo_url ||
      team?.team_logo ||
      team?.logo ||
      ""
  );
}

/* Leading-team capsule under the player role: team logo + team name.
   Always rendered; shows "Awaiting bids" until a team is leading. */
function LeadingTeamBadge({ name, logoUrl }) {
  const [failed, setFailed] = useState(false);
  const showLogo = logoUrl && !failed;

  return (
    <div className="mt-4 inline-flex max-w-full items-center gap-3 rounded-xl border border-white/70 bg-black/45 py-1.5 pl-2 pr-5 shadow-[0_0_24px_rgba(229,0,125,0.35)] backdrop-blur-md sm:mt-5">
      {showLogo ? (
        <img
          src={logoUrl}
          alt={name}
          draggable="false"
          onError={() => setFailed(true)}
          className="h-9 w-9 shrink-0 rounded-full object-cover sm:h-11 sm:w-11"
        />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E5007D]/20 sm:h-11 sm:w-11">
          <Users className="h-4 w-4 text-[#E5007D]" />
        </span>
      )}
      <span className="aa-display truncate text-lg uppercase italic tracking-wide text-white sm:text-2xl">
        {name || "Awaiting bids"}
      </span>
    </div>
  );
}

/* One sponsor logo on a white pill; falls back to the "Brand Logo"
   placeholder when the image is missing or fails to load. */
function SponsorLogo({ url }) {
  const [failed, setFailed] = useState(false);
  const src = url ? getImageUrl(url) : "";

  return (
    <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-1.5 shadow-lg">
      {src && !failed ? (
        <img
          src={src}
          alt="Sponsor"
          draggable="false"
          onError={() => setFailed(true)}
          className="h-7 w-auto max-w-[160px] object-contain sm:h-9"
        />
      ) : (
        <>
          <span className="h-6 w-6 shrink-0 rounded-full border-[5px] border-indigo-500 bg-white sm:h-7 sm:w-7" />
          <span className="text-sm font-extrabold uppercase tracking-wide text-slate-900 sm:text-base">
            Brand Logo
          </span>
        </>
      )}
    </div>
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
      serial_number: state.serial_number || "",
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

  /* Teams are only used to look up the leading team's name/logo now. */
  const teams = snapshot?.teamsSummary?.length
    ? snapshot.teamsSummary
    : auction?.teams?.length
    ? auction.teams
    : DEFAULT_TEAMS;

  const seasonLabel = auction?.season_label || auction?.auction_name || "Auction Arena";

  /* Sponsors: accepts a comma-separated string, an array, or a single URL field. */
  const rawSponsors =
    auction?.sponsor_logo_urls ?? auction?.sponsor_logo_url ?? auction?.sponsors ?? "";
  const sponsorUrls = (
    Array.isArray(rawSponsors)
      ? rawSponsors.map((s) => (typeof s === "string" ? s : s?.logo_url || s?.url || ""))
      : String(rawSponsors).split(",")
  )
    .map((s) => String(s).trim())
    .filter(Boolean);

  /* Leading team: match by id or name, and accept a few common field names. */
  const leadingTeamId =
    state?.highest_team_id ?? state?.highest_bidder_team_id ?? state?.leading_team_id ?? null;
  const leadingNameFromState =
    state?.highest_team_name || state?.leading_team_name || state?.highest_bidder_name || "";
  const leadingTeam =
    teams.find(
      (t) =>
        (leadingTeamId != null && String(t.id) === String(leadingTeamId)) ||
        (leadingNameFromState && (t.team_name || t.name) === leadingNameFromState)
    ) || null;
  const leadingTeamName = leadingNameFromState || leadingTeam?.team_name || leadingTeam?.name || "";
  const leadingTeamLogo = getTeamLogo(leadingTeam, state);

  return (
    <div className="relative flex min-h-[100svh] w-full flex-col overflow-x-hidden bg-[#0B0F1A] font-sans text-white">
      <DisplayFontLoader />

      <CelebrationOverlay celebration={celebration} />

      {/* =====================================================================
          One full-screen stage: header, centered player, bid, sponsor
          ===================================================================== */}
      <section className="relative isolate flex min-h-[100svh] w-full flex-1 flex-col overflow-hidden bg-[#0B0F1A] bg-[url('/publicView-bg.png')] bg-cover bg-center bg-no-repeat">
        {/* Scrims: keep the stadium visible but let text stay readable */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#0B0F1A]/70 via-[#0B0F1A]/35 to-[#0B0F1A]/85" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_50%,rgba(229,0,125,0.30),transparent_62%)]" />

        {/* Glowing stage ring under the bid panel */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[6%] -z-10 flex justify-center">
          <div className="h-16 w-[92%] max-w-[1100px] rounded-[50%] border border-[#E5007D]/60 bg-[#E5007D]/10 shadow-[0_0_70px_rgba(229,0,125,0.55)] sm:h-24 md:h-28" />
        </div>

        <div className="relative mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-5 md:px-8 md:py-7">
          {/* ---------------- HEADER ---------------- */}
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            {/* LEFT: Logo / wordmark + season label */}
            <div className="flex min-w-0 items-center gap-3">
              {auction?.auction_logo_url ? (
                <img src={auction.auction_logo_url} alt="Auction Logo" className="h-14 w-auto object-contain" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#E5007D]/15">
                  <Gavel className="h-6 w-6 -rotate-45 text-[#E5007D]" />
                </div>
              )}
              <div className="min-w-0">
                <div className="aa-display truncate text-3xl uppercase leading-none tracking-tight sm:text-4xl">
                  <span className="text-[#E5007D]">Auction</span> <span className="text-white">Arena</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="truncate text-[11px] font-bold uppercase tracking-[0.25em] text-white/60 sm:text-xs">
                    {seasonLabel}
                  </span>
                  <span className="h-px w-8 shrink-0 bg-white/20" />
                </div>
              </div>
            </div>

            {/* RIGHT: tagline + status pills */}
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60 sm:text-xs">
                Players &middot; Passion &middot; Bigger Dreams
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <a
                  href={`/live/${publicSlug}/dashboard`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white/70 backdrop-blur-md transition-colors hover:border-[#E5007D] hover:text-[#E5007D]"
                >
                  Public Dashboard
                </a>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white/80 backdrop-blur-md">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                  </span>
                  Live View
                </span>
                <span className="inline-flex items-center rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white/50 backdrop-blur-md">
                  #{auction?.auction_code || publicSlug}
                </span>
              </div>
            </div>
          </header>

          {/* ---------------- CENTERED PLAYER STAGE ---------------- */}
          <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
            {/* Player photo — blends down into the name */}
            <div className="relative flex h-[clamp(230px,38vh,440px)] w-full items-end justify-center">
              <PlayerPhoto
                url={currentPlayer?.photo_url}
                name={currentPlayer?.player_name}
                className="h-full w-auto max-w-full object-contain object-bottom"
              />
            </div>

            {/* Name block overlaps the faded bottom of the photo */}
            <div className="relative z-10 -mt-10 flex w-full flex-col items-center sm:-mt-14 md:-mt-16">
              <span className="inline-flex w-fit items-center rounded-full bg-[#E5007D] px-5 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-[0_0_24px_rgba(229,0,125,0.6)] sm:text-xs">
                Current Player
              </span>

              <h1 className="aa-display mt-3 max-w-full break-words text-[clamp(38px,6vw,92px)] uppercase leading-[0.95] tracking-tight text-white [text-shadow:0_4px_24px_rgba(0,0,0,0.55)] sm:mt-4">
                {currentPlayer?.player_name || "Waiting for player..."}
                {currentPlayer?.jersey_number ? <span>{currentPlayer.jersey_number}</span> : null}
              </h1>

              <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5">
                {currentPlayer?.player_role && (
                  <span className="aa-display text-lg uppercase tracking-wide text-white/75 sm:text-2xl">
                    {currentPlayer.player_role}
                  </span>
                )}
                {currentPlayer?.category && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E5007D] text-[10px] font-black text-white sm:h-7 sm:w-7 sm:text-xs">
                    {currentPlayer.category}
                  </span>
                )}
              </div>

              {/* Leading team: logo + name */}
              <LeadingTeamBadge name={leadingTeamName} logoUrl={leadingTeamLogo} />

              {/* Current Bid panel */}
              <div className="mt-4 w-full max-w-[300px] rounded-2xl border border-[#E5007D]/70 bg-gradient-to-b from-[#2b0a25]/85 to-[#12040f]/90 px-4 py-4 shadow-[0_0_44px_rgba(229,0,125,0.35)] backdrop-blur-md min-[420px]:max-w-[380px] sm:mt-5 sm:max-w-[480px] md:max-w-[560px]">
                <div className="flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-white/80 sm:text-sm">
                  <Gavel className="h-4 w-4 -rotate-45 text-[#E5007D]" />
                  <span>Current Bid</span>
                </div>
                <div className="aa-display mt-1 text-[clamp(52px,7.2vw,112px)] leading-none text-[#E5007D] [text-shadow:0_0_28px_rgba(229,0,125,0.45)]">
                  ₹{formatAmount(currentBid)}
                </div>
                <div className="mt-2 text-[9px] font-black uppercase tracking-[0.25em] text-white/60 sm:text-[10px]">
                  Base Price
                </div>
                <div className="aa-display text-2xl leading-tight text-white sm:text-3xl">
                  ₹{formatAmount(basePrice)}
                </div>
              </div>
            </div>
          </div>

          {/* ---------------- POWERED BY (always shown) ---------------- */}
          <div className="relative z-10 flex flex-col items-center gap-2 pb-1">
            <div className="flex w-full max-w-md items-center gap-3 text-[9px] font-bold uppercase tracking-[0.3em] text-white/70 sm:text-[10px]">
              <span className="h-px flex-1 bg-white/25" />
              Powered by
              <span className="h-px flex-1 bg-white/25" />
            </div>
            <div className="flex max-w-full flex-wrap items-center justify-center gap-3">
              {sponsorUrls.length > 0 ? (
                sponsorUrls.map((url, i) => <SponsorLogo key={i} url={url} />)
              ) : (
                <SponsorLogo url="" />
              )}
            </div>
          </div>
        </div>
      </section>
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