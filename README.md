# Tutorial presentation groups

Students open a link, click their name, and drag the tutorial slots they can
attend into preference order. You then run one command to split them into
groups — each group gets a slot everyone in it can make, and at least one vet.

- `index.html` — student page (no password; they pick their name)
- `admin.html` — your dashboard: who has submitted, slot coverage, export button
- `scripts/allocate.mjs` — builds the groups
- Hosting: GitHub Pages (free, static). Data: Supabase (free tier).

---

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is plenty).
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, run it.
3. **Project Settings → Data API**, copy the **Project URL** and the **anon** key.
4. Paste both into `assets/config.js`.

```js
export const SUPABASE_URL      = "https://abcdefgh.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGci...";
```

The anon key is meant to be public — committing it is fine. The **service_role**
key is not: it goes in `.env`, which is gitignored.

```bash
cp .env.example .env      # then fill in SUPABASE_URL and SUPABASE_SERVICE_KEY
```

## 2. Your data

Edit the two CSVs. They currently hold placeholder names so you can try the
whole flow before real data arrives.

**`data/roster.csv`** — one row per student. Put `yes` in `is_vet` for your 12 vets.

```csv
name,is_vet
Aisha Ahmed,
Chloe Choudhury,yes
```

**`data/tutorials.csv`** — one row per tutorial slot.

```csv
id,label,when,location,sort_order
T01,Tutorial 1,Mon 14 Sep 09:00-10:00,Room A1,1
```

Then push them up:

```bash
npm install
npm run seed
```

Re-run `npm run seed` any time you change the CSVs. Names must be unique — if you
have two students with the same name, disambiguate them (`Sam Lee (B)`).
Removing someone from the roster removes them from the site too.

## 3. Publish the site

```bash
git add -A && git commit -m "Tutorial group allocation site"
git remote add origin https://github.com/YOUR-USER/tutorial-groups.git
git push -u origin main
```

Then **Settings → Pages → Source: Deploy from a branch → `main` / root**.
A minute later the site is at `https://YOUR-USER.github.io/tutorial-groups/`.

Send students that link. Your dashboard is the same URL + `/admin.html` — it is
unlisted rather than protected, so just don't share it with the class.

## 4. Collect, then allocate

Watch `admin.html` until everyone has submitted, then:

```bash
npm run publish -- --close     # stop further edits (optional)
```

Click **Download allocation-input.json** on the dashboard, save it in this
folder, and run:

```bash
npm run allocate
```

You get a printed breakdown plus `allocation.json`. Useful flags:

| Flag | Default | What it does |
|---|---|---|
| `--groups=10` | 10 | how many groups |
| `--per-slot=1` | 1 | how many groups may share one tutorial slot |
| `--seed=123` | fixed | change it to explore a different solution |
| `--restarts=600` | 600 | more restarts, better answer, slower |

The allocator guarantees that every member can attend their group's slot, and
that every group has a vet. It then minimises how far down people's lists they
land. Read the summary line — `Mean choice 2.00` means the average student got
their second pick.

If it warns about group sizes, some students listed too few slots. Ask them to
add more, or accept the imbalance.

## 5. Release the groups

```bash
npm run publish            # upload, still hidden from students
npm run publish -- --live  # reveal
```

Students revisiting the site now see their group, their slot, and their
teammates. `npm run publish -- --hide` puts it back.

---

## Preview mode

Until `assets/config.js` has Supabase keys the site runs in **preview mode**:
the real roster and timetable, real UI, but answers are kept in the browser's
localStorage instead of a database. Good for checking the flow; useless for
collecting 51 people's answers, since nothing is shared.

```bash
npm run serve      # then open http://localhost:3000
```

After editing `data/*.csv`, refresh what preview mode shows:

```bash
npm run gen-demo
```

To see what an allocation looks like before anyone submits:

```bash
npm run demo
node scripts/allocate.mjs demo-input.json
```

## A note on the honour system

Login is a name click — there is no password, so in principle a student could
submit as someone else. Row-level security stops anyone editing the roster, the
tutorial list, or the published groups from the browser; preferences themselves
are open. For a class of 50 that is normally the right trade. If you want it
locked down, the smallest change is Supabase Auth with magic links to university
email addresses.
