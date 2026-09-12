#!/usr/bin/env node
// Render the two QR codes into assets/, so the share page needs no network
// call and no CDN library. Re-run if SITE_URL changes.
//   qr.svg          -> the site, for choosing a name and setting preferences
//   qr-feedback.svg -> the questionnaire the audience fills in after a talk
import { readFileSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";

const cfg = readFileSync("assets/config.js", "utf8");
const m = /SITE_URL\s*=\s*"([^"]+)"/.exec(cfg);
if (!m) { console.error("SITE_URL not found in assets/config.js"); process.exit(1); }
const base = m[1].endsWith("/") ? m[1] : m[1] + "/";

for (const [file, url] of [
  ["assets/qr.svg", base],
  ["assets/qr-feedback.svg", base + "feedback.html"],
]) {
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",   // survives a bit of glare on a projector
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
  writeFileSync(file, svg);
  console.log(`${file} -> ${url}`);
}
