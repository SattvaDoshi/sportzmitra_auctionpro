import {
  Activity,
  IndianRupee,
  RefreshCw,
  Search,
  Shuffle,
  UserCheck,
  Zap,
  ClipboardList,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import AdminLayout from "../components/layout/AdminLayout";
import StatusBadge from "../components/ui/StatusBadge";
import api from "../api/api";
import { getImageUrl } from "../utils/imageUrl";

const socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5000", {
  transports: ["websocket", "polling"],
});

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function teamInitials(team) {
  const direct = team?.team_short_name || team?.short_name || team?.code;
  if (direct) return String(direct).trim().slice(0, 4).toUpperCase();

  const words = String(team?.team_name || "TEAM")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);

  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function teamSearchText(team) {
  return [
    team?.team_name,
    team?.team_short_name,
    team?.short_name,
    team?.code,
    team?.owner_name,
    team?.team_owner_name,
    team?.owner_mobile,
    team?.mobile,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function playerSearchText(player) {
  return [
    player?.player_name,
    player?.name,
    player?.mobile,
    player?.player_mobile,
    player?.category,
    player?.player_role,
    player?.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizeArray(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function balanceOf(team) {
  return (
    team?.remaining_purse ??
    team?.balance_purse ??
    team?.available_purse ??
    team?.purse_balance ??
    team?.purse ??
    team?.total_purse ??
    0
  );
}

function CelebrationOverlay({ celebration }) {
  if (!celebration) return null;

  const isSold = celebration.type === "SOLD";
  const teamName = celebration.teamName || "";
  const amount = celebration.amount;

  return (
    <div className="pointer-events-none fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/80 backdrop-blur-md">
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 28 }).map((_, index) => (
          <span
            key={index}
            className={`celebration-dot ${isSold ? "bg-green-500" : "bg-red-500"}`}
            style={{
              left: `${(index * 37) % 100}%`,
              animationDelay: `${(index % 8) * 0.08}s`,
            }}
          />
        ))}
      </div>

      <div
        className={`celebration-pop max-w-[92vw] rounded-3xl border-8 p-8 text-center shadow-2xl backdrop-blur-xl ${
          isSold
            ? "border-green-600 bg-white text-slate-900 shadow-green-500/30"
            : "border-red-600 bg-white text-slate-900 shadow-red-500/30"
        }`}
      >
        <div
          className={`text-[clamp(56px,10vw,140px)] font-black uppercase leading-none tracking-wider ${
            isSold ? "text-green-600" : "text-red-600"
          }`}
        >
          {celebration.type}
        </div>
        {isSold && teamName ? (
          <div className="mt-4 text-[clamp(22px,3.5vw,52px)] font-black uppercase text-slate-900">
            {teamName}
          </div>
        ) : null}
        {isSold && amount ? (
          <div className="mt-4 inline-flex items-center justify-center rounded-2xl bg-green-600 px-8 py-3 text-[clamp(28px,4vw,64px)] font-black leading-none text-white shadow-lg shadow-green-600/30">
            ₹{formatAmount(amount)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlayerPhoto({ player }) {
  const photo = getImageUrl(player?.photo_url || player?.player_photo_url || player?.image_url);
  const name = player?.player_name || player?.name || "Player";

  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        draggable="false"
        className="block h-full max-h-full w-full max-w-full rounded-2xl border border-slate-200 object-contain shadow-sm"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-[clamp(60px,10vw,120px)] font-black text-[#8CC63F] shadow-inner">
      {String(name).charAt(0).toUpperCase() || "P"}
    </div>
  );
}

export default function LiveControl() {
  const { auctionId } = useParams();
  const teamSearchRef = useRef(null);
  const playerSearchRef = useRef(null);

  const [auction, setAuction] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [state, setState] = useState(null);
  const [manualPlayerSearch, setManualPlayerSearch] = useState("");
  const [playerCursor, setPlayerCursor] = useState(0);
  const [teamId, setTeamId] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [teamCursor, setTeamCursor] = useState(0);
  const [bid, setBid] = useState(0);
  const [increment, setIncrement] = useState(100);
  const [selectionMode, setSelectionMode] = useState("RANDOM");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [celebration, setCelebration] = useState(null);
  const [recentTeams, setRecentTeams] = useState([]);
  // Audit + Correction
  const [auditLog, setAuditLog] = useState([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [correctionModal, setCorrectionModal] = useState(null); // { player_id, player_name, sold_team_name, sold_price }
  const [correctionTeamId, setCorrectionTeamId] = useState("");
  const [correctionPrice, setCorrectionPrice] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [maxBidMap, setMaxBidMap] = useState({});

  async function load() {
    try {
      const [dash, p, t, snap, cats, mbRes] = await Promise.all([
        api.get(`/auctions/${auctionId}/dashboard`),
        api.get(`/players/auction/${auctionId}`),
        api.get(`/teams/auction/${auctionId}`),
        api.get(`/live/${auctionId}/snapshot`),
        api.get(`/auctions/${auctionId}/categories`).catch(() => ({ data: [] })),
        api.get(`/live/${auctionId}/max-bid`).catch(() => ({ data: { maxBidMap: {} } })),
      ]);

      const nextState = snap.data.state || dash.data.state || null;
      setAuction(dash.data.auction);
      setPlayers(normalizeArray(p.data, "players"));
      setTeams(normalizeArray(t.data, "teams"));
      setCategories(cats.data || []);
      setSnapshot(snap.data);
      setState(nextState);
      setMaxBidMap(mbRes.data?.maxBidMap || {});
      setBid(Number(nextState?.current_bid || nextState?.base_price || 0));
      setIncrement(Number(nextState?.current_bid_increment || dash.data.auction?.minimum_bid_increment || 100));
      setSelectionMode(nextState?.selection_mode || dash.data.auction?.next_player_selection_mode || "RANDOM");
      if (nextState?.highest_team_id) setTeamId(String(nextState.highest_team_id));
    } catch (err) {
      console.error("Failed to load auction data", err);
    }
  }

  useEffect(() => {
    load();
  }, [auctionId]);

  useEffect(() => {
    socket.emit("joinAuction", Number(auctionId));

    const applySnapshot = (payload) => {
      if (!payload) return;
      if (payload.auction) setAuction(payload.auction);
      if (payload.state) {
        setSnapshot(payload);
        setState(payload.state);
        setBid(Number(payload.state?.current_bid || payload.state?.base_price || 0));
        setIncrement((old) => Number(payload.state?.current_bid_increment || old));
        setSelectionMode((old) => payload.state?.selection_mode || old);
        if (payload.state?.highest_team_id) setTeamId(String(payload.state.highest_team_id));
      }
    };

    const handleSold = (payload) => {
      setState((prev) => {
        setCelebration({
          type: "SOLD",
          teamName:
            payload?.team_name ||
            payload?.sold_team_name ||
            payload?.team?.team_name ||
            prev?.highest_team_name ||
            "",
          amount: payload?.sold_amount || payload?.bid_amount || prev?.current_bid || bid,
        });
        return payload?.state || prev;
      });
      setTimeout(() => setCelebration(null), 2200);
      clearSelectedTeam();
      applySnapshot(payload);
    };

    const handleUnsold = (payload) => {
      setCelebration({ type: "UNSOLD" });
      setTimeout(() => setCelebration(null), 1800);
      clearSelectedTeam();
      applySnapshot(payload);
    };

    socket.on("auctionSnapshotUpdated", applySnapshot);
    socket.on("bidPreviewUpdated", applySnapshot);
    socket.on("selectionModeUpdated", applySnapshot);
    socket.on("playerSelected", applySnapshot);
    socket.on("playerSold", handleSold);
    socket.on("playerUnsold", handleUnsold);
    socket.on("playerFinalUnsold", handleUnsold);

    return () => {
      socket.emit("leaveAuction", Number(auctionId));
      socket.off("auctionSnapshotUpdated", applySnapshot);
      socket.off("bidPreviewUpdated", applySnapshot);
      socket.off("selectionModeUpdated", applySnapshot);
      socket.off("playerSelected", applySnapshot);
      socket.off("playerSold", handleSold);
      socket.off("playerUnsold", handleUnsold);
      socket.off("playerFinalUnsold", handleUnsold);
    };
  }, [auctionId, bid]);

  const currentPlayerId = Number(state?.current_player_id || 0);
  const basePrice = Number(state?.base_price || 0);
  const selectedTeam = useMemo(() => teams.find((t) => String(t.id) === String(teamId)), [teams, teamId]);
  const currentPlayer = useMemo(
    () => ({
      id: currentPlayerId,
      player_name: state?.player_name,
      photo_url: state?.photo_url,
      player_photo_url: state?.player_photo_url,
      category: state?.category,
      player_role: state?.player_role,
      base_price: state?.base_price,
      status: state?.state || state?.status,
    }),
    [currentPlayerId, state]
  );

  const suggestedPlayer = useMemo(
    () => players.find((p) => Number(p.id) === Number(state?.suggested_player_id)),
    [players, state]
  );

  const eligiblePlayers = useMemo(
    () => players.filter((p) => ["AVAILABLE", "UNSOLD"].includes(String(p.status || "").toUpperCase())),
    [players]
  );

  const filteredPlayers = useMemo(() => {
    const q = manualPlayerSearch.trim().toLowerCase();
    const source = q ? eligiblePlayers.filter((p) => playerSearchText(p).includes(q)) : eligiblePlayers;
    return source.slice(0, 12);
  }, [eligiblePlayers, manualPlayerSearch]);

  const filteredTeams = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    const source = q ? teams.filter((t) => teamSearchText(t).includes(q)) : teams;
    return [...source].sort((a, b) => Number(balanceOf(b) || 0) - Number(balanceOf(a) || 0)).slice(0, 18);
  }, [teams, teamSearch]);

  async function call(fn, options = {}) {
    try {
      setBusy(true);
      setMsg("");
      const response = await fn();

      if (options.celebration) {
        setCelebration(options.celebration);
        setTimeout(() => setCelebration(null), options.celebration.type === "SOLD" ? 2200 : 1800);
      }

      if (response?.data?.snapshot) {
        setSnapshot(response.data.snapshot);
        setState(response.data.snapshot.state);
        setBid(Number(response.data.snapshot.state?.current_bid || response.data.snapshot.state?.base_price || 0));
        setIncrement(Number(response.data.snapshot.state?.current_bid_increment || increment));
        setSelectionMode(response.data.snapshot.state?.selection_mode || selectionMode);
      }
      if (options.clearTeam) clearSelectedTeam();
      setMsg(response?.data?.message || "Updated successfully");
      await load();
    } catch (error) {
      setMsg(error.response?.data?.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateBidPreview(nextBid, nextTeamId = teamId) {
    if (!currentPlayerId) return;
    const safeBid = Math.max(basePrice, Number(nextBid || 0));
    setBid(safeBid);
    await call(() =>
      api.patch(`/live/${auctionId}/bid-preview`, {
        player_id: currentPlayerId,
        team_id: nextTeamId ? Number(nextTeamId) : null,
        bid_amount: safeBid,
      })
    );
  }

  async function updateIncrement(value) {
    const inc = Math.max(1, Number(value || 1));
    setIncrement(inc);
    await call(() => api.patch(`/live/${auctionId}/current-increment`, { current_bid_increment: inc }));
  }

  async function updateSelectionMode(mode) {
    setSelectionMode(mode);
    await call(() => api.patch(`/live/${auctionId}/selection-mode`, { selection_mode: mode }));
  }

  async function selectTeam(team) {
    setTeamId(String(team.id));
    setTeamSearch(""); // Clear search to keep full list visible
    setRecentTeams((prev) => {
      const next = [team, ...prev.filter((t) => t.id !== team.id)];
      return next.slice(0, 6);
    });
    if (currentPlayerId) await updateBidPreview(bid || basePrice, String(team.id));
  }

  function clearSelectedTeam() {
    setTeamId("");
    setTeamSearch("");
  }

  function onTeamSearchKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setTeamCursor((v) => Math.min(v + 1, Math.max(filteredTeams.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setTeamCursor((v) => Math.max(v - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const team = filteredTeams[teamCursor] || filteredTeams[0];
      if (team) selectTeam(team);
    }
  }

  function onPlayerSearchKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPlayerCursor((v) => Math.min(v + 1, Math.max(filteredPlayers.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPlayerCursor((v) => Math.max(v - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const player = filteredPlayers[playerCursor] || filteredPlayers[0];
      if (player) selectManualPlayer(player.id);
    }
  }

  useEffect(() => setTeamCursor(0), [teamSearch]);
  useEffect(() => setPlayerCursor(0), [manualPlayerSearch]);

  async function selectManualPlayer(playerId) {
    await call(() => api.post(`/live/${auctionId}/select-player`, { player_id: Number(playerId) }));
    setManualPlayerSearch("");
    clearSelectedTeam();
  }

  async function markSold() {
    if (!currentPlayerId) {
      setMsg("Please select player first.");
      playerSearchRef.current?.focus();
      return;
    }
    if (!teamId) {
      setMsg("Please select team before marking SOLD.");
      teamSearchRef.current?.focus();
      return;
    }

    const soldTeam = selectedTeam;
    const soldAmount = bid || state?.current_bid || state?.base_price || 0;

    // Ensure the backend state is perfectly synced with UI before marking sold
    await updateBidPreview(soldAmount, teamId);

    await call(() => api.post(`/live/${auctionId}/sold`), {
      celebration: { type: "SOLD", teamName: soldTeam?.team_name, amount: soldAmount },
      clearTeam: true,
    });
  }

  async function markUnsold() {
    if (!currentPlayerId) {
      setMsg("Please select player first.");
      playerSearchRef.current?.focus();
      return;
    }
    await call(() => api.post(`/live/${auctionId}/unsold`), {
      celebration: { type: "UNSOLD" },
      clearTeam: true,
    });
  }

  async function pauseAuction() {
    await call(() => api.post(`/live/${auctionId}/pause`));
  }

  async function resumeAuction() {
    await call(() => api.post(`/live/${auctionId}/resume`));
  }

  // --- Audit & Correction ---
  async function loadAuditLog() {
    try {
      const res = await api.get(`/live/${auctionId}/audit-log`);
      setAuditLog(res.data || []);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (auditOpen) loadAuditLog();
  }, [auditOpen, auctionId]);

  function openCorrectionModal(player) {
    if (!player) return;
    setCorrectionModal({
      player_id: player.id,
      player_name: player.player_name,
      sold_team_name: player.sold_team_name || "Unknown Team",
      sold_price: player.sold_price || 0,
    });
    setCorrectionTeamId("");
    setCorrectionPrice(player.sold_price || "");
    setCorrectionReason("");
  }

  function closeCorrectionModal() {
    setCorrectionModal(null);
  }

  async function applyCorrection() {
    if (!correctionModal || !correctionTeamId || !correctionPrice) {
      setMsg("Please select a team and enter a price for correction.");
      return;
    }
    await call(() => api.post(`/live/${auctionId}/correct`, {
      player_id: correctionModal.player_id,
      new_team_id: correctionTeamId,
      new_price: Number(correctionPrice),
      reason: correctionReason,
    }));
    closeCorrectionModal();
    if (auditOpen) loadAuditLog();
    load(); // refresh data
  }

  const modeLabel = {
    MANUAL: "Manual",
    RANDOM: "Random Auto",
    RANDOM_WITH_ADMIN_CONFIRM: "Random Confirm",
  };

  return (
    <AdminLayout
      title="Live Auction Control"
      subtitle="Real-time bidding desk & streaming operator panel"
      active="Live Control"
      auctionId={auctionId}
      organizationId={auction?.organization_id}
      publicSlug={auction?.public_slug}
       fullscreen
    >
      <CelebrationOverlay celebration={celebration} />

      <div className="mx-auto max-w-7xl font-sans text-slate-800 p-3 md:p-6 bg-slate-50 min-h-screen">
        
        {/* Header Control Strip */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#8CC63F]">
                <Activity size={16} />
                Live Control Center
              </div>
              <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-slate-900">
                {auction?.auction_name || "Auction Console"}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-[#8CC63F]/40 bg-[#8CC63F]/10 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-slate-900">
                Viewers: {snapshot?.viewerCount || 0}
              </div>
              <button
                onClick={load}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-slate-700 transition-all hover:bg-slate-50 shadow-sm"
              >
                <RefreshCw size={15} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[32%_33%_35%]">
          
          {/* COLUMN 1: PLAYER CONTROL */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-base font-black uppercase tracking-wider text-slate-900">Player Details</h3>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Photo, specs, selection mode & search
              </p>
            </div>

            <div className="flex h-[260px] items-center justify-center rounded-xl border border-slate-100 bg-slate-50 p-2">
              {currentPlayerId ? (
                <PlayerPhoto player={currentPlayer} />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center p-4">
                  <div>
                    <div className="text-base font-black uppercase tracking-wider text-[#8CC63F]">No Active Player</div>
                    <div className="mt-1 text-xs font-semibold text-slate-400">Select or suggest a player</div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="truncate text-lg font-black uppercase tracking-tight text-slate-900">
                {currentPlayer?.player_name || "Player Not Selected"}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-2xs">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Category</div>
                  <div className="mt-0.5 truncate text-xs font-extrabold text-[#E5007D]">{currentPlayer?.category || "-"}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-2xs">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Role</div>
                  <div className="mt-0.5 truncate text-xs font-extrabold text-slate-800">{currentPlayer?.player_role || "-"}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-2xs">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Base Price</div>
                  <div className="mt-0.5 truncate text-xs font-extrabold text-[#8CC63F]">₹{formatAmount(currentPlayer?.base_price)}</div>
                </div>
              </div>

              {auction?.auction_type === "CATEGORY_WISE" && (
                <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-100 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Curr: <span className="text-slate-900">{state?.current_category || "N/A"}</span>
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Next: <span className="text-slate-900">
                      {categories[categories.findIndex(c => c.category_name === state?.current_category) + 1]?.category_name || "None"}
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-2.5">
                <StatusBadge status={currentPlayer?.status || "NOT_STARTED"} />
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Mode: <span className="text-[#E5007D]">{modeLabel[selectionMode] || selectionMode}</span>
                </div>
              </div>
            </div>

            {/* Next Mode Switcher */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                Selection Mode
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {["RANDOM", "RANDOM_WITH_ADMIN_CONFIRM", "MANUAL"].map((mode) => (
                  <button
                    key={mode}
                    disabled={busy}
                    onClick={() => updateSelectionMode(mode)}
                    className={`rounded-lg px-2 py-2 text-[10px] font-black uppercase transition-all ${
                      selectionMode === mode
                        ? "bg-[#8CC63F] text-slate-950 shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {modeLabel[mode]}
                  </button>
                ))}
              </div>
            </div>

            {/* Manual Player Selection */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Manual Selection
                </div>
                <button
                  disabled={busy}
                  onClick={() => call(() => api.post(`/live/${auctionId}/suggest-next`))}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#8CC63F]/40 bg-[#8CC63F]/15 px-2.5 py-1 text-[10px] font-black uppercase text-slate-900 hover:bg-[#8CC63F]/30 disabled:opacity-50"
                >
                  <Shuffle size={12} /> Auto Suggest
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  ref={playerSearchRef}
                  value={manualPlayerSearch}
                  onChange={(e) => setManualPlayerSearch(e.target.value)}
                  onKeyDown={onPlayerSearchKeyDown}
                  placeholder="Search player name, mobile or role..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none focus:border-[#8CC63F]"
                />
              </div>

              <div className="mt-2.5 max-h-[180px] overflow-y-auto rounded-xl border border-slate-200 bg-white">
                {filteredPlayers.map((player, index) => (
                  <button
                    key={player.id}
                    type="button"
                    onMouseEnter={() => setPlayerCursor(index)}
                    onClick={() => selectManualPlayer(player.id)}
                    className={`grid w-full grid-cols-[1fr_70px_50px] items-center gap-2 border-b border-slate-100 px-3 py-2 text-left transition last:border-b-0 ${
                      index === playerCursor ? "bg-[#8CC63F]/20 text-slate-900" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-extrabold uppercase text-slate-900">{player.player_name || player.name}</div>
                      <div className="truncate text-[10px] font-semibold text-slate-400">{player.mobile || player.player_mobile || "N/A"}</div>
                    </div>
                    <div className="truncate text-[10px] font-black uppercase text-[#E5007D]">{player.player_role || "-"}</div>
                    <div className="truncate text-right text-[10px] font-black uppercase text-amber-600">{player.category || "-"}</div>
                  </button>
                ))}
                {filteredPlayers.length === 0 && (
                  <div className="p-3 text-center text-xs font-semibold text-slate-400">No eligible players found</div>
                )}
              </div>

              {suggestedPlayer && (
                <button
                  disabled={busy}
                  onClick={() => selectManualPlayer(suggestedPlayer.id)}
                  className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-left hover:bg-amber-100 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="text-[9px] font-black uppercase tracking-widest text-amber-700">Suggested Player</div>
                    <div className="truncate text-xs font-black uppercase text-slate-900">{suggestedPlayer.player_name}</div>
                  </div>
                  <UserCheck className="h-4 w-4 shrink-0 text-amber-600" />
                </button>
              )}
            </div>
          </section>

          {/* COLUMN 2: BID CONTROL */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-base font-black uppercase tracking-wider text-slate-900">Bidding Controls</h3>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Adjust values, increments & finalize sales
              </p>
            </div>

            {/* Display Active Bid */}
            <div className="rounded-xl border border-[#8CC63F]/40 bg-[#8CC63F]/10 p-5 text-center">
              <div className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-slate-800">
                <IndianRupee size={15} /> Current Bid
              </div>
              <div className="mt-2 text-[clamp(42px,5vw,68px)] font-black leading-none text-slate-950">
                ₹{formatAmount(bid || state?.current_bid || basePrice)}
              </div>
            </div>

            {/* Increment Controls */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Bid Increment (₹)
                </span>
                <input
                  value={increment}
                  onChange={(e) => setIncrement(e.target.value)}
                  onBlur={() => updateIncrement(increment)}
                  type="number"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-lg font-black text-slate-900 outline-none focus:border-[#8CC63F]"
                />
              </label>

              <div className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                Quick Increments
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  disabled={!currentPlayerId || busy}
                  onClick={() => updateBidPreview(Number(bid || 0) - Number(increment || 0))}
                  className="rounded-xl border border-[#E5007D]/30 bg-[#E5007D]/10 py-2.5 text-base font-black text-[#E5007D] hover:bg-[#E5007D]/20 disabled:opacity-40"
                >
                  -{formatAmount(increment)}
                </button>
                <button
                  disabled={!currentPlayerId || busy}
                  onClick={() => updateBidPreview(Number(bid || 0) + Number(increment || 0))}
                  className="rounded-xl border border-[#8CC63F]/50 bg-[#8CC63F]/20 py-2.5 text-base font-black text-slate-900 hover:bg-[#8CC63F]/30 disabled:opacity-40"
                >
                  +{formatAmount(increment)}
                </button>
                <button
                  disabled={!currentPlayerId || busy}
                  onClick={() => updateBidPreview(Number(bid || 0) - 500)}
                  className="rounded-xl border border-slate-200 bg-white py-2 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  -500
                </button>
                <button
                  disabled={!currentPlayerId || busy}
                  onClick={() => updateBidPreview(Number(bid || 0) + 500)}
                  className="rounded-xl border border-slate-200 bg-white py-2 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  +500
                </button>
              </div>

              <input
                value={bid}
                onChange={(e) => setBid(e.target.value)}
                onBlur={() => updateBidPreview(Number(bid || 0))}
                type="number"
                placeholder="Custom Bid Amount"
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-lg font-black text-[#E5007D] outline-none focus:border-[#E5007D]"
              />
            </div>

            {/* Auction Outcome Actions (Solid Red & Green) */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                Action Desk
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled={busy || !currentPlayerId}
                  onClick={markSold}
                  className="rounded-xl bg-green-600 hover:bg-green-700 py-3.5 text-lg font-black uppercase text-white shadow-sm transition-all disabled:opacity-40"
                >
                  Sold
                </button>
                <button
                  disabled={busy || !currentPlayerId}
                  onClick={markUnsold}
                  className="rounded-xl bg-red-600 hover:bg-red-700 py-3.5 text-lg font-black uppercase text-white shadow-sm transition-all disabled:opacity-40"
                >
                  Unsold
                </button>
              </div>

              <button
                disabled={busy}
                onClick={() => call(() => api.post(`/live/${auctionId}/suggest-next`), { clearTeam: true })}
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-all shadow-2xs"
              >
                Next Player
              </button>

              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
                <button
                  disabled={busy || auction?.status === "PAUSED"}
                  onClick={pauseAuction}
                  className="rounded-xl border border-orange-200 bg-orange-50 py-2 text-xs font-black uppercase text-orange-600 hover:bg-orange-100 disabled:opacity-40 transition-all"
                >
                  Pause Auction
                </button>
                <button
                  disabled={busy || auction?.status !== "PAUSED"}
                  onClick={resumeAuction}
                  className="rounded-xl border border-blue-200 bg-blue-50 py-2 text-xs font-black uppercase text-blue-600 hover:bg-blue-100 disabled:opacity-40 transition-all"
                >
                  Resume Auction
                </button>
              </div>
            </div>
          </section>

          {/* COLUMN 3: TEAM SELECTION */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-base font-black uppercase tracking-wider text-slate-900">Teams & Purses</h3>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Select leading bidder or browse franchises
              </p>
            </div>

            {/* Selected Team Card */}
            <div className="rounded-xl border border-[#8CC63F]/40 bg-[#8CC63F]/10 p-3.5">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-800">
                Currently Bidding Team
              </div>

              {selectedTeam ? (() => {
                const tmb = maxBidMap[selectedTeam.id];
                const maxBidVal = tmb?.max_bid ?? null;
                const isBidOver = maxBidVal !== null && Number(bid || 0) > maxBidVal;
                return (
                  <div className="mt-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg bg-[#8CC63F] text-xs font-black text-slate-950">
                        {teamInitials(selectedTeam)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-black uppercase text-slate-900">
                          {selectedTeam.team_name}
                        </div>
                        <div className="text-xs font-black text-[#E5007D]">
                          Balance: ₹{formatAmount(balanceOf(selectedTeam))}
                        </div>
                      </div>
                    </div>
                    {maxBidVal !== null && (
                      <div className={`mt-2.5 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-black ${
                        isBidOver
                          ? "bg-red-100 border border-red-300 text-red-700"
                          : maxBidVal === 0
                          ? "bg-orange-100 border border-orange-300 text-orange-700"
                          : "bg-slate-100 border border-slate-200 text-slate-700"
                      }`}>
                        <span className="uppercase tracking-wider">Max Bid</span>
                        <span className={`text-sm font-black ${
                          isBidOver ? "text-red-600" : maxBidVal === 0 ? "text-orange-600" : "text-emerald-600"
                        }`}>
                          {maxBidVal === 0 ? "LOCKED" : `₹${formatAmount(maxBidVal)}`}
                        </span>
                      </div>
                    )}
                    {isBidOver && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-red-600">
                        ⚠ Current bid exceeds this team's max allowable bid!
                      </div>
                    )}
                    {maxBidVal === 0 && !isBidOver && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-orange-600">
                        ⚠ Team has no bidding capacity — purse reserved for remaining slots
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="mt-1.5 text-xs font-semibold text-slate-500">
                  No team selected yet
                </div>
              )}
            </div>

            {/* Search Team */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {recentTeams.length > 0 && (
                <div className="mb-3">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Recent Teams
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentTeams.map(rt => (
                      <button
                        key={rt.id}
                        onClick={() => selectTeam(rt)}
                        className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-100 transition"
                      >
                        {teamInitials(rt)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                Filter Teams
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  ref={teamSearchRef}
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  onKeyDown={onTeamSearchKeyDown}
                  placeholder="Search team, code or owner..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none focus:border-[#8CC63F]"
                />
              </div>
            </div>

            {/* Teams List */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                Franchises Pool
              </div>

              <div className="max-h-[380px] overflow-y-auto rounded-xl border border-slate-200 bg-white">
                {filteredTeams.map((team, index) => {
                  const balance = balanceOf(team);
                  const tmb = maxBidMap[team.id];
                  const maxBidVal = tmb?.max_bid ?? null;
                  const isSelected = String(teamId) === String(team.id);
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onMouseEnter={() => setTeamCursor(index)}
                      onClick={() => selectTeam(team)}
                      className={`grid w-full grid-cols-[45px_1fr_90px] items-center gap-2.5 border-b border-slate-100 px-3 py-2 text-left transition last:border-b-0 ${
                        isSelected
                          ? "bg-[#8CC63F] text-slate-950 font-bold"
                          : index === teamCursor
                          ? "bg-[#8CC63F]/15 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-black uppercase text-slate-700">
                        {teamInitials(team)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-black uppercase">{team.team_name}</div>
                        <div className="truncate text-[10px] font-semibold text-slate-400">
                          {team.owner_name || team.team_owner_name || "No Owner"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black">₹{formatAmount(balance)}</div>
                        {maxBidVal !== null && (
                          <div className={`text-[9px] font-black uppercase ${
                            maxBidVal === 0 ? "text-red-500" : "text-emerald-600"
                          }`}>
                            {maxBidVal === 0 ? "LOCKED" : `Max ₹${formatAmount(maxBidVal)}`}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {filteredTeams.length === 0 && (
                  <div className="p-4 text-center text-xs font-semibold text-slate-400">No teams found</div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Global Feedback Banner */}
        {msg && (
          <div className="mt-5 rounded-xl border border-[#8CC63F]/50 bg-[#8CC63F]/15 p-3 text-center text-xs font-black text-slate-900">
            {msg}
          </div>
        )}

        {/* Audit Log Panel */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <button
            onClick={() => setAuditOpen(!auditOpen)}
            className="flex w-full items-center justify-between bg-slate-50 px-6 py-4 transition-colors hover:bg-slate-100"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200/50 text-slate-600">
                <ClipboardList size={20} />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-black italic uppercase text-slate-900">Audit & Action Log</h3>
                <p className="text-[10px] font-semibold text-slate-500">View recent auction activities and apply corrections</p>
              </div>
            </div>
            {auditOpen ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </button>
          
          {auditOpen && (
            <div className="border-t border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-black uppercase text-slate-700">Recent Actions</h4>
                <button onClick={loadAuditLog} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-200">
                  <RefreshCw size={12} /> Refresh Log
                </button>
              </div>
              
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {auditLog.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500">No actions recorded yet.</div>
                ) : (
                  auditLog.map((log) => (
                    <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex rounded bg-slate-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-700 ${log.action_type === 'CORRECTION' ? 'bg-[#EC008C]/10 text-[#EC008C]' : ''}`}>
                            {log.action_type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400">
                            {new Date(log.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-700">
                          {log.player_name ? <span className="font-bold">{log.player_name}</span> : null}
                          {log.player_name && log.team_name ? " → " : ""}
                          {log.team_name ? <span className="font-bold text-[#8CC63F]">{log.team_name}</span> : null}
                        </p>
                        {log.reason && <p className="mt-1 text-[10px] text-slate-500 italic">"{log.reason}"</p>}
                        {log.action_type === 'CORRECTION' && log.old_data && log.new_data && (
                          <div className="mt-2 text-[10px] text-slate-500 flex gap-4">
                            <span>Was: <span className="line-through">{JSON.parse(log.old_data).price}</span></span>
                            <span className="font-bold text-[#EC008C]">Now: {JSON.parse(log.new_data).price}</span>
                          </div>
                        )}
                        {log.action_type === 'PLAYER_SOLD' && log.player_id && (
                          <div className="mt-2">
                            <button
                              onClick={() => {
                                const player = players.find(p => p.id === log.player_id);
                                if (player) openCorrectionModal(player);
                              }}
                              className="rounded-lg bg-slate-200 px-3 py-1 text-[10px] font-bold text-slate-700 hover:bg-[#EC008C] hover:text-white transition-colors"
                            >
                              Correct Sale
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="text-right whitespace-nowrap text-xs text-slate-500">
                        by {log.performed_by || "System"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Correction Modal */}
      {correctionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-[#EC008C] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3 text-white">
                <AlertTriangle size={20} />
                <h3 className="text-sm font-black italic uppercase tracking-wider">Correct Sold Player</h3>
              </div>
              <button onClick={closeCorrectionModal} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                <p className="text-xs text-slate-500 mb-1">Player being corrected</p>
                <div className="text-base font-black text-slate-900">{correctionModal.player_name}</div>
                <div className="mt-2 flex gap-4 text-xs font-semibold text-slate-600">
                  <span>Current Team: {correctionModal.sold_team_name}</span>
                  <span>Current Price: ₹{formatAmount(correctionModal.sold_price)}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">New Team</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#EC008C]"
                    value={correctionTeamId}
                    onChange={(e) => setCorrectionTeamId(e.target.value)}
                  >
                    <option value="">Select correct team...</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.team_name} (Purse: ₹{formatAmount(balanceOf(t))})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">New Price (₹)</label>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#EC008C]"
                    value={correctionPrice}
                    onChange={(e) => setCorrectionPrice(e.target.value)}
                    placeholder="Enter correct amount"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Reason for correction (Optional)</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#EC008C]"
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    placeholder="e.g. Wrong team selected by mistake"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={closeCorrectionModal}
                  className="rounded-xl px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={applyCorrection}
                  disabled={busy || !correctionTeamId || !correctionPrice}
                  className="rounded-xl bg-[#EC008C] px-6 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-md hover:bg-[#d4007d] disabled:opacity-50"
                >
                  {busy ? "Applying..." : "Apply Correction"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}