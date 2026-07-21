#!/usr/bin/env node
/** Generate scripts/extension.pem using Node crypto (no openssl required). */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pemPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "extension.pem");
if (fs.existsSync(pemPath)) {
  console.error(`Already exists: ${pemPath}`);
  process.exit(0);
}
const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});
fs.writeFileSync(pemPath, privateKey);
console.log(`Wrote ${pemPath}`);
console.log("Run: node scripts/derive-extension-key.mjs");
