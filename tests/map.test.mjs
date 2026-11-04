import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findRoute, distanceMeters } from '../src/lib/campus.js';
import { clampView, mapPointAtScreen, panView, pointsViewBox, viewTransform, zoomView, zoomViewAtScreen } from '../src/lib/viewport.js';
import { orbitProject, panTargetByScreen, screenToGround, zoomTargetAboutGround } from '../src/lib/camera3d.js';
import { triangulatePolygon } from '../src/lib/triangulate.js';

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

test('repeated cursor-anchored zooms stay over the same satellite feature', () => {
  const cursor = { x: 742, y: 218 };
  let view = { scale: 1.34, x: -31, y: 24 };
  for (const scale of [1.9, 2.55, 3.2]) {
    const groundBefore = mapPointAtScreen(view, cursor, frame);
    view = zoomViewAtScreen(view, scale, cursor, frame);
    const groundAfter = mapPointAtScreen(view, cursor, frame);
    assert.ok(Math.abs(groundBefore.x - groundAfter.x) < 0.001);
    assert.ok(Math.abs(groundBefore.y - groundAfter.y) < 0.001);
  }
});

test('3D wheel zoom keeps the ground point under the cursor fixed', () => {
  const cam = { mode: 'orbit', yaw: -0.62, pitch: 0.76, dist: 1460, fov: 38, tx: 0, tz: 0 };
  const width = 1000;
  const height = 700;
  const cursor = { x: 735, y: 455 };
  const ground = screenToGround(cam, width, height, cursor.x, cursor.y);
  assert.ok(ground, 'expected a ground point under the cursor');
  assert.ok(Math.abs(ground[0]) < 1400 && Math.abs(ground[1]) < 1400);

  const nextDist = 760;
  const [tx, tz] = zoomTargetAboutGround(cam, ground, nextDist);
  const projected = orbitProject(
    { ...cam, tx, tz, dist: nextDist },
    width,
    height,
    ground[0],
    0,
    ground[1],
  );
  assert.ok(projected, 'expected the ground point to stay in front of the camera');
  assert.ok(Math.abs(projected[0] - cursor.x) < 0.01, `x drifted by ${projected[0] - cursor.x}`);
  assert.ok(Math.abs(projected[1] - cursor.y) < 0.01, `y drifted by ${projected[1] - cursor.y}`);

  // Zooming centre-screen does not move the target.
  const centreGround = screenToGround(cam, width, height, width / 2, height / 2);
  assert.ok(centreGround);
  const centred = zoomTargetAboutGround(cam, centreGround, nextDist);
  assert.ok(Math.abs(centred[0] - cam.tx) < 0.01);
  assert.ok(Math.abs(centred[1] - cam.tz) < 0.01);
});

test('3D pan buttons move the camera opposite the requested screen direction', () => {
  const cam = { mode: 'orbit', yaw: 0, pitch: 0.7, dist: 1200, fov: 38, tx: 10, tz: 20 };
  const right = panTargetByScreen(cam, 900, 600, 72, 0);
  const left = panTargetByScreen(cam, 900, 600, -72, 0);
  const up = panTargetByScreen(cam, 900, 600, 0, -72);
  const down = panTargetByScreen(cam, 900, 600, 0, 72);
  assert.ok(right[0] < cam.tx);
  assert.ok(left[0] > cam.tx);
  assert.ok(up[1] > cam.tz);
  assert.ok(down[1] < cam.tz);
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

test('roof triangulation preserves convex and concave OSM footprint area', () => {
  const signedArea = (points) => points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
  const triangleArea = (a, b, c) => Math.abs(
    ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2,
  );
  const footprints = [
    [[0, 0], [4, 0], [4, 3], [0, 3]],
    [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]],
    [[0, 4], [1, 4], [1, 1], [4, 1], [4, 0], [0, 0]],
    [[0, 0], [4, 0], [4, 3], [0, 3], [0, 0]],
  ];
  for (const footprint of footprints) {
    const triangles = triangulatePolygon(footprint);
    const vertexCount = footprint.length - (footprint[0][0] === footprint.at(-1)[0] && footprint[0][1] === footprint.at(-1)[1] ? 1 : 0);
    assert.equal(triangles.length, vertexCount - 2);
    const area = triangles.reduce((sum, [a, b, c]) => sum + triangleArea(footprint[a], footprint[b], footprint[c]), 0);
    assert.ok(Math.abs(area - Math.abs(signedArea(footprint))) < 1e-8);
  }
});

test('all published campus building footprints can be textured without gaps', () => {
  const buildings = campus.geometry.filter((shape) => shape.type === 'building');
  assert.equal(buildings.length, 203);
  for (const building of buildings) {
    const ring = building.pts;
    const uniqueCount = ring.length - (ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? 1 : 0);
    assert.equal(
      triangulatePolygon(ring).length,
      uniqueCount - 2,
      `footprint ${building.id} should triangulate completely`,
    );
  }
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

test('direction thumbnails use the stored real satellite photograph, not the 3D canvas', () => {
  const satellite = fs.readFileSync(path.join(root, 'public', 'img', 'map', 'campus-satellite.jpg'));
  assert.equal(satellite[0], 0xff);
  assert.equal(satellite[1], 0xd8);
  const routeVisuals = fs.readFileSync(path.join(root, 'src', 'components', 'RouteVisuals.jsx'), 'utf8');
  assert.match(routeVisuals, /SATELLITE_DETAIL\.src/);
  assert.match(routeVisuals, /<image/);
  assert.doesNotMatch(routeVisuals, /Campus3D/);
});
