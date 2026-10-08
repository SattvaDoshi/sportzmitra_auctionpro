import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CalendarDays,
  Edit,
  Gavel,
  Plus,
  PowerOff,
  Upload,
  X,
  MapPin,
  Search,
  IndianRupee,
  Wallet,
  Radio,
  Clock,
  CheckCircle2,
  LayoutGrid,
} from "lucide-react";
import AdminLayout from "../components/layout/AdminLayout";
import ConfirmDeleteModal from "../components/ui/ConfirmDeleteModal";
import api from "../api/api";
import { getImageUrl } from "../utils/imageUrl";

// Online placeholder logos for immediate display
const DEFAULT_AUCTION_LOGO = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80";
const DEFAULT_SPONSOR_LOGO = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80";

const emptyCategory = {
  category_name: "A",
  base_price: 0,
  bid_increment: 100,
  display_order: 1,
  max_players_per_team: 0,
};

const emptyForm = {
  auction_name: "",
  auction_date: "",
  venue: "",
  auction_logo_url: DEFAULT_AUCTION_LOGO,
  sponsor_logo_url: DEFAULT_SPONSOR_LOGO,
  sponsor_logo_urls: DEFAULT_SPONSOR_LOGO,
  auction_type: "GENERAL",
  category_flow: "CATEGORY_UNSOLD_AFTER_EACH_CATEGORY",
  auction_flow_type: "GENERAL",
  default_base_price: 0,
  total_purse_per_team: 10000,
  players_per_team: 11,
  minimum_bid_increment: 100,
  next_player_selection_mode: "RANDOM_WITH_ADMIN_CONFIRM",
  categories: [emptyCategory],
  status: "DRAFT",
};

function splitSponsorUrls(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinSponsorUrls(urls) {
  return [
    ...new Set((urls || []).map((item) => String(item).trim()).filter(Boolean)),
  ].join(",");
}

function normalizeAuctionForEdit(auction, categories = []) {
  const flow = auction.category_flow || auction.auction_flow_type || "GENERAL";
  const auctionType =
    auction.auction_type === "CATEGORY_WISE" || String(flow).startsWith("CATEGORY")
      ? "CATEGORY_WISE"
      : "GENERAL";

  return {
    ...emptyForm,
    ...auction,
    auction_logo_url: auction.auction_logo_url || DEFAULT_AUCTION_LOGO,
    sponsor_logo_urls: auction.sponsor_logo_urls || DEFAULT_SPONSOR_LOGO,
    auction_type: auctionType,
    auction_flow_type: auctionType === "CATEGORY_WISE" ? flow : "GENERAL",
    category_flow:
      auctionType === "CATEGORY_WISE"
        ? flow
        : "CATEGORY_UNSOLD_AFTER_EACH_CATEGORY",
    players_per_team:
      auction.players_per_team ||
      auction.max_players_per_team ||
      auction.min_players_per_team ||
      0,
    default_base_price: auction.default_base_price || 0,
    auction_date: auction.auction_date
      ? String(auction.auction_date).slice(0, 10)
      : "",
    categories: categories.length ? categories : [emptyCategory],
  };
}

function buildPayload(form, organizationId) {
  const isCategoryWise = form.auction_type === "CATEGORY_WISE";
  const flow = isCategoryWise
    ? form.category_flow || "CATEGORY_UNSOLD_AFTER_EACH_CATEGORY"
    : "GENERAL";

  return {
    ...form,
    organization_id: organizationId ? Number(organizationId) : undefined,
    auction_type: isCategoryWise ? "CATEGORY_WISE" : "GENERAL",
    auction_flow_type: flow,
    category_flow: isCategoryWise ? flow : null,
    total_purse_per_team: Number(form.total_purse_per_team || 0),
    default_base_price: Number(form.default_base_price || 0),
    players_per_team: Number(form.players_per_team || 0),
    min_players_per_team: Number(form.players_per_team || 0),
    max_players_per_team: Number(form.players_per_team || 0),
    minimum_bid_increment: Number(form.minimum_bid_increment || 100),
    auction_date: form.auction_date || null,
    auction_logo_url: form.auction_logo_url || DEFAULT_AUCTION_LOGO,
    sponsor_logo_urls: form.sponsor_logo_urls || DEFAULT_SPONSOR_LOGO,
    categories: isCategoryWise
      ? (form.categories || [])
          .map((category, index) => ({
            category_name: String(category.category_name || "").trim(),
            base_price: Number(category.base_price || 0),
            bid_increment: Number(
              category.bid_increment || form.minimum_bid_increment || 100
            ),
            display_order: Number(category.display_order || index + 1),
            max_players_per_team: Number(category.max_players_per_team || 0),
          }))
          .filter((category) => category.category_name)
      : [],
  };
}

export default function AuctionList() {
  const { organizationId } = useParams();
  const navigate = useNavigate();

  const [auctions, setAuctions] = useState([]);
  const [activeTab, setActiveTab] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editAuction, setEditAuction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [auctionToDeactivate, setAuctionToDeactivate] = useState(null);

  async function loadAuctions() {
    try {
      setError("");
      const response = await api.get(`/auctions/organization/${organizationId}`);
      setAuctions(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load auctions");
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    if (organizationId) loadAuctions();
  }, [organizationId]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({
      ...previous,
      [name]: value,
      auction_flow_type:
        name === "auction_type"
          ? value === "CATEGORY_WISE"
            ? previous.category_flow
            : "GENERAL"
          : previous.auction_flow_type,
    }));
  }

  function handleEditChange(event) {
    const { name, value } = event.target;
    setEditAuction((previous) => ({
      ...previous,
      [name]: value,
      auction_flow_type:
        name === "auction_type"
          ? value === "CATEGORY_WISE"
            ? previous.category_flow
            : "GENERAL"
          : previous.auction_flow_type,
    }));
  }

  function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? value
      : d.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  }

  function renderStatusBadge(status) {
    if (status === "LIVE") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-1 text-[10px] font-black tracking-wider text-red-600 ring-1 ring-red-500/20 ring-inset">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          LIVE
        </span>
      );
    }
    if (status === "PAUSED") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-2 py-1 text-[10px] font-black tracking-wider text-orange-600 ring-1 ring-orange-500/20 ring-inset">
          PAUSED
        </span>
      );
    }
    if (status === "READY") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-black tracking-wider text-blue-600 ring-1 ring-blue-500/20 ring-inset">
          READY
        </span>
      );
    }
    if (status === "PUBLISHED" || status === "DRAFT") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold tracking-wider text-slate-600 ring-1 ring-slate-200 ring-inset">
          DRAFT
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold tracking-wider text-emerald-600 ring-1 ring-emerald-500/20 ring-inset">
        COMPLETED
      </span>
    );
  }

  async function uploadLogoFile(file) {
    const formData = new FormData();
    formData.append("logo", file);
    const response = await api.post("/auctions/upload-logo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data.logo_url;
  }

  async function handleAuctionLogoUpload(event, mode = "create") {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLogo(true);
      setError("");
      const logoUrl = await uploadLogoFile(file);
      if (mode === "edit")
        setEditAuction((previous) => ({ ...previous, auction_logo_url: logoUrl }));
      else setForm((previous) => ({ ...previous, auction_logo_url: logoUrl }));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to upload auction logo");
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  }

  async function handleSponsorLogoUpload(event, mode = "create") {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      setUploadingLogo(true);
      setError("");
      const uploadedUrls = [];
      for (const file of files) uploadedUrls.push(await uploadLogoFile(file));

      const update = (previous) => {
        const currentUrls = splitSponsorUrls(previous.sponsor_logo_urls);
        const nextUrls = joinSponsorUrls([...currentUrls, ...uploadedUrls]);
        return {
          ...previous,
          sponsor_logo_url: previous.sponsor_logo_url || uploadedUrls[0] || "",
          sponsor_logo_urls: nextUrls,
        };
      };
      if (mode === "edit") setEditAuction(update);
      else setForm(update);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to upload sponsor logos");
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  }

  function removeSponsorLogo(url, mode = "create") {
    const update = (previous) => {
      const remaining = splitSponsorUrls(previous.sponsor_logo_urls).filter(
        (item) => item !== url
      );
      return {
        ...previous,
        sponsor_logo_urls: joinSponsorUrls(remaining),
        sponsor_logo_url:
          previous.sponsor_logo_url === url ? remaining[0] || "" : previous.sponsor_logo_url,
      };
    };
    if (mode === "edit") setEditAuction(update);
    else setForm(update);
  }

  async function createAuction(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    try {
      if (!organizationId) throw new Error("Organization ID is missing from URL");
      if (!form.auction_name.trim()) throw new Error("Auction name is required");
      await api.post("/auctions", buildPayload(form, organizationId));
      setMessage("Auction created successfully");
      setForm(emptyForm);
      setShowForm(false);
      await loadAuctions();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to create auction");
    } finally {
      setLoading(false);
    }
  }

  async function updateAuction(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    try {
      await api.put(`/auctions/${editAuction.id}`, buildPayload(editAuction));
      setMessage("Auction updated successfully");
      setEditAuction(null);
      await loadAuctions();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update auction");
    } finally {
      setLoading(false);
    }
  }

  async function openEdit(auction) {
    try {
      setError("");
      const response = await api.get(`/auctions/${auction.id}/categories`);
      setEditAuction(normalizeAuctionForEdit(auction, response.data || []));
    } catch (err) {
      setEditAuction(normalizeAuctionForEdit(auction));
    }
  }

  function makeAuctionInactive(auction) {
    setAuctionToDeactivate(auction);
  }

  async function confirmMakeAuctionInactive() {
    if (!auctionToDeactivate) return;
    try {
      setLoading(true);
      setMessage("");
      setError("");
      await api.patch(`/auctions/${auctionToDeactivate.id}/inactive`, { confirm: "INACTIVE" });
      setMessage("Auction set to inactive successfully");
      await loadAuctions();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to set auction inactive");
    } finally {
      setLoading(false);
      setAuctionToDeactivate(null);
    }
  }

  // Tab calculations
  const liveCount = auctions.filter((a) => a.status === "LIVE" || a.status === "PAUSED").length;
  const upcomingCount = auctions.filter(
    (a) => a.status === "PUBLISHED" || a.status === "READY" || a.status === "DRAFT"
  ).length;
  const completedCount = auctions.filter((a) => a.status === "COMPLETED").length;

  const filteredAuctions = auctions.filter((auction) => {
    const matchesSearch = auction.auction_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          auction.venue?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (activeTab === "LIVE") return auction.status === "LIVE" || auction.status === "PAUSED";
    if (activeTab === "UPCOMING")
      return (
        auction.status === "PUBLISHED" ||
        auction.status === "READY" ||
        auction.status === "DRAFT"
      );
    if (activeTab === "COMPLETED") return auction.status === "COMPLETED";
    return true;
  });

  const statTiles = [
    { key: "ALL", label: "All auctions", value: auctions.length, icon: LayoutGrid, tint: "text-slate-700 bg-slate-100" },
    { key: "LIVE", label: "Live now", value: liveCount, icon: Radio, tint: "text-emerald-600 bg-emerald-50" },
    { key: "UPCOMING", label: "Upcoming", value: upcomingCount, icon: Clock, tint: "text-sky-600 bg-sky-50" },
    { key: "COMPLETED", label: "Completed", value: completedCount, icon: CheckCircle2, tint: "text-slate-500 bg-slate-100" },
  ];

  return (
    <AdminLayout
      title="Auctions"
      subtitle="Create, manage and run your auctions"
      active="Auctions"
      organizationId={organizationId}
    >
      <div className="mx-auto max-w-6xl space-y-7 pb-14">
        {/* Top Header Row */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EC008C] to-[#c4006f] text-white shadow-lg shadow-pink-200">
              <Gavel size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Auctions
              </h1>
              <p className="mt-1 text-sm text-slate-500 font-medium">
                Create, manage and run your auctions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name or venue..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs shadow-sm outline-none transition focus:border-[#EC008C] focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setForm(emptyForm);
                setShowForm(true);
              }}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#EC008C] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-pink-200 transition hover:bg-[#d4007d] active:scale-95"
            >
              <Plus size={18} /> Create Auction
            </button>
          </div>
        </div>

        {/* Stat tiles / filters */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statTiles.map(({ key, label, value, icon: Icon, tint }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`group flex items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md ${
                activeTab === key
                  ? "border-[#EC008C] ring-1 ring-[#EC008C]"
                  : "border-slate-200"
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}>
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-extrabold leading-none text-slate-900">
                  {value}
                </span>
                <span className="mt-1 block truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {label}
                </span>
              </span>
            </button>
          ))}
        </div>

        {message && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={16} /> {message}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-3.5 text-xs font-semibold text-rose-600">
            {error}
          </div>
        )}

        {/* Auctions Card List */}
        <div className="space-y-4">
          {pageLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 animate-pulse rounded-xl bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredAuctions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-14 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-50">
                <Gavel className="text-[#EC008C]" size={26} />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-700">No auctions found</h3>
              <p className="mt-1 text-xs text-slate-400">
                {searchQuery
                  ? "Try a different search term."
                  : "Click \u201CCreate Auction\u201D to set up a new bidding tournament."}
              </p>
            </div>
          ) : (
            filteredAuctions.map((auction) => {
              const displayLogo = auction.auction_logo_url
                ? getImageUrl(auction.auction_logo_url)
                : DEFAULT_AUCTION_LOGO;

              const flowText =
                auction.category_flow || auction.auction_flow_type || auction.auction_type || "GENERAL";

              return (
                <div
                  key={auction.id}
                  className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg sm:p-6"
                >
                  {/* Row 1: Header */}
                  <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <img
                        src={displayLogo}
                        alt={auction.auction_name}
                        onError={(e) => {
                          e.target.src = DEFAULT_AUCTION_LOGO;
                        }}
                        className="h-14 w-14 rounded-2xl border border-slate-100 bg-slate-50 object-cover p-1 shadow-inner"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h2 className="truncate text-base font-bold text-slate-900">
                            {auction.auction_name}
                          </h2>
                          {renderStatusBadge(auction.status)}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                          <span className="flex items-center gap-1">
                            <MapPin size={13} className="text-slate-400" />
                            {auction.venue || "Venue N/A"}
                          </span>
                          <span className="flex items-center gap-1">
                            <CalendarDays size={13} className="text-slate-400" />
                            {formatDate(auction.auction_date)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/auctions/${auction.id}/teams`)}
                        className={`rounded-xl px-5 py-2.5 text-xs font-bold transition shadow-sm active:scale-95 ${
                          auction.status === "COMPLETED"
                            ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            : "bg-[#EC008C] text-white shadow-pink-200 hover:bg-[#d4007d]"
                        }`}
                      >
                        {auction.status === "COMPLETED" ? "View" : "Open"}
                      </button>

                      <button
                        type="button"
                        onClick={() => openEdit(auction)}
                        title="Edit Auction"
                        className="rounded-xl border border-slate-200 p-2.5 text-slate-400 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                      >
                        <Edit size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => makeAuctionInactive(auction)}
                        title="Deactivate Auction"
                        className="rounded-xl border border-slate-200 p-2.5 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <PowerOff size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Row 2: Detail chips */}
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <DetailChip label="Type" value={auction.auction_type || "GENERAL"} />
                    <DetailChip label="Flow mode" value={flowText} title={flowText} />
                    <DetailChip
                      label="Base / Increment"
                      value={`₹${auction.default_base_price || 0} / ₹${auction.minimum_bid_increment || 100}`}
                      icon={IndianRupee}
                    />
                    <DetailChip
                      label="Purse / Players"
                      value={`₹${auction.total_purse_per_team || 0} · ${auction.players_per_team || 0}/team`}
                      icon={Wallet}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Confirm Deactivate Modal */}
      {auctionToDeactivate && (
        <ConfirmDeleteModal
          title="Deactivate Auction?"
          message={`Are you sure you want to make ${auctionToDeactivate.auction_name} inactive? This will hide the auction from the active list while keeping records intact.`}
          confirmText="Deactivate"
          onConfirm={confirmMakeAuctionInactive}
          onClose={() => setAuctionToDeactivate(null)}
        />
      )}

      {/* Create Modal */}
      {showForm && (
        <Modal title="Create New Auction" subtitle="Set up a new bidding tournament" onClose={() => setShowForm(false)}>
          <AuctionForm
            form={form}
            setForm={setForm}
            onChange={handleChange}
            onSubmit={createAuction}
            loading={loading}
            uploadingLogo={uploadingLogo}
            submitText="Create Auction"
            onCancel={() => setShowForm(false)}
            onAuctionLogoUpload={(event) =>
              handleAuctionLogoUpload(event, "create")
            }
            onSponsorLogoUpload={(event) =>
              handleSponsorLogoUpload(event, "create")
            }
            onRemoveSponsorLogo={(url) => removeSponsorLogo(url, "create")}
            compact
          />
        </Modal>
      )}

      {/* Edit Modal */}
      {editAuction && (
        <Modal title="Edit Auction Configuration" subtitle={editAuction.auction_name} onClose={() => setEditAuction(null)}>
          <AuctionForm
            form={editAuction}
            setForm={setEditAuction}
            onChange={handleEditChange}
            onSubmit={updateAuction}
            loading={loading}
            uploadingLogo={uploadingLogo}
            submitText="Update Auction"
            onCancel={() => setEditAuction(null)}
            onAuctionLogoUpload={(event) =>
              handleAuctionLogoUpload(event, "edit")
            }
            onSponsorLogoUpload={(event) =>
              handleSponsorLogoUpload(event, "edit")
            }
            onRemoveSponsorLogo={(url) => removeSponsorLogo(url, "edit")}
            compact
          />
        </Modal>
      )}
    </AdminLayout>
  );
}

function DetailChip({ label, value, title, icon: Icon }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {Icon && <Icon size={11} />} {label}
      </span>
      <span
        className="mt-0.5 block truncate text-xs font-bold text-slate-800"
        title={title}
      >
        {value}
      </span>
    </div>
  );
}

function AuctionForm({
  title,
  form,
  setForm,
  onChange,
  onSubmit,
  loading,
  uploadingLogo,
  submitText,
  onCancel,
  onAuctionLogoUpload,
  onSponsorLogoUpload,
  onRemoveSponsorLogo,
  compact = false,
}) {
  const sponsorUrls = splitSponsorUrls(form.sponsor_logo_urls);
  const isCategoryWise = form.auction_type === "CATEGORY_WISE";

  function updateCategory(index, key, value) {
    setForm((previous) => ({
      ...previous,
      categories: (previous.categories || []).map((category, idx) =>
        idx === index ? { ...category, [key]: value } : category
      ),
    }));
  }

  function addCategory() {
    setForm((previous) => ({
      ...previous,
      categories: [
        ...(previous.categories || []),
        {
          category_name: "",
          base_price: 0,
          bid_increment: previous.minimum_bid_increment || 100,
          display_order: (previous.categories || []).length + 1,
          max_players_per_team: 0,
        },
      ],
    }));
  }

  function removeCategory(index) {
    setForm((previous) => ({
      ...previous,
      categories: (previous.categories || []).filter((_, idx) => idx !== index),
    }));
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`${
        compact ? "" : "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      }`}
    >
      {title && (
        <div className="mb-4">
          <span className="text-xs font-black italic uppercase tracking-wider text-[#EC008C]">
            {title}
          </span>
        </div>
      )}

      <FormSection label="Basics">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Auction Name *" className="xl:col-span-2">
            <input
              name="auction_name"
              value={form.auction_name || ""}
              onChange={onChange}
              placeholder="e.g., Summer League 2026"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#EC008C] focus:ring-2 focus:ring-pink-100"
            />
          </Field>

          <Field label="Auction Date">
            <input
              type="date"
              name="auction_date"
              value={form.auction_date || ""}
              onChange={onChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#EC008C] focus:ring-2 focus:ring-pink-100"
            />
          </Field>

          <Field label="Venue / Location">
            <input
              name="venue"
              value={form.venue || ""}
              onChange={onChange}
              placeholder="e.g., Pune Sports Club"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#EC008C] focus:ring-2 focus:ring-pink-100"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection label="Auction flow">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Auction Type">
            <select
              name="auction_type"
              value={form.auction_type || "GENERAL"}
              onChange={onChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#EC008C] focus:ring-2 focus:ring-pink-100"
            >
              <option value="GENERAL">General Auction</option>
              <option value="CATEGORY_WISE">Category Wise Auction</option>
            </select>
          </Field>

          {isCategoryWise ? (
            <Field label="Category Flow Pattern" className="xl:col-span-2">
              <select
                name="category_flow"
                value={
                  form.category_flow || "CATEGORY_UNSOLD_AFTER_EACH_CATEGORY"
                }
                onChange={onChange}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#EC008C] focus:ring-2 focus:ring-pink-100"
              >
                <option value="CATEGORY_UNSOLD_AFTER_EACH_CATEGORY">
                  Unsold Round After Each Category
                </option>
                <option value="CATEGORY_UNSOLD_AT_END">
                  Unsold Round At Complete End
                </option>
              </select>
            </Field>
          ) : (
            <Field label="General Flow" className="xl:col-span-2">
              <input
                value="Standard Flow — Unsold Round at End"
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500"
              />
            </Field>
          )}

          <Field label="Next Player Selection Mode" className="xl:col-span-4">
            <select
              name="next_player_selection_mode"
              value={
                form.next_player_selection_mode || "RANDOM_WITH_ADMIN_CONFIRM"
              }
              onChange={onChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#EC008C] focus:ring-2 focus:ring-pink-100"
            >
              <option value="RANDOM_WITH_ADMIN_CONFIRM">
                Random Auto-Suggestion + Admin Confirmation
              </option>
              <option value="RANDOM">Direct Random Selection</option>
              <option value="MANUAL">Manual Admin Selection Only</option>
            </select>
          </Field>
        </div>
      </FormSection>

      <FormSection label="Money & squad">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Default Base Price (₹)">
            <input
              type="number"
              name="default_base_price"
              value={form.default_base_price || 0}
              onChange={onChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#EC008C] focus:ring-2 focus:ring-pink-100"
            />
          </Field>

          <Field label="Bid Increment Step (₹)">
            <input
              type="number"
              name="minimum_bid_increment"
              value={form.minimum_bid_increment || 0}
              onChange={onChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#EC008C] focus:ring-2 focus:ring-pink-100"
            />
          </Field>

          <Field label="Total Purse Per Team (₹)">
            <input
              type="number"
              name="total_purse_per_team"
              value={form.total_purse_per_team || 0}
              onChange={onChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#EC008C] focus:ring-2 focus:ring-pink-100"
            />
          </Field>

          <Field label="Target Players Per Team">
            <input
              type="number"
              name="players_per_team"
              value={form.players_per_team || 0}
              onChange={onChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#EC008C] focus:ring-2 focus:ring-pink-100"
            />
          </Field>

          <Field label="Status" className="xl:col-span-1">
            <select
              name="status"
              value={form.status || "DRAFT"}
              onChange={onChange}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-[#EC008C] focus:ring-4 focus:ring-[#EC008C]/10"
            >
              <option value="DRAFT">Draft</option>
              <option value="LIVE">Live</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </Field>
        </div>
      </FormSection>

      {/* Dynamic Category Configuration Table */}
      {isCategoryWise && (
        <FormSection label="Category breakdown">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Specify base prices and bid steps per custom tier.
              </p>
              <button
                type="button"
                onClick={addCategory}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#8DC63F] px-4 py-2 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-[#7db434] active:scale-95"
              >
                <Plus size={14} /> Add Category
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-400">
                    <th className="py-2.5 pr-2">Category Name</th>
                    <th className="py-2.5 pr-2">Base Price (₹)</th>
                    <th className="py-2.5 pr-2">Bid Increment (₹)</th>
                    <th className="py-2.5 pr-2">Order</th>
                    <th className="py-2.5 pr-2">Max Players</th>
                    <th className="py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {(form.categories || []).map((category, index) => (
                    <tr key={`${category.category_name}-${index}`}>
                      <td className="py-2 pr-2">
                        <input
                          value={category.category_name || ""}
                          onChange={(e) =>
                            updateCategory(index, "category_name", e.target.value)
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                          placeholder="Category Tag"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          value={category.base_price || 0}
                          onChange={(e) =>
                            updateCategory(index, "base_price", e.target.value)
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          value={category.bid_increment || 0}
                          onChange={(e) =>
                            updateCategory(index, "bid_increment", e.target.value)
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          value={category.display_order || index + 1}
                          onChange={(e) =>
                            updateCategory(
                              index,
                              "display_order",
                              e.target.value
                            )
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          value={category.max_players_per_team || 0}
                          onChange={(e) =>
                            updateCategory(
                              index,
                              "max_players_per_team",
                              e.target.value
                            )
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                        />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeCategory(index)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </FormSection>
      )}

      <FormSection label="Branding">
        <div className="grid gap-5 md:grid-cols-2">
          {/* Upload Auction Logo */}
          <div>
            <span className="mb-2 block text-xs font-semibold tracking-wider text-slate-700">
              Auction Event Logo
            </span>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-[#EC008C] hover:text-[#EC008C]">
                  <Upload size={16} /> Choose File
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    className="hidden"
                    onChange={onAuctionLogoUpload}
                    disabled={uploadingLogo}
                  />
                </label>
                {form.auction_logo_url ? (
                  <img
                    src={getImageUrl(form.auction_logo_url)}
                    alt="Auction logo preview"
                    onError={(e) => {
                      e.target.src = DEFAULT_AUCTION_LOGO;
                    }}
                    className="h-16 w-16 rounded-lg bg-white object-contain p-1 shadow-sm border border-slate-200"
                  />
                ) : (
                  <span className="text-xs font-medium text-slate-400">
                    No logo uploaded yet
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Upload Sponsor Logos */}
          <div>
            <span className="mb-2 block text-xs font-semibold tracking-wider text-slate-700">
              Sponsor Logos
            </span>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-[#8DC63F] hover:text-[#4c7a12]">
                <Upload size={16} /> Upload Sponsor Logos
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  multiple
                  className="hidden"
                  onChange={onSponsorLogoUpload}
                  disabled={uploadingLogo}
                />
              </label>
              {sponsorUrls.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-3">
                  {sponsorUrls.map((url) => (
                    <div
                      key={url}
                      className="relative h-14 w-20 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
                    >
                      <img
                        src={getImageUrl(url)}
                        alt="Sponsor logo"
                        onError={(e) => {
                          e.target.src = DEFAULT_SPONSOR_LOGO;
                        }}
                        className="h-full w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveSponsorLogo(url)}
                        className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shadow-md transition hover:bg-rose-700"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs font-medium text-slate-400">
                  No sponsor logos added
                </div>
              )}
            </div>
          </div>
        </div>
      </FormSection>

      <div className="sticky bottom-0 -mx-6 -mb-6 mt-8 flex flex-col gap-3 border-t border-slate-100 bg-white/95 px-6 py-5 backdrop-blur sm:flex-row">
        <button
          type="submit"
          disabled={loading || uploadingLogo}
          className="rounded-xl bg-[#EC008C] px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-pink-200 transition hover:bg-[#d4007d] active:scale-95 disabled:opacity-50"
        >
          {loading
            ? "Saving Changes..."
            : uploadingLogo
            ? "Uploading Assets..."
            : submitText}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-slate-100 px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-700 transition hover:bg-slate-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function FormSection({ label, children }) {
  return (
    <div className="mb-7">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-[#EC008C]">
          {label}
        </span>
        <span className="h-px flex-1 bg-slate-100" />
      </div>
      {children}
    </div>
  );
}

function Modal({ title, subtitle, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs font-medium text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs font-bold tracking-wider text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}