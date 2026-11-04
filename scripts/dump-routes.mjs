// Dump a few routes for visual checking. Not part of the build.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { findRoute } from '../src/lib/campus.js';

const root = path.resolve(import.meta.dirname, '..');
const campus = JSON.parse(await readFile(path.join(root, 'public/data/campus.json'), 'utf8'));
const paths = JSON.parse(await readFile(path.join(root, 'public/data/campus-paths.json'), 'utf8'));

const pairs = [
  ['main-gate', 'library'],
  ['main-gate', 'sports-complex'],
  ['north-gate', 'girls-hostel'],
];
const routes = pairs.map(([a, b]) => {
  const route = findRoute(campus, a, b, paths);
  return { a, b, points: route.points, meters: route.meters };
});

await writeFile(
  path.join(root, 'scripts', '.routes.json'),
  JSON.stringify({ routes, edges: paths.edges, nodes: paths.nodes }),
);
console.log('written');
