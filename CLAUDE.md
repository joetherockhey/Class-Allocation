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
| `index.html` + `assets/student.js` | student page: the feed, and the preference picker behind `?prefs=1` |
| `assets/week.js` | the sidebar list of the week's tutorials, read from `groups.json` |
| `groups.html` | generated results page: by tutorial, by person, tutorial clashes |
| `admin.html` | submission progress, slot coverage, export button |
| `feedback.html` + `assets/feedback.js` | what the audience scans: pick a tutorial, four pick-one questions, two written answers |
| `assets/feedback-stats.js` | the questions, and the sums behind the home-page panel. Pure, tested by `npm test` |
| `assets/feedback-view.js` | the "Feedback per tutorial" panel on the home page |
| `report.html` + `assets/feedback-report.js` | the printable all-tutorials report, saved as a PDF from the browser |
| `assets/config.js` | Supabase URL + anon key (public, committed), `MIN_PICKS*`, `SLIDES_URL` |
| `assets/api.js` | swaps between Supabase and a localStorage preview backend |
| `.env` | **service-role key, gitignored, local only** — needed by every script below |
| `data/*.csv` | roster and timetable, the source of truth |
| `supabase/schema.sql`, `supabase/messages.sql` | both already run; re-runnable |
| `supabase/feedback.sql`, `supabase/feedback-choices.sql` | the audience-feedback table, then the pick-one columns. Both re-runnable |

## Commands

```bash
npm run seed          # push data/*.csv to Supabase (removes anyone off-roster)
npm run gen-demo      # refresh assets/demo-data.js after editing the CSVs
npm run set-prefs -- "Full Name" T23 T24     # enter someone's availability by hand
npm run allocate-multi -- input.json --out=groups.json
npm run groups-page -- groups.json groups.html
npm run scenarios     # build + measure the staggered-timetable alternative
npm run publish -- --close|--open            # stop/allow further submissions
npm run gen-qr        # both QR codes, .svg for the pages and .png for slides
npm test              # the feedback sums, and form options vs the SQL constraint
```

Typical loop: download `allocation-input.json` from the dashboard, save it as
`input.json`, run `allocate-multi`, then `groups-page`, then commit and push.
GitHub Pages takes ~2 minutes and caches for 10, so verify with `curl` rather
than trusting a browser refresh.

## Rules the allocator enforces, in priority order

1. Every tutorial is covered by **at least 2** people
2. **No more than 5** in any tutorial (was 6; `scripts/trim-groups.mjs` applies
   the tighter cap to an existing plan without reshuffling everything). T14
   holds six on purpose - Rohan Howard was moved there from T17 on 14 Sep at
   the tutor's request, knowing it went over
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
way in is the QR on `share.html?for=feedback`, reached from the dashboard now
that the home page's button to it has gone — nothing on the site links to
the form, and the form links nowhere back, so what a scanned phone gets is a
single page that does one thing. It is not secret, just isolated: the URL is
public if someone types it. That page also asks for the timetable alone and
never `loadCore()`, so a room full of strangers is not handed the roster.

They pick their tutorial, answer four pick-one questions (two of them
"compared with before today's session" scales), and can write answers to two
open questions - one about helping someone feel they belong, one for the
presenters. The written ones live in `TEXT_QUESTIONS`; `comment` is the
original column and must stay first, because everything already stored in it
is an answer to the belonging question. Results appear under **Feedback per
tutorial** on both the home page and the dashboard — the same
`assets/feedback-view.js` drives both, keyed off the ids `fbResults` and
`fbTotal`, so a page gets the panel by declaring those two ids.

On the home page it is no longer at the bottom: two tabs, **Feed** and
**Student feedback**, sit under the intro and swap which of `#feedPane` (the
posts and the sidebar) and `#fbPanel` is visible. `showTab()` in `student.js`
toggles `.hidden` and nothing else — neither pane is unloaded or re-fetched on
a switch, and both keep their own polling running behind the other, so a post
or a rating that lands while you are on the far tab is still there. The tab
listeners are attached before `loadCore()` is awaited, so the tabs still work
if the backend is down. The picker (`?prefs=1`) hides the tab bar and both
panes while it is open.

The questions live in `assets/feedback-stats.js`. Reword a label freely;
adding or removing an *option* also means editing the check constraint in
`supabase/feedback-choices.sql`, because the stored slugs are constrained.
`npm test` fails if the two lists drift apart, which is otherwise a bug nobody
sees until a student taps the new option and the insert is rejected.

The 0-10 sliders the form used to open with (`useful`, `clear`, `engaging`,
`confident`) and the `recommend` question were replaced in September 2026. The
columns are still there and still nullable - nothing writes to them now, and
the rows collected under them stay readable.

Wording has been changed several times while responses were coming in. That is
safe for the data: the labels are only what is drawn on screen, and the stored
values are the slugs. Changing a *slug*, renaming a column, or reusing
`comment` for a different question would silently orphan answers already given
- do not. `backups/` holds a dated dump taken before the 14 Sep rewording.

It is not safe for *reading* the results, though, so `WORDING_HISTORY` in
`assets/feedback-stats.js` records what the form said and when, and the panel
shows each answer under the question that person was actually shown. Add an
entry whenever a question or an option label changes while responses are in,
or old answers quietly re-label themselves to wording nobody ever saw. A
tutorial that answered either side of a change is shown split, with a note.

T11 answered the original "Compared with before today's session..." (11 of
them) and T22 answered "Before today's session..." with the middle option
reading "Sometimes" - the wording live between 11:31 and 15:05 AEST on 14 Sep.
One late T11 response falls in T22's window; a wording group smaller than
`MIN_WORDING_GROUP` alongside a bigger one is set aside rather than given its
own bar, and the panel says how many. It still counts in `answered`. Timings come from push time plus
about a minute for Pages, and no response landed within 12 minutes of a
change, so the split is not blurred by caching.

**All tutorials** is charted rather than listed - the per-tutorial panels stay
as plain bars, only the pooled view is drawn. The three scale questions are one
stacked bar each, all the same full width, so what is compared is the shape of
the split rather than how many answered. Widths are of the people who picked a
point on the scale; "not sure" is not one, so it is counted beside the question
instead of drawn; the pick-one is a
part-to-whole bar with a legend carrying the numbers; the written answers
collapse behind `<details>`. Colours were checked with the data-viz palette
validator against the white panel - the six categorical hues pass every gate,
and the diverging set passes both separation floors (the chroma/lightness
"failures" it reports are the categorical rules being applied to a grey
midpoint, which a diverging scale is meant to have). Every segment carries a
visible percentage, which is what the sub-3:1 fills depend on. Options run
most-extreme-first, so the arms must not be reversed when drawn - doing that
once put "strongly disagree" next to the middle.

**All tutorials** is the first button on the panel and what it opens on:
`summariseAll()` pools every real tutorial into one set of percentages and
re-runs every 30 seconds, so it keeps up while a session is still going.

Two things it does not do naively. A question whose wording asked something
materially different is left out of the pooled percentages for that question
only - `summaryExclude` in `WORDING_HISTORY` marks it, and the panel says how
many were left out. That is why T22's study-help answers are missing from the
pooled bar: "Before today's session..." asks what they used to do, not whether
today changed anything. And written answers are filtered by `isRealAnswer`
before anything counts them, so "Nil", "n/a" and a lone "idk" do not, while
"idk, talk to them, but..." does.

The belonging question is bucketed instead by the *action* named, and only in
the pooled **All tutorials** view - one tutorial's dozen answers are quicker to
read than to bucket. `ACTION_CLUSTERS` in `assets/feedback-stats.js` holds the
rules and they are tried in order, specific first: "communicate" appears in
most of the answers, so a catch-all tried early swallows the lot and a word
cloud of them just says COMMUNICATE. The last bucket before "Something else"
is that catch-all, and its size is the finding - roughly a quarter named
nothing concrete. Six buckets because the palette has six hues. Reword a label
freely; changing a `key` is what breaks things.

`classify()` sorts written feedback into positive / constructive / critical on
keywords - it turns on whether there is something to act on rather than tone,
so a suggestion phrased negatively still reads as constructive. `hard to` in
the negative list is qualified to what follows it (`hard to follow`, `hard to
hear`): bare, it filed "they were great, it's hard to present to a sleepy
Friday class" as criticism, when the hard thing was the room, not the talk. It is a
heuristic and will misfile the unusual, which is why the panel prints the
sentences under each heading: a wrong bucket is visible and costs nothing.
Only `presenter_note` is bucketed. The belonging question is marked
`sentiment: false` because its answers are things people intend to do, not
opinions - sorting them by sentiment put twenty of twenty-one in one box.

It is anonymous, and deliberately so: the audience is not on our roster and
unsigned feedback is more honest. The costs of that are worth knowing.

- Nothing stops a second submission. The form remembers what this browser has
  already rated and warns, but that is a speed bump, not a lock.
- A question nobody answered is stored as `null`, and nothing is preselected,
  so a skipped question is never counted as whatever happened to be first.
  `responses` counts the person; `answered` counts the votes on one question.
- The share bars are drawn from raw counts, so they can never round to 101%.
- On the belonging question "Not sure" is an opt-out rather than a point on the
  scale, but it is counted like any other option.
- Nobody can edit or delete feedback once it is in, including the tutor from
  the browser. Use the service key if something has to go.

`TEST01` is a scratch tutorial for trying the form (labelled just "Test"; the
id is what the filtering keys off, so leave it alone). Anything whose id starts
with `TEST` is filtered out by `notTest` in `assets/api.js` — the preference
grid, the dashboard counts, and now the whole feedback panel: since the week
ran, `feedback-view.js` filters both the rows and the tutorial list once at the
top of `render()`, so the scratch tutorial has no button and counts towards
nothing. The row is still there and the form still accepts it, so there is
something safe to point at; deleting the row removes its feedback with it.

## The printable report

**Export all-tutorials PDF** on the feedback panel (home page and dashboard)
opens `report.html?print=1`, which builds the whole week's feedback as one
document and calls `window.print()` once the photos have loaded. There is no
PDF library: print CSS plus the browser's own "Save as PDF" keeps the text
selectable and reuses the charts `feedback-view.js` already draws, which is why
`divergingBars`, `partToWhole` and the palette are exported from it. Importing
that module from the report is safe - its top-level work is guarded on
`#fbResults`, which the report does not have.

It is a snapshot and nothing polls: the week has run, so the only thing that
changes it is changing the code. Page one is the summary and is held to a
single page by `break-after: page` on `.sheet`; it measures 973px against a
1017px A4 body, so adding anything to it means checking it still fits. The
four quotes on it are named in `FRONT_QUOTES`, matched on their opening words -
picked by hand because every rule tried put the longest notes on the page, and
the longest notes are the ones asking for a change. After that come every note to the presenters in the
three sentiment buckets, then the belonging answers in their action clusters,
with one feed photo after each box and the rest in a gallery at the end. Each
photo carries the words posted with it and who posted them. Two of the feed's
photos are not in it - the post that opened the thread and the dog someone put
up once the week was over - both named in `NOT_IN_REPORT` by file name, since a
caption can be edited from the feed and the list would quietly stop matching.

Tut 22's study-help answers are out of the summary already, and not by anything
the report does - `summariseAll()` drops them through `summaryExclude`, so the
report inherits it. That also drops one late Tut 11 response given inside the
same wording window, which is right: those eleven people were asked a different
question.

Three things are load-bearing in the photo URLs, and all three were found the
hard way. `width=1400&height=1400&resize=contain` keeps phone photos from going
in at full resolution *and* keeps their shape: a width on its own resizes the
width and leaves the height, which turned every landscape shot into a squashed
portrait. `format=origin` stops Supabase handing back WebP - a browser cannot
embed WebP in a PDF, so it decodes every photo to a bitmap and the file comes
out at 82MB instead of 8MB. The endpoint rotates by EXIF, so what lands in the
PDF is what the feed shows. If it is ever off, `data-full` on each `<img>`
falls back to the original.

Printing needs **background graphics** on, or every bar and tinted box comes out
white. `print-color-adjust: exact` asks for it; the checkbox in the print dialog
can still override.

## Slides

One deck for the whole course. **Present slides on Canva** — `SLIDES_URL` in
`assets/config.js` — is the only way to it from the home page now, and it sits
in the header beside **See the tutorial groups**; the panel that used to hold
it had nothing else in it. `student.js` still sets that link's href before
anything else loads, so the deck survives the backend being down.

`assets/red-flag-green-flag.pptx` (15MB) is still committed and still served,
but nothing links to it: the download button came off once the week had run,
along with the red note warning that room machines may hold the old deck.
Pages will still hand the file to anyone with the path. Replacing the deck
means replacing that file: same path, and any link put back needs no change.
Replaced 15 Sep with the newer 25-slide deck. The per-tutorial Menti link is gone — `data/menti.json` and the button
it put on every card came out.

The stored URL is the `/view` form on purpose: the short link we were handed
redirected to `/edit`, which puts an editable deck one tap away for anyone who
finds the page. A `/view` URL is not a permission — set the Canva share option
to view-only as well.

## Dates

The tutorials run once, in the week beginning `WEEK_START` in
`assets/config.js` (Monday 14 September 2026). They are not weekly fixtures.
That week has now run, so nothing counts down to it any more. The
upcoming-tutorials panel and `assets/upcoming.js` came out; `assets/week.js`
took the sidebar over with the same dating code and no countdown - every
tutorial Mon to Fri in order, with who presented, where and when. A tutorial
whose `when` will not parse is listed at the bottom under "Time unclear"
rather than dropped, because a group quietly missing from the record is the
failure nobody would spot. The "turn on notifications" prompt went too -
already-granted browsers still get told about new posts, nothing asks any
more.

The "Set preferences" button came off the public page at the same time. The
picker itself is untouched, still in `index.html`, and `?prefs=1` opens it -
the dashboard's only link to it, under **Share with the class**. Anyone who
knows the query string can still reach it; it is out of the way, not shut.

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

Imani Qureshi was dropped from T27 by hand (16 Sep) at the tutor's request; she
presents twice now, and T27 still has four including a vet.

Seyeon Lim was dropped from T10 by hand (15 Sep) after she re-sent her
availability without it; she presents twice now, and T10 still has four.

Since max5 was built, Washiella Jessica was added to T33 by hand (14 Sep) -
she volunteered for it, it was the last tutorial down at two, and it is not on
her list, so the pin is what keeps her there. `groups.json` is therefore max5
plus that one placement; `plans/max5-plan.json` is still the untouched
original. Editing the live plan beat re-running the allocator two days out.

The tutorial-clashes tab is off. `npm run groups-page -- groups.json
groups.html --with-clashes` brings it back; `clashes.json` is still on disk.

## Current state

51 students (11 vets), 23 tutorials, 46 submissions. Four students never
submitted and are unplaced: Eleanor Forsyth, John El-Barhoun, Stefan Ferster,
Tara Stevens.

Nhu Ngo submitted late (16 Sep) and was placed by hand in T27 and T30, both
Thursday, at the tutor's request. That takes T30 to six - the second tutorial
over the cap of five, after T14. Every Thursday pair on her list forces a six,
because only T27, T28 and T30 run that day. Her preferences are not in
`input.json`, so the pins are what hold her.

Ihan Samaraweera joined after the roster was set (14 Sep) and was put in T16
by hand. He is on `roster.csv` and in Supabase, but he never submitted
preferences, so he is not in `input.json` - re-export the dashboard's
allocation input before the next `allocate-multi` run or the pin will have
nobody to match.

Every tutorial now has two or three presenters, so the home page's "tutorials
that need presenters" bar came out, and with it the form students used to
volunteer. The "Send a message to Joe" box on `groups.html` took that job over
and offers joining another tutorial as its first suggestion; those messages
land in the same `tutor_messages` table, so `npm run inbox` still reads them.
"See the tutorial groups" is now a button in the page header. The sidebar
beside the feed holds **Tutorial groups** instead - the whole week listed
in order, which is what the page is for now that the tutorials are a record
rather than a schedule.

Open threads:
- Idea 2 (staggering Tut 12, 18, 24, 28 by 30 minutes) was measured and not
  taken. `input-idea2.json` and `groups-idea2.json` still hold that working if
  it comes back up.
- T22 and T28 have no vet available at all; no vet listed those slots.
