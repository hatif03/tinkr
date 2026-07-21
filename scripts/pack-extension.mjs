#!/usr/bin/env node
/**
 * Build a sideload-ready Chrome extension zip for production testers.
 *
 * Usage:
 *   TINKR_APP_URL=https://tinkr-web.vercel.app \
 *   TINKR_API_URL=https://tinkr-api.vercel.app \
 *   node scripts/pack-extension.mjs
 *
 * Optional:
 *   EXTENSION_PEM=scripts/extension.pem  (stable extension ID via manifest key)
 *   OUT_DIR=dist                         (default)
 */
import archiver from "archiver";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const EXTENSION_FILES = [
  "manifest.json",
  "background.js",
  "tinkr-config.js",
  "content.js",
  "content.css",
  "content-toolbar.js",
  "sidepanel.html",
  "sidepanel.js",
  "sidepanel.css",
  "sandbox.html",
  "sandbox.js"
];

const EXTENSION_DIRS = [
  "assets/brand",
  "packages/canvas"
];

function readManifestVersion() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  return manifest.version || "0.0.0";
}

function normalizeOrigin(url, label) {
  if (!url) {
    console.error(`Missing ${label}. Set TINKR_APP_URL and TINKR_API_URL.`);
    process.exit(1);
  }
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

function hostPermission(origin) {
  return `${origin}/*`;
}

function patchManifest(manifest, { appUrl, apiUrl, manifestKey }) {
  const next = structuredClone(manifest);
  const hostSet = new Set([
    "http://localhost:8787/*",
    "http://localhost:3000/*",
    "https://api.tinkr.com/*",
    "https://app.tinkr.com/*",
    "https://*.supabase.co/*",
    hostPermission(appUrl),
    hostPermission(apiUrl)
  ]);
  next.host_permissions = [...hostSet];

  const connectSet = new Set([
    "http://localhost:3000/*",
    "https://app.tinkr.com/*",
    `${appUrl}/*`
  ]);
  next.externally_connectable = { matches: [...connectSet] };

  if (manifestKey) next.key = manifestKey;
  return next;
}

function manifestKeyFromPem(pemPath) {
  if (!pemPath || !fs.existsSync(pemPath)) return null;
  const pem = fs.readFileSync(pemPath, "utf8");
  const privateKey = crypto.createPrivateKey(pem);
  const publicKey = crypto.createPublicKey(privateKey);
  const der = publicKey.export({ type: "spki", format: "der" });
  return der.toString("base64");
}

function copyTree(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyTree(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

async function zipDirectory(sourceDir, zipPath) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

async function main() {
  const appUrl = normalizeOrigin(process.env.TINKR_APP_URL, "TINKR_APP_URL");
  const apiUrl = normalizeOrigin(process.env.TINKR_API_URL, "TINKR_API_URL");
  const pemPath = process.env.EXTENSION_PEM || path.join(__dirname, "extension.pem");
  const outRoot = path.resolve(process.env.OUT_DIR || path.join(ROOT, "dist"));
  const version = readManifestVersion();
  const stagingDir = path.join(outRoot, "tinkr-extension");
  const zipPath = path.join(outRoot, `tinkr-v${version}.zip`);
  const publicZip = path.join(ROOT, "web", "public", "downloads", "tinkr-extension.zip");

  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const manifestKey = manifestKeyFromPem(pemPath);
  const manifest = patchManifest(
    JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")),
    { appUrl, apiUrl, manifestKey }
  );
  fs.writeFileSync(path.join(stagingDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const config = `const TINKR_CONFIG = {\n  appUrl: "${appUrl}",\n  apiUrl: "${apiUrl}"\n};\n`;
  fs.writeFileSync(path.join(stagingDir, "tinkr-config.js"), config);

  for (const file of EXTENSION_FILES) {
    if (file === "manifest.json" || file === "tinkr-config.js") continue;
    fs.copyFileSync(path.join(ROOT, file), path.join(stagingDir, file));
  }
  for (const dir of EXTENSION_DIRS) {
    copyTree(path.join(ROOT, dir), path.join(stagingDir, dir));
  }

  fs.mkdirSync(path.dirname(publicZip), { recursive: true });
  fs.mkdirSync(outRoot, { recursive: true });
  await zipDirectory(stagingDir, zipPath);
  fs.copyFileSync(zipPath, publicZip);

  const checksum = sha256File(zipPath);
  const checksumPath = `${zipPath}.sha256`;
  fs.writeFileSync(checksumPath, `${checksum}  tinkr-v${version}.zip\n`);

  console.log(JSON.stringify({
    version,
    appUrl,
    apiUrl,
    zipPath,
    publicZip,
    checksum,
    hasStableKey: Boolean(manifestKey)
  }, null, 2));

  if (!manifestKey) {
    console.error("\nNo EXTENSION_PEM found — packed extension will get a random ID on each machine.");
    console.error("Generate scripts/extension.pem and re-pack for trusted auth pairing.");
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
