// One-off research pipeline for the 3D campus model.
// Run with: node scripts/build-campus-3d.mjs
//
// Sources:
//  - OpenStreetMap (Overpass API): building tags (levels/height/name) and footpaths
//  - Esri World Imagery (ArcGIS REST export): public satellite basemap
//
// Outputs:
//  - public/data/campus-detail.json   building tags by OSM way id
//  - public/data/campus-paths.json    walkable graph (nodes + edges, metres)
//  - public/img/map/campus-satellite.jpg
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'public', 'data');
const imgDir = path.join(root, 'public', 'img', 'map');

const campus = JSON.parse(await readFile(path.join(dataDir, 'campus.json'), 'utf8'));
const { minLat, maxLat, minLon, maxLon } = campus.bounds;

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const headers = { 'User-Agent': 'GNDEC-Compass-2/2.1 (student project; campus map data build)' };

async function overpass(query, attempt = 1) {
  const response = await fetch(OVERPASS, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!response.ok) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 4000 * attempt));
      return overpass(query, attempt + 1);
    }
    throw new Error(`Overpass ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

// ---- 1. Building tags ------------------------------------------------------
const ids = [...new Set((campus.geometry || []).map((shape) => shape.id).filter((id) => /^\d+$/.test(String(id))))];
const detail = { generatedAt: new Date().toISOString(), source: 'OpenStreetMap / Overpass API', buildings: {} };
const chunk = 80;
for (let i = 0; i < ids.length; i += chunk) {
  const slice = ids.slice(i, i + chunk);
  const query = `[out:json][timeout:90];way(id:${slice.join(',')});out tags;`;
  const json = await overpass(query);
  for (const el of json.elements || []) {
    const t = el.tags || {};
    if (!Object.keys(t).length) continue;
    detail.buildings[String(el.id)] = {
      name: t.name || '',
      levels: t['building:levels'] ? Number(t['building:levels']) : null,
      height: t.height ? parseFloat(t.height) : t['building:height'] ? parseFloat(t['building:height']) : null,
      minLevel: t['building:min_level'] ? Number(t['building:min_level']) : null,
      building: t.building || '',
      amenity: t.amenity || '',
      office: t.office || '',
      shop: t.shop || '',
      tourism: t.tourism || '',
      leisure: t.leisure || '',
      operator: t.operator || '',
      addr: t['addr:full'] || '',
      roofShape: t['roof:shape'] || '',
    };
  }
  process.stdout.write(`tags ${Math.min(i + chunk, ids.length)}/${ids.length}\r`);
}
console.log(`\nbuildings with tags: ${Object.keys(detail.buildings).length}/${ids.length}`);
await writeFile(path.join(dataDir, 'campus-detail.json'), JSON.stringify(detail, null, 2));

// ---- 2. Walkable network ---------------------------------------------------
const highwayQuery = `[out:json][timeout:120];(way["highway"~"^(footway|path|pedestrian|service|residential|unclassified|living_street|steps|track|cycleway)$"](${minLat},${minLon},${maxLat},${maxLon}););out body;>;out skel qt;`;
const wayJson = await overpass(highwayQuery);
const osmNodes = new Map();
for (const el of wayJson.elements || []) {
  if (el.type === 'node') osmNodes.set(el.id, { id: el.id, lat: el.lat, lon: el.lon });
}

const posOf = (node) => [
  Number(((node.lon - minLon) / (maxLon - minLon)).toFixed(6)),
  Number(((maxLat - node.lat) / (maxLat - minLat)).toFixed(6)),
];
const metres = (a, b) => {
  const rad = (v) => (v * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const edges = [];
const used = new Set();
for (const el of wayJson.elements || []) {
  if (el.type !== 'way' || !Array.isArray(el.nodes)) continue;
  const tags = el.tags || {};
  const kind = tags.highway || 'footway';
  let prev = null;
  for (const nodeId of el.nodes) {
    const node = osmNodes.get(nodeId);
    if (!node) {
      prev = null;
      continue;
    }
    if (prev) {
      const length = metres(prev, node);
      if (length > 0.5 && length < 400) {
        const key = `${prev.id}-${node.id}`;
        const rkey = `${node.id}-${prev.id}`;
        if (!used.has(key) && !used.has(rkey)) {
          used.add(key);
          edges.push({
            a: String(prev.id),
            b: String(node.id),
            m: Math.round(length * 10) / 10,
            kind,
            steps: tags.highway === 'steps',
            name: tags.name || '',
          });
          used.add(key);
        }
      }
    }
    used.add(String(nodeId));
    prev = node;
  }
}

const referenced = new Set();
for (const e of edges) {
  referenced.add(e.a);
  referenced.add(e.b);
}
const nodes = {};
for (const id of referenced) {
  const node = osmNodes.get(Number(id));
  if (!node) continue;
  nodes[id] = { lat: node.lat, lon: node.lon, pos: posOf(node) };
}

const paths = {
  generatedAt: new Date().toISOString(),
  source: 'OpenStreetMap / Overpass API',
  license: 'ODbL 1.0',
  bounds: campus.bounds,
  count: edges.length,
  nodes,
  edges,
};
await writeFile(path.join(dataDir, 'campus-paths.json'), JSON.stringify(paths));
console.log(`walk graph: ${Object.keys(nodes).length} nodes, ${edges.length} edges`);

// ---- 3. Satellite basemap --------------------------------------------------
await mkdir(imgDir, { recursive: true });
const satPath = path.join(imgDir, 'campus-satellite.jpg');
if (process.argv.includes('--force-satellite') || !existsSync(satPath)) {
  const url =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export' +
    `?bbox=${minLon},${minLat},${maxLon},${maxLat}&bboxSR=4326&imageSR=4326&size=4096,4096&format=jpg&f=image`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Satellite ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(satPath, buffer);
  console.log(`satellite: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
} else {
  console.log('satellite: already present');
}
console.log('done');
