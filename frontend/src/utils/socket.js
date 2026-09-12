/**
 * Shared Socket.io singleton for the entire frontend app.
 *
 * Importing this module from any page/component always returns
 * the SAME socket instance, so only ONE WebSocket connection
 * is opened per browser tab — regardless of how many components mount.
 *
 * Reconnection backoff is configured here so all consumers benefit.
 */

import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

const socket = io(SOCKET_URL, {
  // Prefer WebSocket, fall back to long-polling
  transports: ["websocket", "polling"],

  // Exponential back-off on reconnect: 1 s → 5 s
  reconnectionDelay: 1_000,
  reconnectionDelayMax: 5_000,
  reconnectionAttempts: 15,

  // Don't connect immediately — only when the first room is joined
  autoConnect: true,
});

export default socket;
