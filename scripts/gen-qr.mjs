#!/usr/bin/env node
// Render SITE_URL as a QR code into assets/qr.svg, so the share page needs no
// network call and no CDN library. Re-run if SITE_URL changes.
import { readFileSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";

const cfg = readFileSync("assets/config.js", "utf8");
const m = /SITE_URL\s*=\s*"([^"]+)"/.exec(cfg);
if (!m) { console.error("SITE_URL not found in assets/config.js"); process.exit(1); }
const url = m[1];

const svg = await QRCode.toString(url, {
  type: "svg",
  errorCorrectionLevel: "M",   // survives a bit of glare on a projector
  margin: 1,
  color: { dark: "#000000", light: "#ffffff" },
});
writeFileSync("assets/qr.svg", svg);
console.log(`assets/qr.svg -> ${url}`);
