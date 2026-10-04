import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import { getImageUrl } from "../utils/imageUrl";
import socket from "../utils/socket";
import { Gavel, Users } from "lucide-react";

/**
 * PublicLiveView.jsx
 *
 * Layout (matches the SportzMitra mockup)
 *  - md+ (tablet / laptop):
 *      header
 *      [ Player photo (left) | Name + role/category + leading team + Current Bid (right) ]
 *      full-width Player Stats strip (one row, vertical dividers)
 *      sponsors
 *  - mobile:
 *      header -> photo with name overlay -> leading team -> Current Bid (base price inline)
 *      -> Player Stats (3 x 2 tiles) -> sponsors
 *  - Nothing is rendered below the stats except the sponsor strip.
 */

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const DEFAULT_TEAMS = [];

/* ---------------------------------------------------------------------------
   PLAYER STATS (rich-text field)
   ---------------------------------------------------------------------------
   The stats panel reads the player's rich-text / stats field from the live
   `state`. If your field has a different name, add it to STAT_SOURCE_KEYS.

   Accepted formats for that field:
     - HTML table  (header row + value row, OR two-column label/value rows)
     - HTML / plain text lines like "Match: 10"
     - JSON string, object  { match: 10, sixes: 4 }
     - array  [{ label: "Match", value: 10 }]
   If nothing is found, the six standard tiles are filled from flat fields
   (matches, batting_avg, ...) and show "-" when missing.
--------------------------------------------------------------------------- */
const STAT_SOURCE_KEYS = [
  "player_stats",
  "stats",
  "rich_text",
  "richtext",
  "player_details",
  "player_info",
  "additional_info",
  "custom_fields",
  "extra_fields",
];

const DEFAULT_STAT_DEFS = [
  { label: "Match", keys: ["matches", "match", "matches_played", "total_matches"] },
  { label: "Batting Avg", keys: ["batting_avg", "batting_average"] },
  { label: "Bowling Avg", keys: ["bowling_avg", "bowling_average"] },
  { label: "Strike Rate", keys: ["strike_rate"] },
  { label: "Sixes", keys: ["sixes", "total_sixes"] },
  { label: "Fours", keys: ["fours", "total_fours"] },
];

function humanizeKey(key) {
  return String(key)
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function cleanCell(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function parseTextLines(text) {
  return String(text)
    .split(/\n|;/)
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx <= 0) return null;
      const label = cleanCell(line.slice(0, idx));
      const value = cleanCell(line.slice(idx + 1));
      if (!label || !value || label.length > 30) return null;
      return { label, value };
    })
    .filter(Boolean);
}

function parseHtmlStats(html) {
  if (typeof DOMParser === "undefined") return [];

  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = Array.from(doc.querySelectorAll("tr"))
    .map((tr) => {
      const cells = Array.from(tr.children).filter((c) => c.tagName === "TD" || c.tagName === "TH");
      return {
        cells: cells.map((c) => cleanCell(c.textContent)),
        isHeader: cells.length > 0 && cells.every((c) => c.tagName === "TH"),
      };
    })
    .filter((r) => r.cells.some(Boolean));

  if (rows.length) {
    /* Horizontal table: header row of labels + one row of values */
    if ((rows[0].isHeader || rows.length === 2) && rows[0].cells.length > 2 && rows[1]) {
      return rows[0].cells
        .map((label, i) => ({ label, value: rows[1].cells[i] || "-" }))
        .filter((s) => s.label);
    }
    /* Vertical table: label | value per row */
    return rows
      .filter((r) => !r.isHeader && r.cells.length >= 2)
      .map((r) => ({ label: r.cells[0], value: r.cells[1] }))
      .filter((s) => s.label && s.value !== "");
  }

  /* No table: treat block elements / <br> as line breaks, read "Label: value" */
  const withBreaks = html.replace(/<\/(p|div|li|tr|h[1-6])>|<br\s*\/?>/gi, "\n");
  const text = new DOMParser().parseFromString(withBreaks, "text/html").body.textContent || "";
  return parseTextLines(text);
}

function parseStats(raw) {
  if (raw == null || raw === "") return [];

  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      if (item && typeof item === "object") {
        const label = item.label ?? item.name ?? item.key ?? item.title;
        const value = item.value ?? item.val ?? item.stat;
        if (label != null && value != null) {
          return [{ label: cleanCell(label), value: cleanCell(value) || "-" }];
        }
        return parseStats(item);
      }
      return parseStats(item);
    });
  }

  if (typeof raw === "object") {
    return Object.entries(raw)
      .filter(([, v]) => v != null && typeof v !== "object")
      .map(([k, v]) => ({ label: humanizeKey(k), value: cleanCell(v) || "-" }));
  }

  if (typeof raw === "string") {
    const str = raw.trim();
    if (!str) return [];
    if (str.startsWith("[") || str.startsWith("{")) {
      try {
        return parseStats(JSON.parse(str));
      } catch {
        /* not JSON, fall through */
      }
    }
    if (/<[a-z][\s\S]*>/i.test(str)) return parseHtmlStats(str);
    return parseTextLines(str);
  }

  return [];
}

function resolveStats(state) {
  if (state) {
    for (const key of STAT_SOURCE_KEYS) {
      const raw = state[key];
      if (raw == null || raw === "") continue;

      if (typeof raw === "string") {
        const str = raw.trim();
        if ((str.startsWith("<") || /<[a-z][\s\S]*>/i.test(str)) && !str.startsWith("[") && !str.startsWith("{")) {
          return { isHtml: true, data: str };
        }
      }

      const parsed = parseStats(raw);
      if (parsed.length) return { isHtml: false, data: parsed };
    }
  }
  const defs = DEFAULT_STAT_DEFS.map((def) => {
    const found = state ? def.keys.find((k) => state[k] != null && state[k] !== "") : null;
    return { label: def.label, value: found ? cleanCell(state[found]) : "-" };
  });
  return { isHtml: false, data: defs };
}

/* Loads the display typeface used across every headline/number in the
   design (Anton) once per mount. Scoped with a data attribute so it never
   collides with the rest of the app's font-sans body copy. */
function DisplayFontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');
      .aa-display { font-family: 'Anton', 'Archivo Black', ui-sans-serif, system-ui, sans-serif; }

      /* ---------- Rich text player info ---------- */
      .rich-text-content {
        width: 100%;
        text-align: left;
        font-size: 0.9rem;
        line-height: 1.55;
        color: rgba(255, 255, 255, 0.92);
      }
      .rich-text-content > :first-child { margin-top: 0; }
      .rich-text-content > :last-child { margin-bottom: 0; }

      .rich-text-content p { margin: 0.35rem 0; }
      .rich-text-content strong, .rich-text-content b { color: #ff2e9a; font-weight: 800; }
      .rich-text-content a { color: #8DC63F; text-decoration: underline; text-underline-offset: 3px; }

      .rich-text-content h1, .rich-text-content h2, .rich-text-content h3 {
        margin: 0.75rem 0 0.4rem;
        font-weight: 900;
        line-height: 1.15;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        color: #fff;
      }
      .rich-text-content h1 { font-size: 1.25rem; }
      .rich-text-content h2 { font-size: 1.1rem; }
      .rich-text-content h3 { font-size: 0.95rem; color: #ff2e9a; }

      /* Bullet lists become wrapping stat chips (e.g. "match:10") */
      .rich-text-content ul {
        list-style: none;
        margin: 0.4rem 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .rich-text-content ul li {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
        padding: 0.35rem 0.8rem;
        border-radius: 9999px;
        border: 1px solid rgba(229, 0, 125, 0.5);
        background: rgba(229, 0, 125, 0.18);
        font-size: 0.8rem;
        font-weight: 700;
        color: #fff;
      }
      .rich-text-content ul li::before {
        content: "";
        width: 6px;
        height: 6px;
        flex-shrink: 0;
        border-radius: 9999px;
        background: #ff2e9a;
        box-shadow: 0 0 8px rgba(255, 46, 154, 0.8);
      }

      /* Numbered lists keep their numbers, in pink */
      .rich-text-content ol {
        margin: 0.4rem 0;
        padding-left: 1.4rem;
        list-style: decimal;
      }
      .rich-text-content ol li { margin: 0.2rem 0; padding-left: 0.25rem; }
      .rich-text-content ol li::marker { color: #ff2e9a; font-weight: 800; }

      /* Tables */
      .rich-text-content table {
        width: 100%;
        min-width: 280px;
        margin: 0.5rem 0;
        border-collapse: separate;
        border-spacing: 0;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 0.75rem;
      }
      .rich-text-content th, .rich-text-content td {
        padding: 0.5rem 0.75rem;
        text-align: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .rich-text-content th + th, .rich-text-content td + td {
        border-left: 1px solid rgba(255, 255, 255, 0.1);
      }
      .rich-text-content tr:last-child td { border-bottom: 0; }
      .rich-text-content th {
        background: rgba(229, 0, 125, 0.35);
        font-size: 0.75rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .rich-text-content tbody tr:nth-child(even) td { background: rgba(255, 255, 255, 0.04); }
    `}</style>
  );
}

/* Rectangular auction logo box (wide, not a small square).
   Shows the uploaded logo, or an "Auction Logo" placeholder. */
function AuctionLogoBox({ url }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  const showImg = url && !failed;

  return (
    <div className="flex h-9 min-w-[118px] max-w-[170px] items-center justify-center rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 backdrop-blur-sm sm:h-14 sm:min-w-[150px] sm:max-w-[260px] sm:px-3">
      {showImg ? (
        <img
          src={url}
          alt="Auction Logo"
          draggable="false"
          onError={() => setFailed(true)}
          className="max-h-full w-auto max-w-full object-contain"
        />
      ) : (
        <span className="flex items-center gap-2">
          <Gavel className="h-5 w-5 shrink-0 -rotate-45 text-[#E5007D]" />
          <span className="whitespace-nowrap text-sm font-semibold text-white sm:text-base">Auction Logo</span>
        </span>
      )}
    </div>
  );
}

/* Player card. The photo fills the card and fades out at the bottom.
   On mobile the name is overlaid on the faded bottom (by the parent);
   on md+ the name sits in the right column instead. */
function PlayerPhoto({ url, name, className = "" }) {
  const photo = getImageUrl(url);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [photo]);

  const mask = "linear-gradient(to bottom, #000 0%, #000 62%, transparent 100%)";
  const showImg = photo && !failed;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#ff8fd0]/55 via-[#E5007D]/30 to-[#E5007D]/5 ${className}`}
      style={{ WebkitMaskImage: mask, maskImage: mask }}
    >
      {showImg ? (
        <img
          src={photo}
          alt={name || "Player"}
          draggable="false"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center pb-16">
          <span className="aa-display text-8xl text-[#E5007D]/60">
            {String(name || "P").charAt(0).toUpperCase()}
          </span>
        </div>
      )}
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

/* Leading-team capsule: team logo + team name (replaces the flag + team line
   in the mockup). Always rendered; shows "Awaiting bids" until a team leads. */
function LeadingTeamBadge({ name, logoUrl, className = "" }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  const showLogo = logoUrl && !failed;

  return (
    <div
      className={`flex w-full max-w-[340px] items-center gap-3 rounded-2xl border border-white/25 bg-black/50 py-2 pl-2.5 pr-5 shadow-[0_0_24px_rgba(229,0,125,0.35)] backdrop-blur-md ${className}`}
    >
      {showLogo ? (
        <img
          src={logoUrl}
          alt={name}
          draggable="false"
          onError={() => setFailed(true)}
          className="h-10 w-10 shrink-0 rounded-full object-cover sm:h-12 sm:w-12"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E5007D]/25 sm:h-12 sm:w-12">
          <Users className="h-5 w-5 text-[#ff5db8]" />
        </span>
      )}
      <span className="aa-display min-w-0 flex-1 truncate text-center text-xl uppercase italic tracking-wide text-white sm:text-2xl">
        {name || "Awaiting bids"}
      </span>
    </div>
  );
}

/* Player name + jersey + role + category. Rendered twice (mobile overlay,
   md+ right column); visibility is controlled by the parent via className. */
function PlayerIdentity({ player, as: Tag = "div", className = "", nameClass = "" }) {
  return (
    <div className={`flex-col items-center text-center ${className}`}>
      <Tag
        className={`aa-display max-w-full break-words uppercase leading-[0.95] tracking-tight text-white [text-shadow:0_4px_24px_rgba(0,0,0,0.65)] ${nameClass}`}
      >
        {player?.player_name || "Waiting for player..."}
        {player?.jersey_number ? <span className="ml-3 text-[#ff2e9a]">{player.jersey_number}</span> : null}
      </Tag>

      {(player?.player_role || player?.category) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {player?.player_role && (
            <span className="aa-display text-lg uppercase tracking-wide text-white/80 sm:text-2xl">
              {player.player_role}
            </span>
          )}
          {/* Pill grows with its text, so long categories never overflow the pink background */}
          {player?.category && (
            <span className="inline-flex min-h-[1.5rem] min-w-[1.5rem] items-center justify-center whitespace-nowrap rounded-full bg-[#E5007D] px-2.5 py-0.5 text-[10px] font-black uppercase leading-none tracking-wider text-white shadow-[0_0_14px_rgba(229,0,125,0.6)] sm:text-xs">
              {player.category}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* Mobile stat tile (3 x 2 grid). */
function StatTile({ label, value }) {
  const text = String(value ?? "-");
  const isLong = text.length > 5;

  return (
    <div className="flex min-w-0 flex-col items-center justify-between gap-1.5 rounded-2xl border border-[#E5007D]/35 bg-black/30 px-1.5 py-3">
      <span className="text-center text-[10px] font-black uppercase leading-tight tracking-wide text-white/85">
        {label}
      </span>
      <span
        className={`aa-display max-w-full break-words text-center leading-none text-[#ff2e9a] ${
          isLong ? "text-xl" : "text-3xl"
        }`}
      >
        {text}
      </span>
    </div>
  );
}

/* md+ stat cell: label over value, vertical divider between cells. */
function StatCell({ label, value, divider }) {
  const text = String(value ?? "-");
  const isLong = text.length > 5;

  return (
    <div
      className={`flex min-w-0 flex-col items-center justify-center gap-2 px-2 py-1 ${
        divider ? "border-l border-white/15" : ""
      }`}
    >
      <span className="text-center text-[11px] font-black uppercase leading-tight tracking-[0.15em] text-white/85 lg:text-xs">
        {label}
      </span>
      <span
        className={`aa-display max-w-full break-words text-center leading-none text-[#ff2e9a] ${
          isLong ? "text-2xl lg:text-3xl" : "text-4xl lg:text-5xl"
        }`}
      >
        {text}
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

const PANEL =
  "rounded-2xl border border-[#E5007D]/45 bg-gradient-to-br from-[#2b0a25]/80 to-[#12040f]/85 shadow-[0_0_44px_rgba(229,0,125,0.28)] backdrop-blur-md";

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

  const resolvedStats = useMemo(() => resolveStats(state), [state]);

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

    const joinRoom = () => {
      socket.emit("joinPublicAuction", { auctionId: auction.id, publicSlug });
    };

    joinRoom(); // Initial join
    socket.on("connect", joinRoom); // Re-join on reconnect

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
      socket.off("connect", joinRoom);
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

  /* Teams are only used to look up the leading team's name/logo. */
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

  /* md+ stats strip: up to 6 columns per row, divider before every cell that is not first in its row */
  const filledStats = playerStats.filter((st) => {
    const v = String(st.value ?? "").trim();
    return v !== "" && v !== "-" && v !== "\u2014";
  });
  const statCols = Math.max(1, Math.min(filledStats.length, 6));

  return (
    <div className="relative flex min-h-[100svh] w-full flex-col overflow-x-hidden bg-[#0B0F1A] font-sans text-white">
      <DisplayFontLoader />

      <CelebrationOverlay celebration={celebration} />

      <section className="relative isolate flex min-h-[100svh] w-full flex-1 flex-col overflow-hidden bg-[#0B0F1A] bg-[url('/publicView-bg.png')] bg-cover bg-center bg-no-repeat">
        {/* Scrims: keep the stadium visible but let text stay readable */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#0B0F1A]/70 via-[#0B0F1A]/35 to-[#0B0F1A]/85" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_50%,rgba(229,0,125,0.30),transparent_62%)]" />

        <div className="relative mx-auto flex w-full max-w-[1700px] flex-1 flex-col gap-4 px-4 py-4 md:gap-5 md:px-8 md:py-6">
          {/* =================== HEADER (always at the top) =================== */}
          {/* Mobile header: compact, two short rows */}
          <header className="flex flex-col gap-2 sm:hidden">
            <div className="flex items-center justify-between gap-2">
              <AuctionLogoBox url={auction?.auction_logo_url} />
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/25 bg-black/50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-white backdrop-blur-md">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                  </span>
                  Live View
                </span>
                <span className="inline-flex min-w-0 max-w-[110px] items-center rounded-full border border-white/25 bg-black/50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-white/90 backdrop-blur-md">
                  <span className="truncate">#{auction?.auction_code || publicSlug}</span>
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="aa-display truncate text-[32px] uppercase leading-none tracking-tight">
                  <span className="text-[#ff1f9f]">Auction</span> <span className="text-white">Arena</span>
                </div>
                <div className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.22em] text-white/75">
                  {seasonLabel}
                </div>
              </div>
              <a
                href={`/live/${publicSlug}/dashboard`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center rounded-full border border-white/25 bg-black/50 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white backdrop-blur-md transition-colors hover:border-[#E5007D] hover:text-[#ff5db8]"
              >
                Dashboard
              </a>
            </div>
          </header>

          {/* Tablet / laptop header */}
          <header className="hidden flex-col gap-3 sm:flex lg:flex-row lg:items-start lg:justify-between">
            {/* LEFT: logo | wordmark + season label */}
            <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
              <AuctionLogoBox url={auction?.auction_logo_url} />
              <span className="hidden h-12 w-px shrink-0 bg-white/25 sm:block" />
              <div className="min-w-0">
                <div className="aa-display truncate text-4xl uppercase leading-none tracking-tight sm:text-5xl">
                  <span className="text-[#ff1f9f]">Auction</span> <span className="text-white">Arena</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="h-px w-6 shrink-0 bg-white/30 sm:w-10" />
                  <span className="truncate text-[11px] font-bold uppercase tracking-[0.3em] text-white/75 sm:text-xs">
                    {seasonLabel}
                  </span>
                  <span className="h-px w-6 shrink-0 bg-white/30 sm:w-10" />
                </div>
              </div>
            </div>

            {/* RIGHT: tagline + status pills */}
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <div className="hidden text-[10px] font-bold uppercase tracking-[0.35em] text-white/75 sm:block sm:text-xs">
                Players &middot; Passion &middot; Bigger Dreams
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <a
                  href={`/live/${publicSlug}/dashboard`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/50 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md transition-colors hover:border-[#E5007D] hover:text-[#ff5db8] sm:text-xs"
                >
                  Public Dashboard
                </a>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/50 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md sm:text-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  Live View
                </span>
                <span className="inline-flex items-center rounded-full border border-white/25 bg-black/50 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/90 backdrop-blur-md sm:text-xs">
                  #{auction?.auction_code || publicSlug}
                </span>
              </div>
            </div>
          </header>

          {/* =================== MAIN STAGE =================== */}
          <main className="flex flex-1 flex-col justify-center gap-4 md:gap-5">
            {/* ---------- HERO: photo | name + team + bid ---------- */}
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
              {/* PHOTO (mobile: name overlaid on the faded bottom) */}
              <div className="relative mx-auto w-full max-w-[360px] md:mx-0 md:max-w-none">
                <PlayerPhoto
                  url={currentPlayer?.photo_url}
                  name={currentPlayer?.player_name}
                  className="aspect-[4/5] w-full md:aspect-auto md:h-full md:min-h-[340px] lg:min-h-[420px]"
                />

                <div className="absolute inset-x-0 bottom-0 z-10 px-2 pb-3 md:hidden">
                  <PlayerIdentity
                    player={currentPlayer}
                    className="flex"
                    nameClass="text-[clamp(38px,11vw,60px)]"
                  />
                </div>
              </div>

              {/* RIGHT COLUMN (md+) / stacked below photo (mobile) */}
              <div className="flex min-w-0 flex-col items-center justify-center gap-4 md:gap-5">
                {/* Name block, md+ only */}
                <PlayerIdentity
                  as="h1"
                  player={currentPlayer}
                  className="hidden md:flex"
                  nameClass="text-[clamp(44px,5.6vw,96px)]"
                />

                <LeadingTeamBadge name={leadingTeamName} logoUrl={leadingTeamLogo} />

                {/* CURRENT BID */}
                <div className={`${PANEL} w-full max-w-[560px] p-4 text-center sm:p-5`}>
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-white sm:text-sm">
                    Current Bid
                  </div>

                  <div className="aa-display mt-1 max-w-full text-[clamp(48px,13vw,80px)] leading-none text-[#ff1f9f] [text-shadow:0_0_28px_rgba(229,0,125,0.5)] md:text-[clamp(44px,5.2vw,84px)]">
                    ₹{formatAmount(currentBid)}
                  </div>

                  <div className="my-3 h-px w-full bg-white/15 sm:my-4" />

                  {/* Mobile: label and amount inline. md+: stacked. */}
                  <div className="flex items-baseline justify-center gap-3 md:flex-col md:items-center md:gap-0.5">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70 sm:text-xs">
                      Base Price
                    </div>
                    <div className="aa-display text-2xl leading-tight text-white md:text-3xl">
                      ₹{formatAmount(basePrice)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ---------- PLAYER STATS (hidden entirely when no stat has a value) ---------- */}
            {/* Mobile: 3 x 2 tiles */}
            {filledStats.length > 0 && (
            <div className="grid grid-cols-3 gap-2.5 md:hidden">
              {filledStats.map((stat, i) => (
                <StatTile key={`${stat.label}-${i}`} label={stat.label} value={stat.value} />
              ))}
            </div>
            )}

            {/* md+: one wide strip with vertical dividers */}
            {filledStats.length > 0 && (
            <div
              className={`${PANEL} hidden gap-y-4 px-2 py-4 md:grid lg:px-4 lg:py-5`}
              style={{ gridTemplateColumns: `repeat(${statCols}, minmax(0, 1fr))` }}
            >
              {filledStats.map((stat, i) => (
                <StatCell
                  key={`${stat.label}-${i}`}
                  label={stat.label}
                  value={stat.value}
                  divider={i % statCols !== 0}
                />
              ))}
            </div>
            )}
          </main>

          {/* =================== POWERED BY =================== */}
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