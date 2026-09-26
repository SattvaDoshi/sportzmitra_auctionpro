import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Users, Flame, Navigation, Plus, Edit2, Shield, Trash2, X, Check, XCircle, Gavel } from "lucide-react";
import AdminLayout from "../components/layout/AdminLayout";
import api from "../api/api";

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [showAdminsModal, setShowAdminsModal] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [admins, setAdmins] = useState([]);
  
  // Forms state
  const [orgForm, setOrgForm] = useState({
    organization_name: "",
    contact_person: "",
    contact_mobile: "",
    logo_url: "",
    plan_type: "FREE_TRIAL",
    plan_expiry_date: "",
    max_auctions_allowed: 1
  });
  
  const [adminForm, setAdminForm] = useState({
    name: "",
    mobile: "",
    email: ""
  });

  const fetchOrganizations = async () => {
    try {
      setLoading(true);
      const res = await api.get("/organizations");
      setOrganizations(res.data);
    } catch (error) {
      console.error("Failed to fetch organizations", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const handleCreateOrUpdateOrg = async (e) => {
    e.preventDefault();
    try {
      if (editingOrg) {
        await api.put(`/organizations/${editingOrg.id}`, orgForm);
      } else {
        await api.post("/organizations", orgForm);
      }
      setShowOrgModal(false);
      setEditingOrg(null);
      setOrgForm({
        organization_name: "",
        contact_person: "",
        contact_mobile: "",
        logo_url: "",
        plan_type: "FREE_TRIAL",
        plan_expiry_date: "",
        max_auctions_allowed: 1
      });
      fetchOrganizations();
    } catch (error) {
      console.error("Failed to save organization", error);
      alert(error.response?.data?.message || "Failed to save organization");
    }
  };

  const handleToggleStatus = async (org) => {
    if (!window.confirm(`Are you sure you want to ${org.status === 'ACTIVE' ? 'deactivate' : 'activate'} this organization?`)) return;
    try {
      await api.patch(`/organizations/${org.id}/status`, {
        status: org.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
      });
      fetchOrganizations();
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };

  const openEditModal = (org) => {
    setEditingOrg(org);
    setOrgForm({
      organization_name: org.organization_name || "",
      contact_person: org.contact_person || "",
      contact_mobile: org.contact_mobile || "",
      logo_url: org.logo_url || "",
      plan_type: org.plan_type || "FREE_TRIAL",
      plan_expiry_date: org.plan_expiry_date ? org.plan_expiry_date.split('T')[0] : "",
      max_auctions_allowed: org.max_auctions_allowed || 1
    });
    setShowOrgModal(true);
  };

  const openAdminsModal = async (org) => {
    setSelectedOrg(org);
    setShowAdminsModal(true);
    fetchAdmins(org.id);
  };

  const fetchAdmins = async (orgId) => {
    try {
      const res = await api.get(`/super-admin/organization/${orgId}/admins`);
      setAdmins(res.data);
    } catch (error) {
      console.error("Failed to fetch admins", error);
    }
  };

  const handleAssignAdmin = async (e) => {
    e.preventDefault();
    try {
      await api.post("/super-admin/auction-admin", {
        ...adminForm,
        organization_id: selectedOrg.id
      });
      setAdminForm({ name: "", mobile: "", email: "" });
      fetchAdmins(selectedOrg.id);
    } catch (error) {
      console.error("Failed to assign admin", error);
      alert(error.response?.data?.message || "Failed to assign admin");
    }
  };

  const handleRemoveAdmin = async (userId) => {
    if (!window.confirm("Are you sure you want to remove this admin?")) return;
    try {
      await api.delete(`/super-admin/auction-admin/${selectedOrg.id}/${userId}`);
      fetchAdmins(selectedOrg.id);
    } catch (error) {
      console.error("Failed to remove admin", error);
    }
  };

  const activeOrgs = organizations.filter(o => o.status === 'ACTIVE').length;
  const totalOrgs = organizations.length;

  return (
    <AdminLayout
      title="Super Admin"
      subtitle="Manage organizations and assign auction admins"
      active="Overview"
    >
      <div className="min-h-screen overflow-x-hidden bg-slate-50 p-4 sm:p-6 lg:p-8 font-sans text-slate-800">
        <div className="mx-auto max-w-7xl space-y-6">
          
          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
            <StatCard 
              label="Total Organizations" 
              value={loading ? "..." : totalOrgs} 
              icon={<Building2 className="h-5 w-5 text-slate-500" />} 
            />
            <StatCard 
              label="Active Organizations" 
              value={loading ? "..." : activeOrgs} 
              icon={<Flame className="h-5 w-5 text-green-600" />} 
              highlight 
            />
          </div>

          {/* Organizations List */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            {/* Header row: stacks on mobile so the "New Organization" button
                gets its own full-width line instead of forcing this row (and
                the whole page) wider than the viewport. */}
            <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-black uppercase tracking-tight text-slate-900 sm:text-xl">
                  Organizations
                </h2>
              </div>
              <button 
                onClick={() => {
                  setEditingOrg(null);
                  setOrgForm({
                    organization_name: "", contact_person: "", contact_mobile: "", 
                    logo_url: "", plan_type: "FREE_TRIAL", plan_expiry_date: "", max_auctions_allowed: 1
                  });
                  setShowOrgModal(true);
                }}
                className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 sm:w-auto sm:justify-start sm:py-2"
              >
                <Plus className="h-4 w-4 shrink-0" />
                New Organization
              </button>
            </div>

            {/* Table scrolls horizontally within its own box on mobile
                instead of the columns being squeezed or pushing the page
                width out. */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50/50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-6 py-4 font-bold">Organization</th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold">Contact</th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold">Plan</th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold">Status</th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="p-6 text-center text-slate-500">Loading...</td>
                    </tr>
                  ) : organizations.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-6 text-center text-slate-500">No organizations found.</td>
                    </tr>
                  ) : (
                    organizations.map((org) => (
                      <tr key={org.id} className="transition-colors hover:bg-slate-50/50">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-bold text-slate-900">{org.organization_name}</div>
                          <div className="text-xs text-slate-500">ID: {org.id}</div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-medium text-slate-900">{org.contact_person || 'N/A'}</div>
                          <div className="text-xs text-slate-500">{org.contact_mobile || 'N/A'}</div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                            {org.plan_type}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          {org.status === 'ACTIVE' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 ring-1 ring-green-600/20 ring-inset">
                              <Check className="h-3 w-3" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 ring-1 ring-red-600/20 ring-inset">
                              <XCircle className="h-3 w-3" /> Inactive
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => navigate(`/admin/organizations/${org.id}/auctions`)}
                              className="rounded-lg p-2 text-slate-400 hover:bg-purple-50 hover:text-purple-600"
                              title="View Auctions"
                            >
                              <Gavel className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => openAdminsModal(org)}
                              className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                              title="Manage Admins"
                            >
                              <Shield className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => openEditModal(org)}
                              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                              title="Edit Organization"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => handleToggleStatus(org)}
                              className={`rounded-lg p-2 ${org.status === 'ACTIVE' ? 'text-slate-400 hover:bg-red-50 hover:text-red-600' : 'text-slate-400 hover:bg-green-50 hover:text-green-600'}`}
                              title={org.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                            >
                              {org.status === 'ACTIVE' ? <XCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Create/Edit Org Modal */}
      {showOrgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-black uppercase text-slate-900">
                {editingOrg ? "Edit Organization" : "New Organization"}
              </h3>
              <button onClick={() => setShowOrgModal(false)} className="rounded-lg p-2 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateOrUpdateOrg} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">Organization Name</label>
                <input
                  type="text"
                  required
                  value={orgForm.organization_name}
                  onChange={(e) => setOrgForm({...orgForm, organization_name: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">Contact Person</label>
                  <input
                    type="text"
                    value={orgForm.contact_person}
                    onChange={(e) => setOrgForm({...orgForm, contact_person: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">Contact Mobile</label>
                  <input
                    type="text"
                    value={orgForm.contact_mobile}
                    onChange={(e) => setOrgForm({...orgForm, contact_mobile: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">Plan Type</label>
                  <select
                    value={orgForm.plan_type}
                    onChange={(e) => setOrgForm({...orgForm, plan_type: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="FREE_TRIAL">Free Trial</option>
                    <option value="BASIC">Basic</option>
                    <option value="PRO">Pro</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">Max Auctions</label>
                  <input
                    type="number"
                    min="1"
                    value={orgForm.max_auctions_allowed}
                    onChange={(e) => setOrgForm({...orgForm, max_auctions_allowed: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700"
              >
                {editingOrg ? "Save Changes" : "Create Organization"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Manage Admins Modal */}
      {showAdminsModal && selectedOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-black uppercase text-slate-900">
                Manage Admins: {selectedOrg.organization_name}
              </h3>
              <button onClick={() => setShowAdminsModal(false)} className="rounded-lg p-2 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="mb-4 text-sm font-bold uppercase text-slate-700">Assign New Admin</h4>
              <form onSubmit={handleAssignAdmin} className="flex flex-wrap items-end gap-3 sm:flex-nowrap">
                <div className="w-full sm:flex-1">
                  <label className="mb-1 block text-xs font-bold text-slate-500">Name</label>
                  <input
                    type="text"
                    required
                    value={adminForm.name}
                    onChange={(e) => setAdminForm({...adminForm, name: e.target.value})}
                    className="w-full rounded-lg border border-slate-200 p-2.5 text-sm"
                  />
                </div>
                <div className="w-full sm:flex-1">
                  <label className="mb-1 block text-xs font-bold text-slate-500">Mobile (Username)</label>
                  <input
                    type="text"
                    required
                    value={adminForm.mobile}
                    onChange={(e) => setAdminForm({...adminForm, mobile: e.target.value})}
                    className="w-full rounded-lg border border-slate-200 p-2.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700 sm:w-auto"
                >
                  Assign Admin
                </button>
              </form>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-bold uppercase text-slate-700">Current Admins</h4>
              <div className="max-h-[300px] overflow-y-auto overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3 font-bold">Name</th>
                      <th className="whitespace-nowrap px-4 py-3 font-bold">Mobile</th>
                      <th className="whitespace-nowrap px-4 py-3 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {admins.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="p-4 text-center text-slate-500">No admins assigned.</td>
                      </tr>
                    ) : (
                      admins.map((admin) => (
                        <tr key={admin.id} className="hover:bg-slate-50/50">
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{admin.name}</td>
                          <td className="whitespace-nowrap px-4 py-3">{admin.mobile}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <button
                              onClick={() => handleRemoveAdmin(admin.id)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Remove Admin"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function StatCard({ label, value, highlight, alert, icon }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 shadow-xs transition-all hover:shadow-md sm:p-6 ${
        highlight
          ? "border-green-200 bg-green-50/50"
          : alert
          ? "border-red-200 bg-red-50/50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {icon}
      </div>
      <div
        className={`mt-2 text-3xl font-black tracking-tight sm:text-4xl ${
          highlight ? "text-green-600" : alert ? "text-red-600" : "text-slate-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}