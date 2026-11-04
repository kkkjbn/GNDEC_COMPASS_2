import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findRoute, distanceMeters } from '../src/lib/campus.js';
import { clampView, panView, pointsViewBox, viewTransform, zoomView } from '../src/lib/viewport.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', `${name}.json`), 'utf8'));
const campus = read('campus');
const paths = read('campus-paths');

const frame = { x: 0, y: 0, width: 1000, height: 800 };
const centre = { x: 500, y: 400 };
const toWorld = (screen, view) => ({
  x: centre.x + (screen.x - centre.x - view.x) / view.scale,
  y: centre.y + (screen.y - centre.y - view.y) / view.scale,
});

test('map zoom keeps the point under the cursor fixed', () => {
  const point = { x: 750, y: 210 };
  const view = { scale: 1, x: 0, y: 0 };
  const next = zoomView(view, 2.4, point, frame);
  assert.equal(next.scale, 2.4);
  const before = toWorld(point, view);
  const after = toWorld(point, next);
  assert.ok(Math.abs(before.x - after.x) < 0.001);
  assert.ok(Math.abs(before.y - after.y) < 0.001);
});

test('map pan and zoom are clamped to the frame', () => {
  const clamped = clampView({ scale: 2, x: 9999, y: -9999 }, frame);
  assert.deepEqual(clamped, { scale: 2, x: 500, y: -400 });
  const panned = panView({ scale: 2, x: 0, y: 0 }, 900, -900, frame);
  assert.equal(panned.x, 500);
  assert.equal(panned.y, -400);
  assert.equal(clampView({ scale: 9, x: 0, y: 0 }, frame).scale, 4);
  assert.equal(clampView({ scale: 0.2, x: 0, y: 0 }, frame).scale, 1);
});

test('map transform and route viewBox stay finite and padded', () => {
  assert.match(viewTransform({ scale: 2, x: 40, y: -20 }, frame), /translate\(540 380\) scale\(2\)/);
  const box = pointsViewBox([
    [0.2, 0.3],
    [0.4, 0.5],
    [0.4, 0.5],
    ['bad', 1],
  ], 1.5, 0.05);
  assert.ok(box.x < 0.2 && box.y < 0.3);
  assert.ok(box.x + box.width > 0.4 && box.y + box.height > 0.5);
  assert.ok(Math.abs(box.width / box.height - 1.5) < 1e-9);
  assert.equal(pointsViewBox([]), null);
});

test('every route step carries real map geometry along the OSM walk network', () => {
  const route = findRoute(campus, 'main-gate', 'g-block', paths);
  assert.ok(route, 'expected a route from Main Gate to G-Block');
  assert.ok(route.meters > 350 && route.meters < 900, `unexpected distance ${route.meters}`);
  assert.ok(route.minutes >= 5 && route.minutes <= 20);
  assert.ok(route.points.length > 10);
  assert.ok(route.steps.length >= 4);
  assert.equal(distanceMeters(route.source, route.target) > 0, true);
  for (const step of route.steps) {
    assert.ok(Array.isArray(step.points) && step.points.length > 0, `step missing points: ${step.instruction}`);
    assert.ok(step.points.every((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])));
  }
  const arrive = route.steps[route.steps.length - 1];
  assert.equal(arrive.turn, 'arrive');
  assert.equal(arrive.points.length, 1);
  assert.ok(route.connector.from >= 0 && route.connector.to >= 0);
});
