# Tutorial presentation groups

Students pick which tutorial slots they can attend; the tutor allocates them
into presentation groups. Static site on GitHub Pages, data in Supabase.

- **Students:** https://joetherockhey.github.io/Class-Allocation/
- **Groups:** https://joetherockhey.github.io/Class-Allocation/groups.html
- **Dashboard:** https://joetherockhey.github.io/Class-Allocation/admin.html (unlisted, not protected)
- **Projector QR:** https://joetherockhey.github.io/Class-Allocation/share.html
- **Repo:** https://github.com/joetherockhey/Class-Allocation (public)

## Layout

| Path | What |
|---|---|
| `index.html` + `assets/student.js` | student page: pick name, tap slots on a week grid |
| `groups.html` | generated results page: by tutorial, by person, tutorial clashes |
| `admin.html` | submission progress, slot coverage, export button |
| `assets/config.js` | Supabase URL + anon key (public, committed), `MIN_PICKS*` |
| `assets/api.js` | swaps between Supabase and a localStorage preview backend |
| `.env` | **service-role key, gitignored, local only** — needed by every script below |
| `data/*.csv` | roster and timetable, the source of truth |
| `supabase/schema.sql`, `supabase/messages.sql` | run once each in the SQL editor |

## Commands

```bash
npm run seed          # push data/*.csv to Supabase (removes anyone off-roster)
npm run gen-demo      # refresh assets/demo-data.js after editing the CSVs
npm run set-prefs -- "Full Name" T23 T24     # enter someone's availability by hand
npm run allocate-multi -- input.json --out=groups.json
npm run groups-page -- groups.json groups.html
npm run scenarios     # build + measure the staggered-timetable alternative
npm run publish -- --close|--open            # stop/allow further submissions
```

Typical loop: download `allocation-input.json` from the dashboard, save it as
`input.json`, run `allocate-multi`, then `groups-page`, then commit and push.
GitHub Pages takes ~2 minutes and caches for 10, so verify with `curl` rather
than trusting a browser refresh.

## Rules the allocator enforces, in priority order

1. Every tutorial is covered by **at least 2** people
2. **No more than 6** in any tutorial
3. Everyone who submitted presents **at least once**, ideally 2-3

Above all of these sits a hard constraint that nobody is placed in two
tutorials **running at the same hour** — several tutorials share a time in
different rooms, and availability cannot express that (someone free at Wed 4pm
truthfully lists both Wed 4pm tutorials). Getting this wrong once put 11
students in two places at once; keep it.

Nobody is ever placed in a tutorial they did not list.

## Decisions that live in files, not in anyone's head

- `data/pins.json` — placements decided by hand (`force` / `block`). Without
  these, re-running the allocator silently undoes them.
- `data/load-overrides.json` — per-student caps on how many tutorials they do.
- `data/together.json` — people who asked to present together. A preference,
  weighted below the hard rules, and reported when it cannot be met.
- `assets/config.js` → `MIN_PICKS_BY_NAME` — students allowed to submit fewer
  than 5 choices.

Names in all of these must match `data/roster.csv` exactly; unmatched names are
reported rather than ignored.

## Saved plans

`plans/` holds the arrangements that have been agreed, each with the pin set
that produced it. `npm run use-plan` lists them; `npm run use-plan -- og`
swaps one in and rebuilds the page.

- **og** — before the clash fix. Max Dewinter deliberately in both T23 and T24
  at the same hour; T24 holds seven.
- **idea1** — live. Nobody is in two tutorials at once. Max kept T23 (his
  second choice) over T24 (his third), which also brought T24 back to six.

The tutorial-clashes tab is off. `npm run groups-page -- groups.json
groups.html --with-clashes` brings it back; `clashes.json` is still on disk.

## Current state

50 students (11 vets), 23 tutorials, 45 submissions. Five students never
submitted and are unplaced: Eleanor Forsyth, John El-Barhoun, Nhu Ngo,
Stefan Ferster, Tara Stevens.

Open threads:
- `supabase/messages.sql` has **not** been run, so the per-tutorial message
  boards say "not set up yet" instead of working.
- Idea 2 (staggering Tut 12, 18, 24, 28 by 30 minutes) was measured and not
  taken. `input-idea2.json` and `groups-idea2.json` still hold that working if
  it comes back up.
- T22 and T28 have no vet available at all; no vet listed those slots.
