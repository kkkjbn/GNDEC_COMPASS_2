// Quick sanity check of the real walk network. Not part of the build.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { findRoute, distanceMeters } from '../src/lib/campus.js';

const root = path.resolve(import.meta.dirname, '..');
const campus = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
const paths = JSON.parse(await readFile(path.join(root, 'public/data/campus-paths.json'), 'utf8'));

const pairs = [
  ['main-gate', 'library'],
  ['main-gate', 'admin-block'],
  ['library', 'cse-dept'],
  ['north-gate', 'girls-hostel'],
  ['main-gate', 'gndp-diploma'],
  ['west-gate', 'director-bungalow'],
  ['sports-complex', 'hostel-5'],
  ['main-gate', 'sports-complex'],
];

for (const [a, b] of pairs) {
  const route = findRoute(campus, a, b, paths);
  if (!route) {
    console.log(a, '->', b, 'NO ROUTE');
    continue;
  }
  const straight = distanceMeters(route.source, route.target);
  console.log(
    `${a} -> ${b}: ${Math.round(route.meters)} m (${route.minutes} min), straight ${Math.round(straight)} m, points ${route.points.length}, connector ${route.connector.from}/${route.connector.to} m, alt ${route.alternative ? Math.round(route.alternative.meters) : '-'} m`,
  );
  console.log('   ' + route.steps.map((s) => s.instruction).join(' | '));
}

// Snap quality: a far snap means the place is nowhere near a mapped path.
const maxSnap = [];
for (const place of campus.places) {
  const route = findRoute(campus, place.id, 'library', paths);
  if (route?.connector) maxSnap.push([place.id, route.connector.from, route.connector.to]);
}
maxSnap.sort((a, b) => b[1] - a[1]);
console.log('worst start snaps:', maxSnap.slice(0, 8));
