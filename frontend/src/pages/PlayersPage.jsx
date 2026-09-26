import { Download, Edit3, History, ImagePlus, Plus, Save, Search, Upload, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import AdminLayout from "../components/layout/AdminLayout";
import StatusBadge from "../components/ui/StatusBadge";
import api from "../api/api";

const DEFAULT_PLAYER_IMAGE = "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=300&auto=format&fit=crop";

const emptyPlayer = {
  player_name: "", player_mobile: "", player_email: "", category: "", player_role: "", base_price: "", tshirt_size: "", age: "", area: "", previous_team: "", photo_url: "", original_photo_url: "", photo_processing_status: "", photo_processing_mode: "",
};

const emptyCorrection = { status: "AVAILABLE", sold_team_id: "", sold_price: "", auction_round: "MAIN", category: "", player_role: "", base_price: "", tshirt_size: "", reason: "" };

function money(v) {
  return Number(v || 0).toLocaleString("en-IN");
}

/* ---------------------------------------------------------------------- */
/* Modal overlay wrapper — fixes the "opens at top of page" problem by     */
/* rendering the form/history as a centered, fixed-position pop-up with    */
/* its own scroll region, instead of an inline block in the page flow.     */
/* ---------------------------------------------------------------------- */
function ModalOverlay({ onClose, children }) {
  useEffect(() => {
    // Lock background scroll while a modal is open
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, []);

  useEffect(() => {
    function onKeyDown(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-3xl sm:my-0"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default function PlayersPage() {
  const { auctionId } = useParams();
  const [auction, setAuction] = useState(null);
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState(emptyPlayer);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [correctionPlayer, setCorrectionPlayer] = useState(null);
  const [correction, setCorrection] = useState(emptyCorrection);
  const [historyPlayer, setHistoryPlayer] = useState(null);
  const [history, setHistory] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  async function load() {
    try {
      setError("");
      const [dash, playerRes, teamRes] = await Promise.all([
        api.get(`/auctions/${auctionId}/dashboard`),
        api.get(`/players/auction/${auctionId}`),
        api.get(`/teams/auction/${auctionId}`),
      ]);
      setAuction(dash.data.auction);
      setPlayers(playerRes.data);
      setTeams(teamRes.data);
      if (playerRes.data.length > 0) {
        setSelectedPlayer(playerRes.data[0]);
      }
    } catch (err) {
      console.error("load players error", err);
      setError(err.response?.data?.message || "Failed to load players");
    }
  }

  useEffect(() => { load(); }, [auctionId]);

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((player) => {
      const statusMatch = status === "ALL" || player.status === status;
      const textMatch = !q || [player.player_name, player.player_mobile, player.category, player.player_role, player.area, player.sold_team_name].join(" ").toLowerCase().includes(q);
      return statusMatch && textMatch;
    });
  }, [players, search, status]);

  const counts = useMemo(() => {
    return {
      total: players.length,
      available: players.filter((p) => p.status === "AVAILABLE").length,
      sold: players.filter((p) => p.status === "SOLD").length,
      unsold: players.filter((p) => p.status === "UNSOLD" || p.status === "FINAL_UNSOLD").length,
    };
  }, [players]);

  function downloadTemplate() {
    const rows = [
      { "Player Name": "Rahul Jain", Mobile: "9111111111", Email: "", Category: "A", Role: "ALL_ROUNDER", "Base Price": 500, "T-shirt Size": "XL", Age: 31, Area: "Bhayander", "Previous Team": "", "Photo URL": "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=300&auto=format&fit=crop" },
      { "Player Name": "Priya Sharma", Mobile: "9222222222", Email: "", Category: "B", Role: "BATSMAN", "Base Price": 300, "T-shirt Size": "M", Age: 25, Area: "Andheri", "Previous Team": "", "Photo URL": "https://drive.google.com/file/d/YOUR_FILE_ID_HERE/view?usp=sharing" },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Players");
    XLSX.writeFile(wb, "sportzmitra-players-template.xlsx");
  }

  function openAdd() { setEditingPlayer(null); setForm(emptyPlayer); setShowForm(true); }
  function openEdit(player) { setEditingPlayer(player); setForm({ ...emptyPlayer, ...player, base_price: player.base_price || "", age: player.age || "" }); setShowForm(true); }

  async function savePlayer(event) {
    event.preventDefault();
    try {
      setError("");
      const payload = { ...form, auction_id: Number(auctionId), base_price: Number(form.base_price || 0) };
      if (editingPlayer) {
        await api.put(`/players/${editingPlayer.id}`, payload);
        setMessage("Player updated successfully.");
      } else {
        await api.post("/players", payload);
        setMessage("Player added successfully.");
      }
      setForm(emptyPlayer); setEditingPlayer(null); setShowForm(false); load();
    } catch (err) {
      console.error("save player error", err);
      setError(err.response?.data?.message || "Failed to save player");
    }
  }

  async function uploadPlayers(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      setError(""); const fd = new FormData(); fd.append("file", file);
      const res = await api.post(`/players/upload/${auctionId}`, fd);
      const failed = Number(res.data?.failed || 0);
      setMessage(failed ? `Players uploaded: ${res.data.count}, failed rows: ${failed}` : "Players uploaded successfully");
      load();
    } catch (err) { console.error("upload players error", err); setError(err.response?.data?.message || "Failed to upload players"); }
    finally { event.target.value = ""; }
  }

  async function uploadPhoto(file) {
    if (!file) return;
    try {
      setUploadingPhoto(true); setError(""); const fd = new FormData(); fd.append("photo", file);
      const res = await api.post("/players/upload-photo", fd);
      setForm((prev) => ({ ...prev, photo_url: res.data.photo_url, original_photo_url: res.data.original_photo_url || "", photo_processing_status: res.data.photo_processing_status || "", photo_processing_mode: res.data.photo_processing_mode || "" }));
      setMessage("Photo uploaded successfully.");
    } catch (err) { console.error("upload photo error", err); setError(err.response?.data?.message || "Failed to upload photo"); }
    finally { setUploadingPhoto(false); }
  }

  function openCorrection(player, statusOverride) {
    setCorrectionPlayer(player);
    setCorrection({ status: statusOverride || player.status || "AVAILABLE", sold_team_id: player.sold_team_id || "", sold_price: player.sold_price || "", auction_round: player.auction_round || "MAIN", category: player.category || "", player_role: player.player_role || "", base_price: player.base_price || "", tshirt_size: player.tshirt_size || "", reason: "" });
  }

  async function saveCorrection(event) {
    event.preventDefault();
    try {
      setError("");
      await api.patch(`/players/${correctionPlayer.id}/correction`, { ...correction, sold_price: Number(correction.sold_price || 0), sold_team_id: correction.sold_team_id ? Number(correction.sold_team_id) : null, base_price: correction.base_price === "" ? null : Number(correction.base_price) });
      setMessage("Player correction saved.");
      setCorrectionPlayer(null); setCorrection(emptyCorrection); load();
    } catch (err) { console.error("correction error", err); setError(err.response?.data?.message || "Failed to save correction"); }
  }

  async function openHistory(player) {
    setHistoryPlayer(player); setHistory(null);
    try { const res = await api.get(`/players/${player.id}/history`); setHistory(res.data); }
    catch (err) { setError(err.response?.data?.message || "Failed to load history"); }
  }

  const activeFocusPlayer = selectedPlayer || filteredPlayers[0];

  return (
    <AdminLayout title="Players" subtitle={auction?.auction_name || "Manage auction players"} active="Players" auctionId={auctionId} organizationId={auction?.organization_id} publicSlug={auction?.public_slug}>
      <div className="min-h-screen bg-white p-4 sm:p-6 lg:p-8 font-sans text-slate-900">
        <div className="mx-auto max-w-7xl space-y-6">

          {/* Header */}
          <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-pink-600">Player Registry</div>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                {auction?.auction_name || "Player Pool"}
              </h1>
            </div>

            {/* Stat rail */}
            <div className="flex items-stretch divide-x divide-slate-200 rounded-xl border border-slate-200">
              <StatCell label="Total" value={counts.total} />
              <StatCell label="Available" value={counts.available} accent="text-emerald-600" />
              <StatCell label="Sold" value={counts.sold} accent="text-pink-600" />
              <StatCell label="Unsold" value={counts.unsold} accent="text-slate-400" />
            </div>
          </div>

          {/* Filter Bar & Quick Actions */}
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search player, role, team..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                />
              </div>

              {/* Status chips — a single horizontally-scrollable row on
                  mobile (no wrapping onto uneven lines); reverts to a
                  normal wrapping row once there's enough width from md up. */}
              <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
                {["ALL", "AVAILABLE", "SOLD", "UNSOLD", "FINAL_UNSOLD", "WITHDRAWN"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatus(st)}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      status === st
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {st.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick actions — equal 3-column grid on mobile so labels stay
                on one line and all three buttons match height; reverts to
                the original inline row from sm: up. */}
            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
              <button
                onClick={openAdd}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-600 px-2.5 py-2.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700 sm:gap-2 sm:px-4 sm:text-sm"
              >
                <Plus size={15} className="shrink-0 sm:hidden" />
                <Plus size={16} className="hidden shrink-0 sm:block" />
                Add Player
              </button>
              <button
                onClick={downloadTemplate}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:gap-2 sm:px-4 sm:text-sm"
              >
                <Download size={15} className="shrink-0 sm:hidden" />
                <Download size={16} className="hidden shrink-0 sm:block" />
                Template
              </button>
              <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-pink-600 px-2.5 py-2.5 text-[11px] font-semibold text-white transition hover:bg-pink-700 sm:gap-2 sm:px-4 sm:text-sm">
                <Upload size={15} className="shrink-0 sm:hidden" />
                <Upload size={16} className="hidden shrink-0 sm:block" />
                Upload Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={uploadPlayers} />
              </label>
            </div>
          </div>

          {/* Feedback Banners */}
          {message && (
            <div className="rounded-xl border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-xl border-l-4 border-pink-500 bg-pink-50 px-4 py-3 text-sm font-medium text-pink-800">
              {error}
            </div>
          )}

          {/* Modal Overlays — now pop up centered over the page instead of
              being inserted inline into the page flow */}
          {showForm && (
            <ModalOverlay onClose={() => { setShowForm(false); setEditingPlayer(null); setForm(emptyPlayer); }}>
              <PlayerForm
                title={editingPlayer ? "Edit Player" : "Add Player"}
                form={form}
                setForm={setForm}
                onSubmit={savePlayer}
                onClose={() => { setShowForm(false); setEditingPlayer(null); setForm(emptyPlayer); }}
                onPhotoUpload={uploadPhoto}
                uploadingPhoto={uploadingPhoto}
              />
            </ModalOverlay>
          )}
          {correctionPlayer && (
            <ModalOverlay onClose={() => setCorrectionPlayer(null)}>
              <CorrectionModal
                player={correctionPlayer}
                teams={teams}
                correction={correction}
                setCorrection={setCorrection}
                onSubmit={saveCorrection}
                onClose={() => setCorrectionPlayer(null)}
              />
            </ModalOverlay>
          )}
          {historyPlayer && (
            <ModalOverlay onClose={() => setHistoryPlayer(null)}>
              <HistoryModal
                player={historyPlayer}
                history={history}
                onClose={() => setHistoryPlayer(null)}
              />
            </ModalOverlay>
          )}

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* Left Column: Focus player rendered as an auction lot ticket */}
            <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-6">
              {activeFocusPlayer ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-start justify-between gap-3 p-5">
                    <div className="flex items-start gap-4">
                      <img
                        src={activeFocusPlayer.photo_url || DEFAULT_PLAYER_IMAGE}
                        alt={activeFocusPlayer.player_name}
                        className="h-16 w-16 rounded-xl border border-slate-200 object-cover"
                        onError={(e) => { e.currentTarget.src = DEFAULT_PLAYER_IMAGE; }}
                      />
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Lot #{activeFocusPlayer.id}</span>
                        <h2 className="text-xl font-black tracking-tight text-slate-900">
                          {activeFocusPlayer.player_name}
                        </h2>
                      </div>
                    </div>
                    <StatusBadge status={activeFocusPlayer.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-4 px-5 pb-5 text-sm">
                    <InfoField label="Role" value={activeFocusPlayer.player_role} />
                    <InfoField label="Category" value={activeFocusPlayer.category} />
                    <InfoField label="Mobile" value={activeFocusPlayer.player_mobile} />
                    <InfoField label="Area" value={activeFocusPlayer.area} />
                    <div className="col-span-2">
                      <InfoField label="Previous / assigned team" value={activeFocusPlayer.previous_team || "None"} />
                    </div>
                  </div>

                  <TicketPerforation />

                  {/* Price block — flat, no gradient; the one bold moment */}
                  <div className="bg-slate-900 px-5 py-6 text-center">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {activeFocusPlayer.status === "SOLD" ? "Final sold price" : "Base price"}
                    </span>
                    <span className="mt-1.5 block font-mono text-4xl font-black tabular-nums text-emerald-400">
                      ₹{money(activeFocusPlayer.sold_price || activeFocusPlayer.base_price)}
                    </span>
                  </div>

                  <div className="flex gap-2 p-4">
                    <button
                      onClick={() => openEdit(activeFocusPlayer)}
                      className="flex-1 inline-flex justify-center items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <Edit3 size={14} /> Edit
                    </button>
                    <button
                      onClick={() => openCorrection(activeFocusPlayer)}
                      className="flex-1 inline-flex justify-center items-center gap-1.5 rounded-lg border border-pink-200 bg-pink-50 py-2.5 text-xs font-semibold text-pink-700 transition hover:bg-pink-100"
                    >
                      <Wrench size={14} /> Correct
                    </button>
                    <button
                      onClick={() => openHistory(activeFocusPlayer)}
                      className="flex-1 inline-flex justify-center items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <History size={14} /> History
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm font-medium text-slate-400">
                  No player selected.
                </div>
              )}
            </div>

            {/* Right Column: Player Cards Grid */}
            <div className="lg:col-span-7 xl:col-span-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredPlayers.map((player, idx) => {
                  const isSelected = activeFocusPlayer?.id === player.id;
                  return (
                    <div
                      key={player.id}
                      onClick={() => setSelectedPlayer(player)}
                      className={`relative flex items-stretch gap-4 rounded-xl border p-3.5 transition cursor-pointer ${
                        isSelected
                          ? "border-pink-500 bg-pink-50/60"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="relative w-20 h-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        <img
                          src={player.photo_url || DEFAULT_PLAYER_IMAGE}
                          alt={player.player_name}
                          className="h-full w-full object-cover object-center"
                          onError={(e) => { e.currentTarget.src = DEFAULT_PLAYER_IMAGE; }}
                        />
                        <div className="absolute top-1 left-1 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {idx + 1}
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col justify-between min-w-0 py-0.5">
                        <div className="space-y-0.5">
                          <h3 className="text-sm font-bold text-slate-900 truncate">
                            {player.player_name}
                          </h3>
                          <p className="truncate text-xs font-semibold text-slate-600">{player.player_role || "—"}</p>
                          <p className="truncate text-xs text-slate-400">
                            {player.category || "—"} &middot; {player.previous_team || "No previous team"}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                          <span className="font-mono font-bold text-slate-900 text-sm tabular-nums">
                            ₹{money(player.base_price)}
                          </span>
                          <StatusBadge status={player.status} />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredPlayers.length === 0 && (
                  <div className="col-span-full rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm font-medium text-slate-400">
                    No players match the current criteria.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCell({ label, value, accent = "text-slate-900" }) {
  return (
    <div className="px-4 py-2.5 text-center first:pl-4 last:pr-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`font-mono text-lg font-black tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}

function TicketPerforation() {
  return (
    <div className="relative">
      <div className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white border border-slate-200" />
      <div className="mx-5 border-t border-dashed border-slate-300" />
      <div className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white border border-slate-200" />
    </div>
  );
}

function InfoField({ label, value }) {
  return (
    <div>
      <span className="block text-[11px] font-medium text-slate-400">{label}</span>
      <span className="font-semibold text-slate-900">{value || "—"}</span>
    </div>
  );
}

function PlayerForm({ title, form, setForm, onSubmit, onClose, onPhotoUpload, uploadingPhoto }) {
  function set(key, value) { setForm({ ...form, [key]: value }); }
  return (
    <form onSubmit={onSubmit} className="max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
      <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">Enter player details for the master list.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50">
          <X size={18} />
        </button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-[140px_1fr]">
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <img
            src={form.photo_url || DEFAULT_PLAYER_IMAGE}
            alt="Preview"
            className="w-20 h-24 rounded-lg object-cover border border-slate-200"
            onError={(e) => { e.currentTarget.src = DEFAULT_PLAYER_IMAGE; }}
          />
          <span className="mt-2 text-[11px] font-medium text-slate-400">Image preview</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Photo URL" value={form.photo_url} onChange={(v) => set("photo_url", v)} placeholder="https://example.com/photo.jpg" />
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Manual photo upload</span>
            <span className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700">
              <ImagePlus size={16} />
              {uploadingPhoto ? "Uploading..." : "Upload file"}
              <input disabled={uploadingPhoto} type="file" accept="image/*" className="hidden" onChange={(e) => onPhotoUpload(e.target.files?.[0])} />
            </span>
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Input label="Player Name" value={form.player_name} onChange={(v) => set("player_name", v)} required />
        <Input label="Mobile" value={form.player_mobile} onChange={(v) => set("player_mobile", v)} />
        <Input label="Email" value={form.player_email} onChange={(v) => set("player_email", v)} />
        <Input label="Category" value={form.category} onChange={(v) => set("category", v)} />
        <Input label="Role" value={form.player_role} onChange={(v) => set("player_role", v)} />
        <Input label="Base Price" type="number" value={form.base_price} onChange={(v) => set("base_price", v)} required />
        <Input label="T-shirt Size" value={form.tshirt_size} onChange={(v) => set("tshirt_size", v)} />
        <Input label="Age" type="number" value={form.age} onChange={(v) => set("age", v)} />
        <Input label="Area" value={form.area} onChange={(v) => set("area", v)} />
        <Input label="Previous Team" value={form.previous_team} onChange={(v) => set("previous_team", v)} />
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700">
          <Save size={16} /> Save Player
        </button>
      </div>
    </form>
  );
}

function CorrectionModal({ player, teams, correction, setCorrection, onSubmit, onClose }) {
  function set(key, value) { setCorrection({ ...correction, [key]: value }); }
  return (
    <form onSubmit={onSubmit} className="max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
      <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-pink-700">Correction: {player.player_name}</h3>
          <p className="text-sm text-slate-500">Update status or team assignment. A reason is required.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50">
          <X size={18} />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Status</span>
          <select value={correction.status} onChange={(e) => set("status", e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-500/15">
            <option value="AVAILABLE">AVAILABLE</option>
            <option value="UNSOLD">UNSOLD</option>
            <option value="FINAL_UNSOLD">FINAL_UNSOLD</option>
            <option value="SOLD">SOLD</option>
            <option value="WITHDRAWN">WITHDRAWN</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Sold Team</span>
          <select value={correction.sold_team_id || ""} onChange={(e) => set("sold_team_id", e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-500/15">
            <option value="">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.team_name} — Left ₹{money(t.remaining_purse)}</option>
            ))}
          </select>
        </label>
        <Input label="Sold Amount" type="number" value={correction.sold_price} onChange={(v) => set("sold_price", v)} />
        <Input label="Reason *" value={correction.reason} onChange={(v) => set("reason", v)} required />
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-700">
          <Wrench size={16} /> Save Correction
        </button>
      </div>
    </form>
  );
}

function HistoryModal({ player, history, onClose }) {
  return (
    <div className="max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
      <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
        <h3 className="text-lg font-bold text-slate-900">History: {player.player_name}</h3>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50">
          <X size={18} />
        </button>
      </div>
      {!history ? (
        <p className="py-8 text-center text-sm font-medium text-slate-400">Loading history...</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <HistoryList title="Actions" rows={history.actions} />
          <HistoryList title="Attempts" rows={history.attempts} />
          <HistoryList title="Bids" rows={history.bids} />
        </div>
      )}
    </div>
  );
}

function HistoryList({ title, rows = [] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="space-y-2 text-xs">
        {rows.length === 0 && <div className="py-2 text-slate-400">No records found</div>}
        {rows.map((r, i) => (
          <div key={r.id || i} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="font-semibold text-slate-900">{r.action_type || r.result || r.team_name || `Bid ₹${r.bid_amount}`}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">{r.reason || r.created_at}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      <input
        required={required}
        type={type}
        value={value || ""}
        placeholder={placeholder || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
      />
    </label>
  );
}