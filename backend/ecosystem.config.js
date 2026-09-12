/**
 * PM2 Ecosystem Config — SportzMitra AuctionPro
 *
 * Deploy on Hostinger KVM 4 (4 vCPU / 16 GB RAM):
 *
 *   npm install -g pm2
 *   cd /path/to/backend
 *   npm install
 *   npm run start:pm2
 *
 * Useful commands:
 *   pm2 status                          — see all workers
 *   pm2 logs sportzmitra-auction        — tail logs
 *   pm2 reload sportzmitra-auction      — zero-downtime reload
 *   pm2 monit                           — live CPU/RAM dashboard
 *   pm2 save && pm2 startup             — survive reboots
 */

module.exports = {
  apps: [
    {
      name: "sportzmitra-auction",
      script: "src/server.js",

      // Fork one worker per vCPU core
      instances: 4,
      exec_mode: "cluster",

      // ── Environment ──────────────────────────────────────────────────────
      env: {
        NODE_ENV: "development",
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
      },

      // ── Restart policy ───────────────────────────────────────────────────
      // Restart a worker if it crashes; wait 1 s before restart
      restart_delay: 1000,
      // Stop trying to restart after 10 consecutive failures
      max_restarts: 10,
      // Time window for max_restarts counter (ms)
      min_uptime: 5000,

      // ── Memory guard ─────────────────────────────────────────────────────
      // Restart a worker if it exceeds 512 MB RSS (leaves plenty for 4 workers on 16 GB)
      max_memory_restart: "512M",

      // ── Logging ──────────────────────────────────────────────────────────
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // ── Misc ─────────────────────────────────────────────────────────────
      // Graceful shutdown — wait up to 5 s for in-flight requests to drain
      kill_timeout: 5000,
      listen_timeout: 8000,
      // Watch is off in production — use `pm2 reload` to deploy changes
      watch: false,
    },
  ],
};
