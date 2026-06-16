// PM2 process definitions for OptionForge on a single server.
// Usage (from the project dir): pm2 start ecosystem.config.cjs && pm2 save
//
// `remix-serve` (and the worker) do NOT auto-load .env in production, so we read
// it here and inject the vars into each process's environment. Dependency-free
// parser — splits on the first '=', skips comments/blanks, strips surrounding
// quotes. Without this the app boots with an empty SHOPIFY_APP_URL and crashes.
const fs = require("fs");
const path = require("path");

function loadDotenv(file) {
  const env = {};
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return env; // no .env → rely on the real process environment
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const fileEnv = loadDotenv(path.join(__dirname, ".env"));

module.exports = {
  apps: [
    {
      name: "optionforge-web",
      script: "npm",
      args: "run start",
      cwd: __dirname,
      env: { ...fileEnv, NODE_ENV: "production", PORT: fileEnv.PORT || "3000" },
      autorestart: true,
      max_memory_restart: "600M",
    },
    {
      name: "optionforge-worker",
      script: "npm",
      args: "run worker",
      cwd: __dirname,
      env: { ...fileEnv, NODE_ENV: "production" },
      autorestart: true,
      max_memory_restart: "400M",
    },
  ],
};
