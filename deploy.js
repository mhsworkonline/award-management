#!/usr/bin/env node
/**
 * Deploy — commit and push the working tree to GitHub. Vercel's GitHub
 * integration picks up the push and deploys on its own; nothing more to do.
 *
 *   node deploy.js                  # stage everything, auto-generate a commit message, push
 *   node deploy.js "message"        # use this commit message instead of the auto one
 *   node deploy.js --skip-checks    # skip `npm run typecheck` before committing
 *   node deploy.js --no-push        # commit locally only, don't push
 *
 * Always works on whatever branch is currently checked out and pushes to its
 * tracking remote (origin/<branch> by default, set up on first push) — it
 * never switches branches, force-pushes, or touches history.
 */

const { spawnSync } = require("node:child_process");

const ROOT = __dirname;
const WIN = process.platform === "win32";
const args = process.argv.slice(2);
const skipChecks = args.includes("--skip-checks");
const noPush = args.includes("--no-push");
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

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

function main() {
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
    return;
  }

  const hasUpstream = capture("git", ["rev-parse", "--abbrev-ref", `${branch}@{upstream}`]).status === 0;
  console.log(`→ Pushing to origin/${branch}...`);
  const pushArgs = hasUpstream ? ["push"] : ["push", "-u", "origin", branch];
  if (run("git", pushArgs).status !== 0) {
    fail("Push failed — resolve conflicts or check your credentials and try again.");
  }
  console.log("✓ Pushed\n");

  const hash = capture("git", ["rev-parse", "--short", "HEAD"]).stdout.trim();
  const remoteUrl = capture("git", ["remote", "get-url", "origin"]).stdout.trim();
  console.log(`✅ GitHub — ${hash} on ${branch}`);
  console.log(`   ${remoteUrl}`);
  console.log(`   Vercel's GitHub integration will pick this up and deploy automatically.\n`);
}

main();
