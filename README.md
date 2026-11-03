# GNDEC Compass 2.0

A student-built, installable campus companion for **Guru Nanak Dev Engineering College (GNDEC), Ludhiana**. It lives in its own repository and Cloudflare Worker and does **not** modify or deploy the older GNDEC Compass project (still available at `https://gndec-compass.koushikjain2007.workers.dev/`).

- Live app: **https://gndec-compass-v2.koushikjain2007.workers.dev/**
- Repository: **https://github.com/kkkjbn/GNDEC_COMPASS_2**
- Legacy app (untouched): `https://gndec-compass.koushikjain2007.workers.dev/`

The repo/Worker split, and why the legacy stack should not be overwritten, is documented in [`DEPLOYMENT.md`](./DEPLOYMENT.md). The collected image groups, their provenance and naming caveats are documented in [`IMAGE-INVENTORY.md`](./IMAGE-INVENTORY.md).

## What is inside

- **Today** — current/next class, full-day timeline, next holiday and quick campus actions.
- **Timetable** — 54 published section/subgroup records, day view, weekly grid, mobile week view, teacher and room schedules, section comparison and a free-room finder.
- **Rasta Saathi map** — searchable illustrated campus map built from OpenStreetMap geometry, 45 places, category filters, walking routes, step directions and photo lightbox.
- **Students** — 1,146-record first-year public roster searchable by CRN, name, branch, section, subsection or mentor. Phone/email/address stay out of the public dataset.
- **Faculty** — 272 public profiles with department filters, offices/HODs, timetable-only teachers and class schedules.
- **Study hub** — 23 syllabus documents, 152 question banks, 1,600 indexed previous-year papers, exam notices, a seven-step exam planner and honest “no verified notes yet” messaging.
- **Notices & exams** — official notices, exam updates and the published 2026 holiday calendar.
- **Ask Compass** — a deterministic, offline retrieval assistant (not a generative LLM) for timetable, current/next class, rooms, routes, people, counts, notices, exams, syllabus, papers, arithmetic and Hinglish/Punjabi-English phrasing.
- **Global search** — `Ctrl/Cmd+K` palette across sections, places, rooms, papers, students and faculty.
- **Settings** — local-only profile, light/dark/system theme, bookmarks, offline campus pack, install/update controls and privacy/reset controls.
- **Admin studio** — `/admin`, passcode-gated in the browser. Data-health checks, validation records, room/place corrections, override import/export, health-report export, cache tools and a danger zone. This is a **client-side convenience gate, not server-grade authentication**; overrides live only in that browser.
- **PWA/offline** — installable manifest, generated service worker, cached app shell/data/assets and a user-triggered offline photo pack.
- **Legacy view** — `/legacy` and Settings link to the old Compass without touching it.

## Data coverage

| Dataset | Count | Notes |
| --- | ---: | --- |
| Timetable sections/subgroups | 54 | 875 lecture records; first year complete, some 2nd/3rd-year groups partial |
| Public student roster | 1,146 | First-year permanent-section roster; private contact fields omitted |
| Faculty profiles | 272 | Public directory plus timetable-only teachers |
| Rooms | 79 | Timetable room codes; block/floor inferred where not independently verified |
| Campus places | 45 | OSM geometry plus public campus landmarks |
| Previous-year papers | 1,600 | Indexed links to the original PDFs; solutions not included |
| Question banks | 152 | Public IT-department resources |
| Syllabus documents | 23 | Scheme/session varies; match to your batch |
| Notices / holidays / exam notices | 28 / 35 / 5 | Official sources, checked 2026 |

Sources are recorded in `public/data/sources.json`; coverage gaps and manual data to collect are in [`MISSING-INFO.md`](./MISSING-INFO.md).

## Run locally

Requires Node.js 20 or newer.

```sh
npm ci
npm test
npm run dev
```

Production preview:

```sh
npm run build
npm run preview
```

## Test

```sh
npm test
```

The suite checks the published timetable, campus graph/place coordinates, photo files, public-roster privacy (no phone/email/address), source registry, and 20 Ask Compass intent-routing cases including Hinglish, broken spellings, section parsing, rooms, teachers, counts and routes.

## Deploy

```sh
npm run build
npx wrangler deploy
```

The Worker is `gndec-compass-v2` with static assets from `dist/` and SPA fallback. GitHub Actions runs tests/builds on pushes and pull requests. For automatic deploys on `main`, add a Cloudflare API token as the repository secret `CLOUDFLARE_API_TOKEN`.

## Privacy and honesty

- The public student roster includes name, CRN, branch, section, subsection, mentor and mentor venue. It deliberately omits phone numbers, personal email, address and private contact data.
- Profile and admin overrides are stored in `localStorage`/`sessionStorage` in your browser and are not sent to the Worker.
- Walking routes, room-to-building links and timings are **estimates** unless explicitly marked verified. Indoor door-level navigation is not available yet.
- The timetable source is the official FET export dated **17 September 2026**. Always confirm last-minute room or time changes with your department.
- Photos come from public GNDEC pages/galleries as credited in the data. Map geometry is based on OpenStreetMap data, attributed beside the map.
- This is an independent student project by **Team Codestorm** and is **not an official GNDEC service**.

## Project layout

```
src/
  components/    Shell, command search, profile dialog, shared UI
  lib/           assistant, campus graph, router, search, timetable, utils
  pages/         Today, Timetable, Students, Faculty, Map, Study, Notices,
                 Ask, Settings, About, Legacy, Admin
  context.jsx    data loading, profile, offline cache, admin overrides
  styles/        ordered feature and responsive stylesheets
public/
  data/          published JSON datasets
  img/           hero, gallery and room photos
scripts/         postbuild service-worker generation
tests/           data and assistant tests
```
