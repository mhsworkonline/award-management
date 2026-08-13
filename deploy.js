#!/usr/bin/env node
/**
 * Deploy — commit and push the working tree to GitHub.
 *
 *   node deploy.js                  # stage everything, prompt for a commit message, push
 *   node deploy.js "message"        # use this commit message instead of prompting
 *   node deploy.js --skip-checks    # skip `npm run typecheck` before committing
 *   node deploy.js --no-push        # commit locally only, don't push
 *
 * Always works on whatever branch is currently checked out and pushes to its
 * tracking remote (origin/<branch> by default, set up on first push) — it
 * never switches branches, force-pushes, or touches history.
 */

const { spawnSync } = require("node:child_process");
const readline = require("node:readline");

const ROOT = __dirname;
const WIN = process.platform === "win32";
const args = process.argv.slice(2);
const skipChecks = args.includes("--skip-checks");
const noPush = args.includes("--no-push");
const messageArg = args.find((a) => !a.startsWith("--"));

function run(cmd, cmdArgs) {
  return spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", shell: WIN });
}

function capture(cmd, cmdArgs) {
  return spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8", shell: WIN });
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
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
    if (run("npm", ["run", "typecheck"]).status !== 0) {
      fail("Typecheck failed — fix the errors above, or run with --skip-checks to bypass.");
    }
    console.log("✓ Typecheck passed\n");
  }

  const hasChanges = capture("git", ["status", "--porcelain"]).stdout.trim().length > 0;

  if (hasChanges) {
    console.log("→ Staging changes...");
    run("git", ["add", "-A"]);

    let message = messageArg;
    if (!message) message = await ask("Commit message: ");
    if (!message) {
      message = `Update ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
      console.log(`(no message given — using "${message}")`);
    }

    console.log("→ Committing...");
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
  console.log(`✅ Done — ${hash} on ${branch}`);
  console.log(`   ${remoteUrl}\n`);
}

main().catch((e) => fail(e.message ?? String(e)));
