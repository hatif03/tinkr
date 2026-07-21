#!/usr/bin/env node
/**
 * Cross-platform local development bootstrap for tinkr contributors.
 *
 * Usage: node scripts/setup.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function ok(message) {
  console.log(`✓ ${message}`);
}

function warn(message) {
  console.warn(`! ${message}`);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
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

function main() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 20) {
    console.error("Node.js 20+ is required.");
    process.exit(1);
  }
  ok(`Node ${process.version}`);

  run("npm", ["install"], path.join(ROOT, "server"));
  run("npm", ["install"], path.join(ROOT, "web"));

  copyIfMissing(path.join(ROOT, "server", ".env.example"), path.join(ROOT, "server", ".env"));
  copyIfMissing(path.join(ROOT, "web", ".env.local.example"), path.join(ROOT, "web", ".env.local"));

  console.log("\nNext steps:");
  console.log("1. Fill in server/.env (Supabase + OPENAI_API_KEY).");
  console.log("2. Fill in web/.env.local (NEXT_PUBLIC_SUPABASE_*).");
  console.log("3. Apply supabase/schema.sql and supabase/migrations/ to your Supabase project.");
  console.log("4. Terminal A: cd server && npm run dev");
  console.log("5. Terminal B: cd web && npm run dev");
  console.log("6. Load this repo root as an unpacked extension in chrome://extensions");
  console.log("\nProduction deploy checklist:");
  console.log("- Vercel web root: web/");
  console.log("- Vercel API root: server/");
  console.log("- ALLOWED_ORIGINS on API must include your dashboard origin");
  console.log("- Pack extension: TINKR_APP_URL=... TINKR_API_URL=... node scripts/pack-extension.mjs");
}

main();
