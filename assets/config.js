// Fill these in from Supabase: Dashboard > Project Settings > Data API.
// The anon key is designed to be public - it is safe to commit. Never put the
// service_role key in this file; it belongs in .env (which is gitignored).
export const SUPABASE_URL      = "https://joujmarthnkvnwismcxo.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvdWptYXJ0aG5rdm53aXNtY3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5MjYxMDcsImV4cCI6MjEwNDUwMjEwN30.lC5WOqa7DcAO1mnMnfjn9_Rt9Nhc2m68zfttCCKhkxY";

// Shown at the top of the student page.
export const COURSE_TITLE = "Tutorial Presentation Groups";
export const INTRO = "Pick your name, then tap every tutorial time you could attend. You will be placed in a group of about five and given one of the times you chose.";

// Fewest times a student must pick before they can submit.
export const MIN_PICKS = 5;

// Public address of this site. Used for the QR code shown on the share page.
// Change it and re-run `npm run gen-qr` if the site ever moves.
export const SITE_URL = "https://joetherockhey.github.io/Class-Allocation/";
