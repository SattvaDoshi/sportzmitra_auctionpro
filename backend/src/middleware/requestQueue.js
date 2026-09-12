/**
 * Per-auction async FIFO write queue.
 *
 * Prevents concurrent stored-procedure calls hammering MySQL for the same auction.
 * Each auction gets its own queue; max 2 tasks running concurrently per auction.
 * If the queue depth exceeds MAX_DEPTH the middleware returns 503 immediately (backpressure).
 *
 * Usage (in a router):
 *   const { auctionWriteQueue } = require("../middleware/requestQueue");
 *   router.post("/:auctionId/bid", authMiddleware, auctionWriteQueue, async (req, res) => { ... });
 */

"use strict";

const MAX_DEPTH = 20;       // max queued tasks per auction before 503
const MAX_CONCURRENCY = 2;  // max simultaneous tasks per auction

class AuctionQueue {
  constructor() {
    this.pending = [];   // Array<{ fn: () => Promise, resolve, reject }>
    this.running = 0;
  }

  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.pending.push({ fn, resolve, reject });
      this._tick();
    });
  }

  _tick() {
    while (this.running < MAX_CONCURRENCY && this.pending.length > 0) {
      const task = this.pending.shift();
      this.running++;
      Promise.resolve()
        .then(() => task.fn())
        .then(task.resolve, task.reject)
        .finally(() => {
          this.running--;
          this._tick();
        });
    }
  }

  get depth() {
    return this.pending.length + this.running;
  }
}

// Map<auctionId, AuctionQueue>
const _queues = new Map();

// Prune idle queues every 10 minutes
setInterval(() => {
  for (const [id, q] of _queues) {
    if (q.depth === 0) _queues.delete(id);
  }
}, 10 * 60 * 1000).unref();

function getQueue(auctionId) {
  if (!_queues.has(auctionId)) _queues.set(auctionId, new AuctionQueue());
  return _queues.get(auctionId);
}

/**
 * Express middleware that wraps the rest of the handler chain in the
 * per-auction queue. Expects `req.params.auctionId` to be present.
 */
function auctionWriteQueue(req, res, next) {
  const auctionId = req.params.auctionId || req.body?.auction_id;
  if (!auctionId) return next(); // no auctionId — skip queuing

  const queue = getQueue(String(auctionId));

  if (queue.depth >= MAX_DEPTH) {
    return res.status(503).json({
      message: "Server is busy processing requests for this auction. Please retry in a moment.",
      retryAfter: 2,
    });
  }

  queue
    .enqueue(() => new Promise((resolve, reject) => {
      // Monkey-patch res.end so we know when the handler finished
      const originalEnd = res.end.bind(res);
      res.end = (...args) => {
        originalEnd(...args);
        resolve();
      };
      // Pass control to the next handler; any uncaught error rejects
      try {
        next();
      } catch (err) {
        reject(err);
      }
    }))
    .catch(() => {
      // errors are already handled inside route handlers; swallow here
    });
}

module.exports = { auctionWriteQueue, getQueue };
