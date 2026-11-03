# Deployment topology

There are two separate Compass stacks. They must stay separate so that the working legacy app is never overwritten.

| Role | GitHub repository | Cloudflare Worker | Folder |
| --- | --- | --- | --- |
| Legacy GNDEC Compass / GNDEC One | `kkkjbn/GNDEC_COMPASS` | `gndec-compass` → https://gndec-compass.koushikjain2007.workers.dev/ | `D:\testings\gndec` |
| Compass 2.0 rebuild | `kkkjbn/GNDEC_COMPASS_2` | `gndec-compass-v2` → https://gndec-compass-v2.koushikjain2007.workers.dev/ | `D:\testings\gne2\compass-v2` |

## Why two stacks

- The legacy Worker is already connected to `GNDEC_COMPASS` and serves the old UI. Deploying the rebuild there would replace a working app and break the old URL.
- The rebuild uses a different data model, routes, assets and service-worker cache. It has its own Worker and its own repository so either stack can be updated or rolled back independently.
- Compass 2.0 links to the legacy app from `/legacy`, Settings and the footer. It never writes to the legacy repo or Worker.

## What is "extra"

Nothing needs to be deleted. The pair below **is** the Compass 2.0 stack:

- `kkkjbn/GNDEC_COMPASS_2`
- `gndec-compass-v2`

They are only "extra" if the intention is to abandon the rebuild. If the rebuild is kept, keep both and treat `GNDEC_COMPASS` + `gndec-compass` as the frozen legacy fallback.

## Deploy

```sh
cd D:\testings\gne2\compass-v2
npm ci
npm test
npm run deploy
```

`npm run deploy` builds `dist/`, generates the hashed service worker and runs `wrangler deploy` using the `gndec-compass-v2` name from `wrangler.jsonc`.

## Automatic deploy from GitHub

`.github/workflows/verify.yml` runs tests and builds on every push and pull request. On pushes to `main` it also deploys when the repository secret `CLOUDFLARE_API_TOKEN` exists.

Add a Cloudflare API token with **Workers Scripts: Edit** permission as the `CLOUDFLARE_API_TOKEN` secret in `kkkjbn/GNDEC_COMPASS_2` → Settings → Secrets and variables → Actions. Without the secret, the workflow still verifies the build but skips the deploy.

The Cloudflare dashboard Workers Builds Git integration can alternatively connect `gndec-compass-v2` directly to `kkkjbn/GNDEC_COMPASS_2`; do **not** point it at the legacy `gndec-compass` Worker.

## If the stacks are ever consolidated

1. Verify Compass 2.0 on the new Worker across desktop and mobile, including offline reload, Ask Compass, admin and deep links.
2. Export or back up the legacy Worker and its repository.
3. Only then decide whether to archive `GNDEC_COMPASS` and `gndec-compass`, or copy the legacy UI into a `/legacy` route of the rebuild.
4. Never deploy the rebuild over `gndec-compass` without a rollback copy; the old URL is still the stable fallback.

## Current verified URLs

- Compass 2.0: https://gndec-compass-v2.koushikjain2007.workers.dev/
- Legacy: https://gndec-compass.koushikjain2007.workers.dev/#/today
- Repository: https://github.com/kkkjbn/GNDEC_COMPASS_2
