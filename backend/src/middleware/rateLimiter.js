/**
 * In-process token-bucket rate limiter.
 * Per PM2 worker (no shared state across workers — acceptable for a single-machine deployment).
 *
 * Usage:
 *   app.use("/api/public", rateLimiter({ max: 60, windowMs: 60_000 }));
 */

"use strict";

// Map<ip, { count: number, resetAt: number }>
const _buckets = new Map();

// Prune stale entries every 5 minutes so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _buckets) {
    if (now >= entry.resetAt) _buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

/**
 * @param {object} opts
 * @param {number} opts.max        Max requests per window per IP (default 60)
 * @param {number} opts.windowMs   Window in ms (default 60_000)
 * @param {string} [opts.message]  Response message on 429
 */
function rateLimiter({ max = 60, windowMs = 60_000, message } = {}) {
  return function (req, res, next) {
    // Prefer X-Forwarded-For (set by Nginx/Cloudflare) over socket remote address.
    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    const now = Date.now();
    let entry = _buckets.get(ip);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      _buckets.set(ip, entry);
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
      return res.status(429).json({
        message: message || "Too many requests. Please slow down.",
        retryAfter,
      });
    }

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(max - entry.count));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
    next();
  };
}

module.exports = rateLimiter;
