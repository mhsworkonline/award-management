#!/usr/bin/env node
/**
 * Start the Award Management app.
 *
 *   node start.js            # dev server, auto-picks a free port starting at 3000
 *   node start.js --prod     # production server instead of dev
 *   node start.js --port 4000
 *
 * Never touches whatever is already running on 3000 — if it's busy, this just
 * asks Next.js to try the next port instead.
 */

const { spawn, spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

const args = process.argv.slice(2);
const prod = args.includes("--prod");
const portFlag = args.indexOf("--port");
const startPort = Number(portFlag !== -1 ? args[portFlag + 1] : process.env.PORT || 3000);
const MAX_TRIES = 20;

if (!existsSync(NEXT_BIN)) {
  console.log("Installing dependencies...");
  const install = spawnSync("npm", ["install"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  if (install.status !== 0) {
    console.error("npm install failed.");
    process.exit(1);
  }
}

if (!existsSync(path.join(ROOT, ".env.local"))) {
  console.error(".env.local not found. Copy .env.local.example to .env.local and fill in your Supabase details.");
  process.exit(1);
}

if (prod && !existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
  console.log("Building for production...");
  const build = spawnSync(process.execPath, [NEXT_BIN, "build"], { cwd: ROOT, stdio: "inherit" });
  if (build.status !== 0) process.exit(1);
}

let currentChild = null;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => currentChild?.kill(sig));
}

tryPort(startPort, MAX_TRIES);

/** Actually asks Next.js to bind the port, rather than pre-checking it — a
 *  pre-check-then-use approach has a race between the check and Next's own
 *  bind. If Next reports the port taken, retry on the next one. */
function tryPort(port, triesLeft) {
  const child = spawn(process.execPath, [NEXT_BIN, prod ? "start" : "dev", "--port", String(port)], {
    cwd: ROOT,
    stdio: ["inherit", "pipe", "pipe"],
  });
  currentChild = child;

  let settled = false;
  let sawAddrInUse = false;

  // Next prints its "- Local: http://..." banner only after it has actually
  // bound the port, and prints EADDRINUSE (to stderr) without ever printing
  // that banner if the bind failed — so the banner is the real success signal,
  // not a guessed timeout.
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(chunk);
    if (!settled && text.includes("- Local:")) {
      settled = true;
      console.log(`\nSign in: admin@awardmanagement.com / 99999999\n`);
    }
  });
  child.stderr.on("data", (chunk) => {
    if (chunk.toString().includes("EADDRINUSE")) sawAddrInUse = true;
    process.stderr.write(chunk);
  });

  child.on("exit", (code) => {
    if (sawAddrInUse && !settled && triesLeft > 0) {
      tryPort(port + 1, triesLeft - 1);
      return;
    }
    process.exit(code ?? 0);
  });
}
