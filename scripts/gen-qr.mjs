#!/usr/bin/env node
// Render the QR codes into assets/, so the share page needs no network call and
// no CDN library. Re-run if SITE_URL changes.
//   qr.svg          -> the site, for choosing a name and setting preferences
//   qr-feedback.svg -> the questionnaire the audience fills in after a talk
// Each also gets a .png, big enough to drop straight onto a slide.
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

  // 1200px so it stays crisp blown up on a projector or printed on a handout.
  const png = file.replace(/\.svg$/, ".png");
  await QRCode.toFile(png, url, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,                   // a quiet border, or scanners struggle
    width: 1200,
    color: { dark: "#000000", light: "#ffffff" },
  });
  console.log(`${file} + ${png} -> ${url}`);
}
