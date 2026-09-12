import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import SuperAdminDashboard from "./pages/SuperAdminDashboard.jsx";
import SelectOrganization from "./pages/SelectOrganization.jsx";
import AuctionList from "./pages/AuctionList.jsx";
import TeamsPage from "./pages/TeamsPage.jsx";
import PlayersPage from "./pages/PlayersPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import LiveControl from "./pages/LiveControl.jsx";
import PublicLiveView from "./pages/PublicLiveView.jsx";
import PublicDashboardView from "./pages/PublicDashboardView.jsx";
import YoutubeOverlay from "./pages/YoutubeOverlay.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/super-admin" element={<SuperAdminDashboard />} />
      <Route path="/select-organization" element={<SelectOrganization />} />
      <Route
        path="/admin/organizations/:organizationId/auctions"
        element={<AuctionList />}
      />
      <Route path="/admin/auctions/:auctionId" element={<TeamsPage />} />
      <Route
        path="/admin/auctions/:auctionId/dashboard"
        element={<TeamsPage />}
      />
      <Route path="/admin/auctions/:auctionId/teams" element={<TeamsPage />} />
      <Route
        path="/admin/auctions/:auctionId/players"
        element={<PlayersPage />}
      />
      <Route
        path="/admin/auctions/:auctionId/live-control"
        element={<LiveControl />}
      />
      <Route
        path="/admin/auctions/:auctionId/reports"
        element={<ReportsPage />}
      />
      <Route path="/live/:publicSlug" element={<PublicLiveView />} />
      <Route
        path="/live/:publicSlug/dashboard"
        element={<PublicDashboardView />}
      />
      <Route path="/live/:publicSlug/overlay" element={<YoutubeOverlay />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}