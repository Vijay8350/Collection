// PM2 process definitions for OptionForge on a single server.
// Usage (from the project dir): pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: "optionforge-web",
      script: "npm",
      args: "run start",
      cwd: __dirname,
      env: { NODE_ENV: "production", PORT: "3000" },
      autorestart: true,
      max_memory_restart: "600M",
    },
    {
      name: "optionforge-worker",
      script: "npm",
      args: "run worker",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_memory_restart: "400M",
    },
  ],
};
