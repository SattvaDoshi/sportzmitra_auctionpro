/**
 * In-memory auction snapshot cache.
 *
 * TTL: 2 seconds — short enough to feel real-time, long enough to collapse
 * 1000 concurrent HTTP GETs into a single DB stored-procedure call.
 *
 * Admin write routes (bid, sold, pause, …) call `invalidate(auctionId)` so
 * that the very next GET always reflects the latest state.
 *
 * API:
 *   get(key)               → cached value or undefined
 *   set(key, value, ttlMs) → stores value; default TTL = 2000ms
 *   invalidate(key)        → removes immediately
 *   invalidateSlug(slug)   → removes slug-keyed entry
 */

"use strict";

const DEFAULT_TTL = 2_000; // 2 seconds

// Map<key, { value: any, expiresAt: number }>
const _store = new Map();

// Sweep expired entries every 10 seconds
setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of _store) {
    if (now >= entry.expiresAt) _store.delete(k);
  }
}, 10_000).unref();

function get(key) {
  const entry = _store.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    _store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs = DEFAULT_TTL) {
  _store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function invalidate(auctionId) {
  // Invalidate both the numeric-id key and any slug keys that reference this auction.
  for (const [k] of _store) {
    if (k === String(auctionId) || k.startsWith(`slug:`) ) {
      // For slug keys we can't know which slug maps to which auctionId without
      // an extra lookup — so we just flush all slug entries when any write happens.
      // The next GET re-populates them.
      _store.delete(k);
    }
  }
}

function invalidateSlug(slug) {
  _store.delete(`slug:${slug}`);
}

function clear() {
  _store.clear();
}

module.exports = { get, set, invalidate, invalidateSlug, clear };
