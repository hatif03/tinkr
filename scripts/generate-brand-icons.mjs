import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "assets", "brand");
const WEB_OUT = path.join(ROOT, "web", "public", "brand");
const sizes = [16, 32, 48, 128];

function drawStar(ctx, cx, cy, outer, inner) {
  const points = 4;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 2) + (i * Math.PI) / points;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function createMark(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const radius = Math.round(size * 0.34);
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, radius);
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#d0ff5b");
  gradient.addColorStop(1, "#74e7ff");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.fillStyle = "#101116";
  drawStar(ctx, size / 2, size / 2, size * 0.24, size * 0.09);
  return canvas;
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WEB_OUT, { recursive: true });
for (const size of sizes) {
  fs.writeFileSync(path.join(OUT, `tinkr-${size}.png`), createMark(size).toBuffer("image/png"));
}

// The 128 px mark is the shared UI master. Dashboard and login deliberately
// use this exact asset rather than a separate logo illustration, so the
// extension and web app cannot drift apart again.
const master = createMark(128);
const masterPng = master.toBuffer("image/png");
fs.writeFileSync(path.join(OUT, "tinkr-logo.png"), masterPng);
fs.writeFileSync(path.join(WEB_OUT, "tinkr-128.png"), masterPng);
fs.writeFileSync(path.join(WEB_OUT, "tinkr-logo.png"), masterPng);

// JPEG has no alpha channel. Give sharing contexts the same ink background
// that surrounds the mark in tinkr rather than an arbitrary white matte.
const jpegCanvas = createCanvas(128, 128);
const jpegContext = jpegCanvas.getContext("2d");
jpegContext.fillStyle = "#101116";
jpegContext.fillRect(0, 0, 128, 128);
jpegContext.drawImage(master, 0, 0, 128, 128);
const masterJpeg = jpegCanvas.toBuffer("image/jpeg", 92);
fs.writeFileSync(path.join(OUT, "tinkr-logo.jpg"), masterJpeg);
fs.writeFileSync(path.join(WEB_OUT, "tinkr-logo.jpg"), masterJpeg);

console.log(`Wrote ${sizes.length} extension icons and shared web brand assets.`);
