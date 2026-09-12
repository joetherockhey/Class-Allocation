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
| `feedback.html` + `assets/feedback.js` | what the audience scans: pick a tutorial, four sliders, a comment |
| `assets/feedback-stats.js` | the questions, and the sums behind the home-page panel. Pure, tested by `npm test` |
| `assets/feedback-view.js` | the "Feedback per tutorial" panel on the home page |
| `assets/config.js` | Supabase URL + anon key (public, committed), `MIN_PICKS*`, `SLIDES_URL` |
| `assets/api.js` | swaps between Supabase and a localStorage preview backend |
| `.env` | **service-role key, gitignored, local only** — needed by every script below |
| `data/*.csv` | roster and timetable, the source of truth |
| `supabase/schema.sql`, `supabase/messages.sql` | both already run; re-runnable |
| `supabase/feedback.sql`, `supabase/feedback-choices.sql` | the audience-feedback table, then its two pick-one columns. Both re-runnable |

## Commands

```bash
npm run seed          # push data/*.csv to Supabase (removes anyone off-roster)
npm run gen-demo      # refresh assets/demo-data.js after editing the CSVs
npm run set-prefs -- "Full Name" T23 T24     # enter someone's availability by hand
npm run allocate-multi -- input.json --out=groups.json
npm run groups-page -- groups.json groups.html
npm run scenarios     # build + measure the staggered-timetable alternative
npm run publish -- --close|--open            # stop/allow further submissions
npm run gen-qr        # both QR codes: the site, and the feedback form
npm test              # the feedback sums
```

Typical loop: download `allocation-input.json` from the dashboard, save it as
`input.json`, run `allocate-multi`, then `groups-page`, then commit and push.
GitHub Pages takes ~2 minutes and caches for 10, so verify with `curl` rather
than trusting a browser refresh.

## Rules the allocator enforces, in priority order

1. Every tutorial is covered by **at least 2** people
2. **No more than 5** in any tutorial (was 6; `scripts/trim-groups.mjs` applies
   the tighter cap to an existing plan without reshuffling everything)
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

## Audience feedback

The BUS1000 students who *watch* a talk rate it at `feedback.html`. The only
way in is the QR on `share.html?for=feedback` — nothing on the site links to
the form, and the form links nowhere back, so what a scanned phone gets is a
single page that does one thing. It is not secret, just isolated: the URL is
public if someone types it. That page also asks for the timetable alone and
never `loadCore()`, so a room full of strangers is not handed the roster.

They pick their tutorial, drag four 0-10 sliders, answer two pick-one
questions, and can write a comment. Results appear under **Feedback per
tutorial** on both the home page and the dashboard — the same
`assets/feedback-view.js` drives both, keyed off the ids `fbResults` and
`fbTotal`, so a page gets the panel by declaring those two ids.

The questions live in `assets/feedback-stats.js`. Reword a label freely;
adding or removing a pick-one *option* also means editing the check constraint
in `supabase/feedback-choices.sql`, because the stored slugs are constrained.

It is anonymous, and deliberately so: the audience is not on our roster and
unsigned feedback is more honest. The costs of that are worth knowing.

- Nothing stops a second submission. The form remembers what this browser has
  already rated and warns, but that is a speed bump, not a lock.
- A slider that was never dragged is stored as `null`, not as a middling 5, so
  averages only count answers somebody actually gave. `responses` counts the
  person; `answered` counts the sliders.
- Good is 7+, not good is under 4, and the bar is drawn from raw counts so the
  three shares can never round to 101%.
- Nobody can edit or delete feedback once it is in, including the tutor from
  the browser. Use the service key if something has to go.

`TEST01` is a scratch tutorial for trying the form. Anything whose id starts
with `TEST` is filtered out of the preference grid and the dashboard counts by
`notTest` in `assets/api.js` — it exists only so feedback has something safe to
point at. Leaving it in costs nothing; deleting the row removes its feedback
with it.

## Slides

One deck for the whole course, two ways to it from the home page:

- **Present slides on Canva** — `SLIDES_URL` in `assets/config.js`
- **Download slides as PowerPoint** — `assets/red-flag-green-flag.pptx`, 15MB,
  committed so GitHub Pages serves it. The `download` attribute gives it a
  readable filename; that only works because it is same-origin.

Replacing the deck means replacing that file: same path, and the link needs no
change. The per-tutorial Menti link is gone — `data/menti.json` and the button
it put on every card came out.

The stored URL is the `/view` form on purpose: the short link we were handed
redirected to `/edit`, which puts an editable deck one tap away for anyone who
finds the page. A `/view` URL is not a permission — set the Canva share option
to view-only as well.

## Dates

The tutorials run once, in the week beginning `WEEK_START` in
`assets/config.js` (Monday 14 September 2026). They are not weekly fixtures.
The upcoming-tutorials panel dates everything from there; move that one value
if the week moves.

## Saved plans

`plans/` holds the arrangements that have been agreed, each with the pin set
that produced it. `npm run use-plan` lists them; `npm run use-plan -- og`
swaps one in and rebuilds the page.

- **og** — before the clash fix. Max Dewinter deliberately in both T23 and T24
  at the same hour; T24 holds seven.
- **idea1** — nobody is in two tutorials at once. Max kept T23 (his second
  choice) over T24 (his third), which also brought T24 back to six.
- **max5** — live. idea1 trimmed to at most five per tutorial. Fifteen people
  who were presenting three times came out of a six-person group and now
  present twice. Kenn Surya was protected, and pinned placements were kept.

The tutorial-clashes tab is off. `npm run groups-page -- groups.json
groups.html --with-clashes` brings it back; `clashes.json` is still on disk.

## Current state

50 students (11 vets), 23 tutorials, 45 submissions. Five students never
submitted and are unplaced: Eleanor Forsyth, John El-Barhoun, Nhu Ngo,
Stefan Ferster, Tara Stevens.

Open threads:
- Idea 2 (staggering Tut 12, 18, 24, 28 by 30 minutes) was measured and not
  taken. `input-idea2.json` and `groups-idea2.json` still hold that working if
  it comes back up.
- T22 and T28 have no vet available at all; no vet listed those slots.
