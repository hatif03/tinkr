#!/usr/bin/env node
/**
 * Start the full local tinkr stack:
 *   1. Supabase (Postgres, Auth, Storage) via Supabase CLI
 *   2. API + dashboard via Docker Compose
 *
 * Usage:
 *   node scripts/dev-docker.mjs
 *   node scripts/dev-docker.mjs --reset-db
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const ENV_DOCKER = path.join(ROOT, ".env.docker");
const ENV_EXAMPLE = path.join(ROOT, ".env.docker.example");
const INIT_MARKER = path.join(ROOT, ".local", "supabase-db-initialized");

const args = new Set(process.argv.slice(2));
const resetDb = args.has("--reset-db");

function log(message) {
  console.log(message);
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function runSync(command, runArgs, options = {}) {
  const result = spawnSync(command, runArgs, {
    cwd: options.cwd || ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...options.env }
  });
  if (result.status !== 0) {
    fail(`Command failed: ${command} ${runArgs.join(" ")}`, result.status ?? 1);
  }
}

function commandExists(command, checkArgs = ["--version"]) {
  const result = spawnSync(command, checkArgs, {
    cwd: ROOT,
    stdio: "ignore",
    shell: process.platform === "win32"
  });
  return result.status === 0;
}

function resolveSupabaseCommand() {
  if (commandExists("supabase")) return ["supabase"];
  log("Supabase CLI not found on PATH — using npx supabase");
  return ["npx", "supabase"];
}

function ensureDockerRunning() {
  const result = spawnSync("docker", ["info"], {
    cwd: ROOT,
    stdio: "ignore",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    fail("Docker is not running. Start Docker Desktop (or your Docker engine) and try again.");
  }
}

function ensureEnvFile() {
  if (fs.existsSync(ENV_DOCKER)) {
    log("✓ .env.docker exists");
    return;
  }
  if (!fs.existsSync(ENV_EXAMPLE)) {
    fail("Missing .env.docker.example");
  }
  fs.copyFileSync(ENV_EXAMPLE, ENV_DOCKER);
  log("✓ created .env.docker from .env.docker.example");
}

function startSupabase(supabaseCmd) {
  log("\nStarting local Supabase…");
  runSync(supabaseCmd[0], [...supabaseCmd.slice(1), "start"], { cwd: ROOT });
}

function resetSupabaseDb(supabaseCmd) {
  log("\nApplying database schema and migrations…");
  runSync(supabaseCmd[0], [...supabaseCmd.slice(1), "db", "reset"], { cwd: ROOT });
  fs.mkdirSync(path.dirname(INIT_MARKER), { recursive: true });
  fs.writeFileSync(INIT_MARKER, new Date().toISOString());
}

function maybeResetDb(supabaseCmd) {
  const firstRun = !fs.existsSync(INIT_MARKER);
  if (resetDb || firstRun) {
    if (firstRun) log("First local run detected — resetting Supabase database.");
    resetSupabaseDb(supabaseCmd);
    return;
  }
  log("✓ Supabase database already initialized (use --reset-db to reapply migrations)");
}

function startCompose() {
  log("\nStarting API and dashboard containers…");
  const composeArgs = ["compose", "up", "--build"];
  if (!args.has("--no-attach")) composeArgs.push("--remove-orphans");

  const child = spawn("docker", composeArgs, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env
  });

  child.on("exit", code => process.exit(code ?? 0));
}

function printNextSteps() {
  log(`
Local tinkr is starting.

  Dashboard        http://localhost:3000
  API health       http://localhost:8787/health
  Supabase Studio  http://127.0.0.1:54323
  Magic-link inbox http://127.0.0.1:54324  (local email; no real SMTP)

Extension (manual):
  1. Open chrome://extensions and enable Developer mode
  2. Load unpacked → select this repo root (${ROOT})
  3. tinkr-config.js already points at localhost:3000 and localhost:8787

Stop:
  Ctrl+C stops API/web containers
  supabase stop     stops the local Supabase stack
  docker compose down
`);
}

function main() {
  const nodeMajor = Number(process.version.split(".")[0]);
  if (nodeMajor < 20) fail("Node.js 20+ is required.");

  ensureDockerRunning();
  ensureEnvFile();

  const supabaseCmd = resolveSupabaseCommand();
  startSupabase(supabaseCmd);
  maybeResetDb(supabaseCmd);
  printNextSteps();
  startCompose();
}

main();
