"use strict";

const MAX_CONNECTIONS = 1200; // hard cap — reject beyond this to protect memory

let ioInstance = null;
let totalConnections = 0;

const auctionViewers = new Map();
const socketAuctionRooms = new Map();

function roomName(auctionId) {
  return `auction_${auctionId}`;
}

function getViewerCount(auctionId) {
  const set = auctionViewers.get(String(auctionId));
  return set ? set.size : 0;
}

function broadcastViewerCount(auctionId) {
  if (!ioInstance || !auctionId) return;
  ioInstance.to(roomName(auctionId)).emit("viewerCountUpdated", {
    auctionId: Number(auctionId),
    viewerCount: getViewerCount(auctionId),
  });
}

function joinAuctionRoom(socket, auctionId, countAsViewer = false) {
  if (!auctionId) return;
  const key = String(auctionId);
  socket.join(roomName(key));
  socketAuctionRooms.set(socket.id, key);

  if (countAsViewer) {
    const current = auctionViewers.get(key) || new Set();
    current.add(socket.id);
    auctionViewers.set(key, current);
    broadcastViewerCount(key);
  }
}

function leaveAuctionRoom(socket, auctionId) {
  if (!auctionId) return;
  const key = String(auctionId);
  socket.leave(roomName(key));
  const current = auctionViewers.get(key);
  if (current) {
    current.delete(socket.id);
    if (current.size === 0) auctionViewers.delete(key);
    broadcastViewerCount(key);
  }
  socketAuctionRooms.delete(socket.id);
}

function initSocket(io) {
  ioInstance = io;

  io.on("connection", (socket) => {
    // Connection cap — shed load gracefully
    if (totalConnections >= MAX_CONNECTIONS) {
      socket.emit("connect_error", { message: "Server at capacity. Please retry later." });
      socket.disconnect(true);
      return;
    }

    totalConnections++;

    socket.on("joinAuction", (auctionId) => {
      joinAuctionRoom(socket, auctionId, false);
    });

    socket.on("joinPublicAuction", ({ auctionId } = {}) => {
      joinAuctionRoom(socket, auctionId, true);
    });

    socket.on("leaveAuction", (auctionId) => {
      leaveAuctionRoom(socket, auctionId);
    });

    socket.on("leavePublicAuction", ({ auctionId } = {}) => {
      leaveAuctionRoom(socket, auctionId);
    });

    socket.on("disconnect", () => {
      totalConnections = Math.max(0, totalConnections - 1);
      const auctionId = socketAuctionRooms.get(socket.id);
      if (auctionId) leaveAuctionRoom(socket, auctionId);
    });
  });
}

function emitAuctionUpdate(auctionId, eventName, data) {
  if (!ioInstance) return;
  ioInstance.to(roomName(auctionId)).emit(eventName, data);
}

function emitAuctionSnapshot(auctionId, snapshot, eventName = "auctionSnapshotUpdated") {
  const payload = {
    ...snapshot,
    viewerCount: getViewerCount(auctionId),
  };
  emitAuctionUpdate(auctionId, eventName, payload);
}

module.exports = {
  initSocket,
  emitAuctionUpdate,
  emitAuctionSnapshot,
  getViewerCount,
  broadcastViewerCount,
};
