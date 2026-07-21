#!/usr/bin/env node
/**
 * Cross-platform local development bootstrap for tinkr contributors.
 *
 * Usage:
 *   node scripts/setup.mjs
 *   node scripts/setup.mjs --docker   # same as node scripts/dev-docker.mjs
 *   node scripts/setup.mjs --manual   # install deps only, no Docker
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const args = new Set(process.argv.slice(2));

function ok(message) {
  console.log(`✓ ${message}`);
}

function warn(message) {
  console.warn(`! ${message}`);
}

function run(command, runArgs, cwd) {
  const result = spawnSync(command, runArgs, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function copyIfMissing(src, dest) {
  if (fs.existsSync(dest)) {
    ok(`exists ${path.relative(ROOT, dest)}`);
    return;
  }
  if (!fs.existsSync(src)) {
    warn(`missing template ${path.relative(ROOT, src)}`);
    return;
  }
  fs.copyFileSync(src, dest);
  ok(`created ${path.relative(ROOT, dest)}`);
}

function manualSetup() {
  run("npm", ["install"], path.join(ROOT, "server"));
  run("npm", ["install"], path.join(ROOT, "web"));

  copyIfMissing(path.join(ROOT, "server", ".env.example"), path.join(ROOT, "server", ".env"));
  copyIfMissing(path.join(ROOT, "web", ".env.local.example"), path.join(ROOT, "web", ".env.local"));

  console.log("\nManual setup next steps:");
  console.log("1. Fill in server/.env (Supabase + OPENAI_API_KEY).");
  console.log("2. Fill in web/.env.local (NEXT_PUBLIC_SUPABASE_*).");
  console.log("3. Run `supabase start` and `supabase db reset` from the repo root.");
  console.log("4. Terminal A: cd server && npm run dev");
  console.log("5. Terminal B: cd web && npm run dev");
  console.log("6. Load this repo root as an unpacked extension in chrome://extensions");
  console.log("\nSee docs/LOCAL.md for full instructions.");
}

function main() {
  const nodeMajor = Number(process.version.split(".")[0]);
  if (nodeMajor < 20) {
    console.error("Node.js 20+ is required.");
    process.exit(1);
  }
  ok(`Node ${process.version}`);

  if (args.has("--manual")) {
    manualSetup();
    return;
  }

  console.log("\nRecommended: Docker + local Supabase\n");
  console.log("  cp .env.docker.example .env.docker   # first time");
  console.log("  node scripts/dev-docker.mjs\n");
  console.log("Manual setup without Docker:");
  console.log("  node scripts/setup.mjs --manual\n");
  console.log("See docs/LOCAL.md for details.\n");
}

main();
