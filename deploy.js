#!/usr/bin/env node
/**
 * Deploy — commit and push the working tree to GitHub, then kick off a Vercel deploy.
 *
 *   node deploy.js                  # stage everything, auto-generate a commit message, push, deploy
 *   node deploy.js "message"        # use this commit message instead of the auto one
 *   node deploy.js --skip-checks    # skip `npm run typecheck` before committing
 *   node deploy.js --no-push        # commit locally only, don't push (still deploys, from local files)
 *   node deploy.js --no-deploy      # push to GitHub only, skip the Vercel deploy
 *   node deploy.js --preview        # deploy to a Vercel Preview instead of Production
 *
 * Always works on whatever branch is currently checked out and pushes to its
 * tracking remote (origin/<branch> by default, set up on first push) — it
 * never switches branches, force-pushes, or touches history.
 *
 * The Vercel deploy runs from the local working directory (not from GitHub),
 * via the `vercel` CLI, which must already be logged in and linked to this
 * project (`vercel link` — see .vercel/project.json). It's a second, explicit
 * path to production independent of Vercel's GitHub integration, which also
 * auto-deploys on push to main — running both isn't harmful, just briefly
 * redundant; whichever build finishes last is what stays live.
 *
 * The deploy step only *notifies* Vercel and moves on — it does not wait for
 * the build to finish. `vercel deploy` is spawned detached and unref'd so
 * this script exits right away; its output goes to .vercel-deploy.log, and
 * `npx vercel ls <project>` shows build status if you want to check later.
 */

const { spawnSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const WIN = process.platform === "win32";
const args = process.argv.slice(2);
const skipChecks = args.includes("--skip-checks");
const noPush = args.includes("--no-push");
const noDeploy = args.includes("--no-deploy");
const preview = args.includes("--preview");
const messageArg = args.find((a) => !a.startsWith("--"));

// `shell` is opt-in per call, not global: on Windows, npm is npm.cmd and
// needs a shell to resolve; git.exe doesn't, and routing it through cmd.exe
// re-splits quoted arguments (a commit message with spaces gets torn apart
// into separate argv entries) — so git calls always run shell-free.
function run(cmd, cmdArgs, { shell = false } = {}) {
  return spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", shell });
}

function capture(cmd, cmdArgs, { shell = false } = {}) {
  return spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8", shell });
}

// Launches cmd detached from this process and returns immediately without
// waiting for it to exit — the point being that `node deploy.js` finishes as
// soon as GitHub has the push, rather than sitting through a ~1min Vercel
// build. Output goes to a log file since there's no terminal left attached
// once this process exits.
function fireAndForget(cmd, cmdArgs, { shell = false, logFile } = {}) {
  const out = fs.openSync(logFile, "w");
  const child = spawn(cmd, cmdArgs, {
    cwd: ROOT,
    shell,
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

async function main() {
  if (capture("git", ["rev-parse", "--is-inside-work-tree"]).status !== 0) {
    fail("Not a git repository.");
  }
  if (!capture("git", ["remote"]).stdout.trim()) {
    fail("No git remote configured — add one with `git remote add origin <url>`.");
  }

  const branch = capture("git", ["branch", "--show-current"]).stdout.trim();
  if (!branch) fail("Not on a branch (detached HEAD) — check out a branch first.");

  console.log(`\n📦 Deploying branch "${branch}"\n`);

  if (!skipChecks) {
    console.log("→ Running typecheck...");
    if (run("npm", ["run", "typecheck"], { shell: WIN }).status !== 0) {
      fail("Typecheck failed — fix the errors above, or run with --skip-checks to bypass.");
    }
    console.log("✓ Typecheck passed\n");
  }

  const hasChanges = capture("git", ["status", "--porcelain"]).stdout.trim().length > 0;

  if (hasChanges) {
    console.log("→ Staging changes...");
    run("git", ["add", "-A"]);

    const message = messageArg || `Update ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
    console.log(`→ Committing ("${message}")...`);
    if (run("git", ["commit", "-m", message]).status !== 0) fail("Commit failed.");
    console.log("✓ Committed\n");
  } else {
    console.log("→ No local changes to commit.\n");
  }

  if (noPush) {
    console.log("→ Skipping push (--no-push).\n");
  } else {
    const hasUpstream = capture("git", ["rev-parse", "--abbrev-ref", `${branch}@{upstream}`]).status === 0;
    console.log(`→ Pushing to origin/${branch}...`);
    const pushArgs = hasUpstream ? ["push"] : ["push", "-u", "origin", branch];
    if (run("git", pushArgs).status !== 0) {
      fail("Push failed — resolve conflicts or check your credentials and try again.");
    }
    console.log("✓ Pushed\n");
  }

  const hash = capture("git", ["rev-parse", "--short", "HEAD"]).stdout.trim();
  const remoteUrl = capture("git", ["remote", "get-url", "origin"]).stdout.trim();
  console.log(`✅ GitHub — ${hash} on ${branch}`);
  console.log(`   ${remoteUrl}\n`);

  if (noDeploy) {
    console.log("→ Skipping Vercel deploy (--no-deploy).\n");
    return;
  }

  const target = preview ? "Preview" : "Production";
  const logFile = path.join(ROOT, ".vercel-deploy.log");
  const deployArgs = ["deploy", "--yes"];
  if (!preview) deployArgs.push("--prod");
  // Vercel CLI itself resolves to npx on machines without a global install;
  // shell is required on Windows to find npx.cmd, same reasoning as npm above.
  fireAndForget("npx", ["vercel", ...deployArgs], { shell: WIN, logFile });

  console.log(`→ Vercel (${target}) notified — not waiting for the build to finish.`);
  console.log(`   Progress: npx vercel ls saraswati-sanmaan   (or see ${path.basename(logFile)})\n`);
}

main().catch((e) => fail(e.message ?? String(e)));
