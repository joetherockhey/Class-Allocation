// Fill these in from Supabase: Dashboard > Project Settings > Data API.
// The anon key is designed to be public - it is safe to commit. Never put the
// service_role key in this file; it belongs in .env (which is gitignored).
export const SUPABASE_URL      = "https://joujmarthnkvnwismcxo.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvdWptYXJ0aG5rdm53aXNtY3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5MjYxMDcsImV4cCI6MjEwNDUwMjEwN30.lC5WOqa7DcAO1mnMnfjn9_Rt9Nhc2m68zfttCCKhkxY";

// Shown at the top of the student page.
export const COURSE_TITLE = "BUS1000 x WORK3601 Teamwork Tutorials";
export const INTRO = "We are going into BUS1000 tutorials to spend half an hour talking to first-year students about teamwork. Check the presentation groups to see which sessions you are on, then post here about how yours went - photos welcome.";

// Fewest times a student must pick before they can submit.
export const MIN_PICKS = 5;

// Individual exceptions, keyed by the exact name in data/roster.csv. Anyone
// not listed here gets MIN_PICKS.
export const MIN_PICKS_BY_NAME = {
  "Leila Carr": 2,
  "Annabelle Campbell": 2,
  "Callum Franzman": 2,
  "Emily Dawson-Taylor": 2,
  "Max Dewinter": 4,
};

// Public address of this site. Used for the QR code shown on the share page.
// Change it and re-run `npm run gen-qr` if the site ever moves.
export const SITE_URL = "https://joetherockhey.github.io/Class-Allocation/";

// The Monday of the single week these tutorials run in. Everything is dated
// from here, so the countdowns are real dates rather than a weekly repeat.
// Change it if the week moves.
export const WEEK_START = "2026-09-14";
