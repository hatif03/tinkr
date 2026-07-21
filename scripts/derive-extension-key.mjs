#!/usr/bin/env node
/**
 * Derive a stable Chrome extension ID and manifest "key" from extension.pem.
 *
 * Usage:
 *   openssl genrsa -out scripts/extension.pem 2048
 *   node scripts/derive-extension-key.mjs
 *   node scripts/derive-extension-key.mjs --pem path/to/extension.pem
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PEM = path.join(__dirname, "extension.pem");

function parseArgs(argv) {
  const pemFlag = argv.indexOf("--pem");
  const pemPath = pemFlag >= 0 ? argv[pemFlag + 1] : DEFAULT_PEM;
  return { pemPath: path.resolve(pemPath) };
}

function extensionIdFromPublicDer(der) {
  const hash = crypto.createHash("sha256").update(der).digest();
  let id = "";
  for (let i = 0; i < 16; i += 1) {
    id += String.fromCharCode(97 + (hash[i] >> 4));
    id += String.fromCharCode(97 + (hash[i] & 0x0f));
  }
  return id;
}

function main() {
  const { pemPath } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(pemPath)) {
    console.error(`Missing PEM file: ${pemPath}`);
    console.error("Generate one with: openssl genrsa -out scripts/extension.pem 2048");
    process.exit(1);
  }

  const pem = fs.readFileSync(pemPath, "utf8");
  const privateKey = crypto.createPrivateKey(pem);
  const publicKey = crypto.createPublicKey(privateKey);
  const der = publicKey.export({ type: "spki", format: "der" });
  const manifestKey = der.toString("base64");
  const extensionId = extensionIdFromPublicDer(der);

  console.log(JSON.stringify({ extensionId, manifestKey }, null, 2));
  console.error("\nSet NEXT_PUBLIC_TINKR_EXTENSION_ID to the extensionId above.");
  console.error("Pass manifestKey to pack-extension.mjs or add \"key\" to manifest.json for local dev.");
}

main();
