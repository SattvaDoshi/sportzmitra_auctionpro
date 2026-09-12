import {
  Download,
  Plus,
  Save,
  Search,
  Trash2,
  X,
  ArrowRight,
  CheckSquare,
  Square,
  Edit2,
  Users,
  Wallet,
  Shirt,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import AdminLayout from "../components/layout/AdminLayout";
import LogoPicker from "../components/ui/LogoPicker";
import TeamLogo from "../components/ui/TeamLogo";
import api from "../api/api";

const emptyTeam = {
  team_name: "",
  short_name: "",
  owner_name: "",
  owner_mobile: "",
  total_purse: "",
  remaining_purse: "",
  player_limit: "",
  logo_url: "",
  team_whatsapp_group_link: "",
  status: "ACTIVE",
};

const DEFAULT_MAX_SQUAD = 18;

// Fallback high-quality sports logos hosted online
const DEFAULT_LOGOS = [
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80",
  "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=120&q=80",
  "https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=120&q=80",
  "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=120&q=80",
];

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function initials(teamName = "TEAM") {
  const words = String(teamName)
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export default function TeamsPage() {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const [auction, setAuction] = useState(null);
  const [teams, setTeams] = useState([]);
  const [recentTeams, setRecentTeams] = useState([]);
  const [form, setForm] = useState(emptyTeam);
  const [editingTeam, setEditingTeam] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [maxBidMap, setMaxBidMap] = useState({});

  async function load() {
    try {
      const [dash, teamRes, recentRes, mbRes] = await Promise.all([
        api.get(`/auctions/${auctionId}/dashboard`),
        api.get(`/teams/auction/${auctionId}`),
        api.get(`/teams/recent`).catch(() => ({ data: [] })),
        api.get(`/live/${auctionId}/max-bid?absolute=true`).catch(() => ({ data: { maxBidMap: {} } })),
      ]);
      setAuction(dash.data.auction);
      setTeams(teamRes.data || []);
      setRecentTeams(recentRes.data || []);
      setMaxBidMap(mbRes.data?.maxBidMap || {});
    } catch (err) {
      console.error("Failed to load auction context", err);
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [auctionId]);

  useEffect(() => {
    setSelectedTeamIds((current) =>
      current.filter((id) => teams.some((team) => Number(team.id) === Number(id)))
    );
  }, [teams]);

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((team) =>
      [
        team.team_name,
        team.short_name,
        team.owner_name,
        team.owner_mobile,
        team.team_whatsapp_group_link,
        initials(team.team_name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [teams, search]);

  const filteredTeamIds = useMemo(
    () => filteredTeams.map((team) => Number(team.id)),
    [filteredTeams]
  );
  const allFilteredSelected =
    filteredTeamIds.length > 0 &&
    filteredTeamIds.every((id) => selectedTeamIds.includes(id));

  const totalPurseRemaining = teams.reduce(
    (sum, team) => sum + Number(team.remaining_purse ?? team.total_purse ?? 0),
    0
  );
  const totalPlayers = teams.reduce(
    (sum, team) => sum + Number(team.players_bought || team.sold_players_count || 0),
    0
  );

  function toggleTeamSelection(teamId) {
    const id = Number(teamId);
    setSelectedTeamIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedTeamIds((current) =>
        current.filter((id) => !filteredTeamIds.includes(id))
      );
      return;
    }
    setSelectedTeamIds((current) =>
      Array.from(new Set([...current, ...filteredTeamIds]))
    );
  }

  async function deleteSelectedTeams() {
    setMessage("");
    setError("");

    if (selectedTeamIds.length === 0) {
      setError("Please select at least one team");
      return;
    }

    const confirmation = window.prompt(
      `Delete ${selectedTeamIds.length} selected team${
        selectedTeamIds.length === 1 ? "" : "s"
      }?\n\nType DELETE to confirm.`
    );

    if (confirmation !== "DELETE") return;

    try {
      const response = await api.post("/teams/bulk-delete", {
        teamIds: selectedTeamIds,
      });
      setMessage(response.data?.message || "Selected teams deleted successfully");
      setSelectedTeamIds([]);
      setSelectionMode(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete selected teams");
    }
  }

  function resetForm() {
    setForm(emptyTeam);
    setEditingTeam(null);
    setShowForm(false);
  }

  function downloadTemplate() {
    const rows = [
      {
        "Team Name": "Royal Strikers",
        "Owner Name": "John Doe",
        "Owner Mobile": "9876543210",
        "Total Purse": 50000,
        "Logo URL": "",
        "WhatsApp Group Link": "",
      },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Teams");
    XLSX.writeFile(wb, "sportzmitra-teams-template.xlsx");
  }

  async function saveTeam(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    const payload = {
      ...form,
      auction_id: Number(auctionId),
      total_purse: Number(form.total_purse || 0),
      remaining_purse:
        form.remaining_purse === ""
          ? undefined
          : Number(form.remaining_purse || 0),
      player_limit:
        form.player_limit === ""
          ? undefined
          : Number(form.player_limit || 0),
    };

    try {
      if (editingTeam) {
        await api.put(`/teams/${editingTeam.id}`, payload);
        setMessage("Team details updated successfully");
      } else {
        await api.post("/teams", payload);
        setMessage("New team registered successfully");
      }

      resetForm();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save team details");
    }
  }

  function openEditTeamModal(team, e) {
    e.stopPropagation();
    setEditingTeam(team);
    setForm({
      ...emptyTeam,
      ...team,
      total_purse: team.total_purse ?? "",
      remaining_purse: team.remaining_purse ?? "",
      max_squad_size: team.max_squad_size ?? "",
    });
    setShowForm(true);
  }

  async function deleteTeam(team) {
    setMessage("");
    setError("");

    const ok = window.confirm(`Are you sure you want to delete ${team.team_name}?`);
    if (!ok) return;

    try {
      await api.delete(`/teams/${team.id}`);
      setMessage("Team removed successfully");
      resetForm();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete team");
    }
  }

  async function uploadTeams(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    setError("");

    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/teams/upload/${auctionId}`, fd);
      setMessage("Teams batch imported successfully");
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to import excel file");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <AdminLayout
      title="Teams"
      subtitle="Manage teams, purse and players"
      active="Teams"
      auctionId={auctionId}
      organizationId={auction?.organization_id}
      publicSlug={auction?.public_slug}
    >
      <div className="min-h-screen bg-gradient-to-b from-[#FFF5F7] to-white px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EC008C] to-[#c4006f] text-white shadow-lg shadow-pink-200">
                <Shirt size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Teams
                </h1>
                <p className="mt-0.5 text-xs font-medium text-slate-500 sm:text-sm">
                  Manage teams, purse and players
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-72">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300"
                  size={16}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search teams..."
                  className="w-full rounded-full border border-slate-100 bg-white py-2.5 pl-10 pr-4 text-xs shadow-sm outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowForm(true);
                    setEditingTeam(null);
                    setForm(emptyTeam);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#EC008C] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-pink-200 transition hover:bg-[#d4007d] active:scale-95"
                >
                  <Plus size={16} /> Add Team
                </button>

                <button
                  onClick={downloadTemplate}
                  title="Download Excel template"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:bg-slate-50"
                >
                  <Download size={16} />
                </button>

                <label
                  title="Bulk import teams"
                  className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:bg-slate-50"
                >
                  <UploadCloud size={16} />
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={uploadTeams}
                  />
                </label>

                <button
                  onClick={() => {
                    setSelectionMode((v) => !v);
                    setSelectedTeamIds([]);
                  }}
                  className={`hidden items-center justify-center rounded-xl border px-3 py-2.5 text-xs font-bold transition sm:inline-flex ${
                    selectionMode
                      ? "border-pink-300 bg-pink-50 text-[#EC008C]"
                      : "border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                  }`}
                >
                  {selectionMode ? "Cancel" : "Manage"}
                </button>
              </div>
            </div>
          </div>

          {/* Stat summary */}
          {!pageLoading && teams.length > 0 && (
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                icon={Users}
                label="Teams registered"
                value={teams.length}
                tint="bg-pink-50 text-[#EC008C]"
              />
              <StatCard
                icon={Wallet}
                label="Purse remaining (all teams)"
                value={`₹${formatAmount(totalPurseRemaining)}`}
                tint="bg-emerald-50 text-emerald-600"
              />
              <StatCard
                icon={Shirt}
                label="Players bought so far"
                value={totalPlayers}
                tint="bg-sky-50 text-sky-600"
              />
            </div>
          )}

          {/* Notifications */}
          {message && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800">
              {message}
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          {/* Selection Toolbar */}
          {selectionMode && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <button
                onClick={toggleSelectAllFiltered}
                className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                {allFilteredSelected ? (
                  <CheckSquare size={16} className="text-[#EC008C]" />
                ) : (
                  <Square size={16} />
                )}
                Select all ({filteredTeams.length})
              </button>

              <button
                type="button"
                disabled={selectedTeamIds.length === 0}
                onClick={deleteSelectedTeams}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-40"
              >
                <Trash2 size={13} /> Delete selected ({selectedTeamIds.length})
              </button>
            </div>
          )}

          {/* Cards Grid */}
          {pageLoading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3.5">
                    <div className="h-12 w-12 animate-pulse rounded-full bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="mt-5 h-6 w-1/2 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-50">
                <Users className="text-[#EC008C]" size={26} />
              </div>
              <h3 className="mt-4 text-sm font-bold text-slate-700">No teams found</h3>
              <p className="mt-1 text-xs font-medium text-slate-400">
                {search ? "Try a different search term." : "Add a team to get started."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTeams.map((team, index) => {
                const isSelected = selectedTeamIds.includes(Number(team.id));
                const squadCount = Number(
                  team.players_bought || team.sold_players_count || 0
                );
                const maxSquad = Number(
                  team.player_limit || DEFAULT_MAX_SQUAD
                );
                const progressPct =
                  maxSquad > 0
                    ? Math.min(100, Math.round((squadCount / maxSquad) * 100))
                    : 0;

                const defaultLogo = DEFAULT_LOGOS[index % DEFAULT_LOGOS.length];
                const tmb = maxBidMap[team.id];
                const maxBidVal = tmb?.max_bid ?? null;

                return (
                  <div
                    key={team.id}
                    className={`group relative rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                      isSelected ? "ring-2 ring-[#EC008C]" : ""
                    }`}
                  >
                    {selectionMode ? (
                      <button
                        onClick={() => toggleTeamSelection(team.id)}
                        className="absolute right-4 top-4 text-slate-300 hover:text-[#EC008C]"
                      >
                        {isSelected ? (
                          <CheckSquare size={18} className="text-[#EC008C]" />
                        ) : (
                          <Square size={18} />
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => openEditTeamModal(team, e)}
                        title="Edit Team"
                        className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-slate-50 hover:text-slate-600"
                      >
                        <Edit2 size={15} />
                      </button>
                    )}

                    {/* Logo + Name + Owner */}
                    <div className="flex items-center gap-3.5">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-100 bg-slate-50 p-0.5 shadow-sm">
                        {team.logo_url ? (
                          <TeamLogo team={team} size="lg" />
                        ) : (
                          <img
                            src={defaultLogo}
                            alt={team.team_name}
                            className="h-full w-full rounded-full object-cover"
                          />
                        )}
                      </div>

                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-slate-900">
                          {team.team_name}
                        </h3>
                        {team.owner_name && (
                          <p className="truncate text-xs font-medium text-slate-400">
                            {team.owner_name}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Purse + Max Bid */}
                    <div className="mt-4">
                      <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                        ₹ {formatAmount(team.remaining_purse ?? team.total_purse)}
                      </div>
                      {maxBidVal !== null && (
                        <div className={`mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-black ${
                          maxBidVal === 0
                            ? "bg-red-50 border border-red-200 text-red-600"
                            : "bg-emerald-50 border border-emerald-200 text-emerald-700"
                        }`}>
                          <span className="uppercase tracking-wider text-[10px]">Max Bid</span>
                          <span>{maxBidVal === 0 ? "LOCKED" : `₹${formatAmount(maxBidVal)}`}</span>
                        </div>
                      )}
                    </div>

                    {/* Players & Limit */}
                    <div className="mt-1 flex items-center justify-between text-xs font-semibold text-slate-400">
                      <span>Players</span>
                      <span className="text-slate-700">
                        {squadCount} / {maxSquad} limit
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    {/* View Players Button */}
                    <button
                      onClick={() =>
                        navigate(`/admin/auctions/${auctionId}/players?teamId=${team.id}`)
                      }
                      className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#EC008C] transition hover:text-[#d4007d]"
                    >
                      View Players
                      <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Registration / Edit Form */}
        {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
              <div className="w-full max-w-xl">
                <TeamForm
                  form={form}
                  setForm={setForm}
                  onSubmit={saveTeam}
                  onClose={resetForm}
                  onDelete={editingTeam ? () => deleteTeam(editingTeam) : undefined}
                  editing={!!editingTeam}
                />
              </div>
            </div>
          )}
          {/* Quick Recent Teams */}
          {recentTeams.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {recentTeams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="rounded-full bg-pink-100 px-3 py-1 text-xs font-medium text-pink-700"
                  onClick={() => {
                    setEditingTeam(null);
                    setForm({ ...emptyTeam, team_name: t.team_name, short_name: t.short_name || "", owner_name: t.owner_name || "", owner_mobile: t.owner_mobile || "", total_purse: t.total_purse, remaining_purse: t.remaining_purse, player_limit: t.player_limit, logo_url: t.logo_url, team_whatsapp_group_link: t.team_whatsapp_group_link });
                    setShowForm(true);
                  }}
                >
                  {t.team_name}
                </button>
              ))}
            </div>
          )}
      </div>
    </AdminLayout>
  );
}

function StatCard({ icon: Icon, label, value, tint }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon size={19} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-lg font-extrabold leading-tight text-slate-900">
          {value}
        </span>
        <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </span>
      </span>
    </div>
  );
}

function TeamForm({ form, setForm, onSubmit, onClose, onDelete, editing }) {
  function set(key, value) {
    setForm({ ...form, [key]: value });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 text-slate-800 shadow-2xl sm:p-8"
    >
      <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            {editing ? "Edit Team Details" : "Register New Team"}
          </h3>
          <p className="text-xs font-medium text-slate-400">
            Configure squad parameters and purse allocation
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput
            label="Team Name *"
            value={form.team_name}
            onChange={(val) => set("team_name", val)}
            required
          />
          <FormInput
            label="Short Name / Initials"
            value={form.short_name || ""}
            onChange={(val) => set("short_name", val)}
          />
          <FormInput
            label="Owner Name"
            value={form.owner_name || ""}
            onChange={(val) => set("owner_name", val)}
          />
          <FormInput
            label="Owner Mobile"
            value={form.owner_mobile || ""}
            onChange={(val) => set("owner_mobile", val)}
          />
          <FormInput
            label="Total Purse (₹) *"
            type="number"
            value={form.total_purse || ""}
            onChange={(val) => set("total_purse", val)}
            required
          />

        {editing && (
            <FormInput
              label="Remaining Purse (₹)"
              type="number"
              value={form.remaining_purse || ""}
              onChange={(val) => set("remaining_purse", val)}
            />
          )}

          <FormInput
            label="Player Limit"
            type="number"
            value={form.player_limit || ""}
            onChange={(val) => set("player_limit", val)}
          />

        <FormInput
          label="WhatsApp Group Link"
          value={form.team_whatsapp_group_link || ""}
          onChange={(val) => set("team_whatsapp_group_link", val)}
        />

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-bold text-slate-700">
            Team Logo
          </label>
          <LogoPicker
            value={form.logo_url || ""}
            onChange={(val) => set("logo_url", val)}
          />
        </div>
      </div>

      <div className="mt-8 flex flex-col-reverse items-center justify-end gap-3 border-t border-slate-100 pt-4 sm:flex-row">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-600 transition hover:bg-rose-100 sm:mr-auto sm:w-auto"
          >
            <Trash2 size={15} /> Delete Team
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200 sm:w-auto"
        >
          Cancel
        </button>
        <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#EC008C] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-pink-200 transition hover:bg-[#d4007d] active:scale-95 sm:w-auto">
          <Save size={15} /> Save Team
        </button>
      </div>
    </form>
  );
}

function FormInput({ label, value, onChange, type = "text", required }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-700">
        {label}
      </span>
      <input
        required={required}
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none transition focus:border-[#EC008C] focus:bg-white focus:ring-2 focus:ring-pink-100"
      />
    </label>
  );
}