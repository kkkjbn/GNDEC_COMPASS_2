# GNDEC Compass 2.0

A student-built, installable campus guide for GNDEC Ludhiana. This project lives in its own repository and Cloudflare Worker. It does not use or deploy the existing GNDEC Compass project.

## Features

- Responsive dashboard and first-year timetable for all published B.Tech sections
- Campus landmarks, a schematic map, and estimated walking directions
- Public campus photo gallery, official notices, syllabus links, and indexed exam papers
- Local-only timetable section preference; no account or student number is required
- Offline app shell and cached data/photos after the first online visit
- Source links and clear labels where map information is approximate

## Run locally

Requires Node.js 20 or newer.

```sh
npm ci
npm test
npm run dev
```

## Deploy

```sh
npm run build
npx wrangler deploy
```

GitHub Actions runs tests and builds on pushes and pull requests. To enable automatic deploy on pushes to `main`, add a Cloudflare API token with permission to deploy this Worker as the repository secret `CLOUDFLARE_API_TOKEN`.

## Data and privacy

Timetable, campus, notices and study datasets are derived from public GNDEC sources. Source references are included in `public/data/sources.json`. The public build intentionally does not include student rosters or student search indexes. The selected section is saved in browser local storage and is not sent to the Worker.

Walking routes, room-to-building associations, and timings are indicative. The college's public map does not provide verified indoor navigation or accessible route data. Check campus signage and confirm uncertain locations with college staff.

Photos are from public GNDEC pages/galleries as credited in the campus data. Map geometry is based on OpenStreetMap data; attribution appears beside the map. This is an independent student project and is not an official GNDEC service.
