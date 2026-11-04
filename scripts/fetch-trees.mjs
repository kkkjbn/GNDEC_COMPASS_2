// Fetch real tree points and green areas inside the campus bounds from OSM.
// Run with: node scripts/fetch-trees.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'public', 'data');
const campus = JSON.parse(await readFile(path.join(dataDir, 'campus.json'), 'utf8'));
const { minLat, maxLat, minLon, maxLon } = campus.bounds;
const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;

const query = `[out:json][timeout:120];
(
  node["natural"="tree"](${bbox});
  way["natural"="wood"](${bbox});
  way["landuse"="forest"](${bbox});
  way["landuse"="grass"](${bbox});
  way["landuse"="meadow"](${bbox});
  way["leisure"="garden"](${bbox});
  way["natural"="scrub"](${bbox});
);
out center tags;`;

const response = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: {
    'User-Agent': 'GNDEC-Compass-2/2.2 (student project; campus map data build)',
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: `data=${encodeURIComponent(query)}`,
});
if (!response.ok) throw new Error(`Overpass ${response.status}: ${await response.text()}`);
const json = await response.json();

const posOf = (lat, lon) => [
  Number(((lon - minLon) / (maxLon - minLon)).toFixed(6)),
  Number(((maxLat - lat) / (maxLat - minLat)).toFixed(6)),
];

const trees = [];
const areas = [];
for (const el of json.elements || []) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  if (el.type === 'node' && t.natural === 'tree') {
    trees.push({ lat, lon, pos: posOf(lat, lon), kind: t.genus || t.species || t.leaf_type || 'tree' });
  }
  if (el.type === 'way') {
    areas.push({ id: String(el.id), kind: t.landuse || t.natural || t.leisure || 'green', pos: posOf(lat, lon) });
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  source: 'OpenStreetMap / Overpass API',
  license: 'ODbL 1.0',
  bounds: campus.bounds,
  count: trees.length,
  trees,
  // Only centres: a shaded green tint around each area, not a landuse polygon.
  areas,
};
await writeFile(path.join(dataDir, 'campus-trees.json'), JSON.stringify(out));
console.log(`trees: ${trees.length}, green areas: ${areas.length}`);
