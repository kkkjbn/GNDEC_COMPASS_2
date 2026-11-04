import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Eye,
  EyeOff,
  Footprints,
  Layers3,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { norm } from '../lib/utils.js';
import { triangulatePolygon } from '../lib/triangulate.js';
import { SATELLITE_CONTEXT, SATELLITE_DETAIL } from '../lib/map-bounds.js';
import { MAX_DIST, MIN_DIST, panTargetByScreen, screenToGround as orbitGround, zoomLabelFor, zoomTargetAboutGround } from '../lib/camera3d.js';

/**
 * Perspective 3D model of the real GNDEC campus.
 *
 * - Footprints: OpenStreetMap building polygons already used by Compass.
 * - Heights: OSM `building:levels` / `height` where the tags exist; otherwise
 *   a documented estimate (the UI marks which is which).
 * - Ground: the licensed Esri World Imagery export for the same bounds, mapped
 *   corner-to-corner so the model is georeferenced, not decorative.
 * - Paths: the OSM walkable network, drawn with real widths per highway type.
 *
 * Everything is rendered on one canvas with a painter's algorithm, so it works
 * offline and without WebGL.
 */

const METRES_X = 823; // 0.0086° of longitude at 30.86° N
const METRES_Z = 1039; // 0.0094° of latitude
const D2R = Math.PI / 180;
const FLOOR_HEIGHT = 3.3;

const world = ([x, z]) => [(x - 0.5) * METRES_X, (z - 0.5) * METRES_Z];

const PALETTES = {
  light: {
    skyTop: '#e7eee3',
    skyBottom: '#cdd9c8',
    outside: '#5d6350',
    outsideEdge: '#7a8068',
    wall: '#d5c7ae',
    wallShade: 0.72,
    band: '#9d3f2c',
    roof: '#9b9587',
    parapet: '#6f6a5e',
    window: '#26343a',
    windowLight: 'rgba(255, 255, 255, 0.22)',
    glass: 'rgba(130, 165, 170, 0.55)',
    label: '#182a20',
    labelBg: 'rgba(251, 248, 238, 0.94)',
    labelBorder: 'rgba(58, 74, 60, 0.18)',
    route: '#0d6b4d',
    routeGlow: 'rgba(13, 107, 77, 0.28)',
    routeHalo: 'rgba(255, 255, 255, 0.92)',
    pin: '#4766c7',
    start: '#c97a45',
    end: '#0f6b4f',
    path: 'rgba(247, 241, 222, 0.55)',
    service: 'rgba(255, 255, 255, 0.16)',
    tree: '#2f6b3c',
    treeTop: '#5f9a58',
    shadow: 'rgba(20, 32, 24, 0.22)',
    flat: {
      pitch: 'rgba(116, 158, 92, 0.28)',
      track: 'rgba(150, 106, 76, 0.26)',
      stadium: 'rgba(110, 152, 88, 0.24)',
      park: 'rgba(118, 158, 96, 0.2)',
      swimming_pool: 'rgba(80, 156, 176, 0.78)',
      parking: 'rgba(90, 92, 86, 0.24)',
      fountain: 'rgba(96, 168, 186, 0.85)',
      toilets: 'rgba(130, 126, 114, 0.28)',
      clinic: 'rgba(150, 146, 132, 0.26)',
      school: 'rgba(130, 150, 110, 0.2)',
      campus: 'rgba(120, 150, 100, 0.08)',
      default: 'rgba(140, 140, 128, 0.2)',
    },
  },
  dark: {
    skyTop: '#0b1410',
    skyBottom: '#16241d',
    outside: '#20261f',
    outsideEdge: '#2b332a',
    wall: '#8f8474',
    wallShade: 0.6,
    band: '#7a3427',
    roof: '#5f5c53',
    parapet: '#3f3d36',
    window: '#0d1417',
    windowLight: 'rgba(220, 235, 220, 0.14)',
    glass: 'rgba(90, 120, 130, 0.55)',
    label: '#e9efe4',
    labelBg: 'rgba(14, 24, 19, 0.9)',
    labelBorder: 'rgba(255, 255, 255, 0.1)',
    route: '#6fd3a4',
    routeGlow: 'rgba(111, 211, 164, 0.3)',
    routeHalo: 'rgba(6, 16, 10, 0.9)',
    pin: '#7f9be8',
    start: '#e09a63',
    end: '#6fd3a4',
    path: 'rgba(200, 190, 160, 0.4)',
    service: 'rgba(255, 255, 255, 0.1)',
    tree: '#1f4a2b',
    treeTop: '#3c6b3c',
    shadow: 'rgba(0, 0, 0, 0.34)',
    flat: {
      pitch: 'rgba(60, 94, 54, 0.2)',
      track: 'rgba(104, 72, 52, 0.2)',
      stadium: 'rgba(56, 88, 50, 0.18)',
      park: 'rgba(54, 86, 52, 0.16)',
      swimming_pool: 'rgba(42, 100, 118, 0.8)',
      parking: 'rgba(58, 60, 56, 0.2)',
      fountain: 'rgba(46, 108, 124, 0.85)',
      toilets: 'rgba(80, 78, 70, 0.22)',
      clinic: 'rgba(84, 82, 72, 0.22)',
      school: 'rgba(66, 84, 56, 0.18)',
      campus: 'rgba(70, 96, 60, 0.08)',
      default: 'rgba(78, 80, 70, 0.2)',
    },
  },
};

const polygonArea = (pts) => {
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
};

const centroidOf = (pts) => {
  let x = 0;
  let y = 0;
  for (const point of pts) {
    x += point[0];
    y += point[1];
  }
  return [x / pts.length, y / pts.length];
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const insideFrame = ([x, z], margin = 0) =>
  x >= -margin && x <= 1 + margin && z >= -margin && z <= 1 + margin;

const OFF_CAMPUS = /nankana|sub tehsil|anand enterprises|csiom|abhay'?s pg/i;

const LEVEL_HINTS = [
  [/library/i, 2],
  [/open air theatre|workshop|automobile|cdrt|maintenance|bank|common room|dispensary|temple|office/i, 1],
  [/mess/i, 2],
  [/hostel/i, 3],
  [/sports|stadium|gym/i, 2],
  [/admin|academic|dept|department|block|lecture|class|production/i, 3],
];

function estimateLevels(shape) {
  const name = shape.name || '';
  for (const [pattern, levels] of LEVEL_HINTS) {
    if (pattern.test(name)) return levels;
  }
  const squareMetres = shape.area * METRES_X * METRES_Z;
  if (squareMetres > 1400) return 3;
  if (squareMetres > 450) return 2;
  return 1;
}

function hash(value) {
  let h = 0;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) % 997;
  return h;
}

/**
 * Downsample a loaded satellite image once so the first-person ground can be
 * sampled per screen pixel without reading the full-resolution export.
 */
function makeSample(image, targetWidth = 360) {
  try {
    const naturalWidth = image.naturalWidth || image.width || 0;
    const naturalHeight = image.naturalHeight || image.height || 0;
    if (!naturalWidth || !naturalHeight) return null;
    const width = Math.min(targetWidth, naturalWidth);
    const height = Math.max(1, Math.round((naturalHeight / naturalWidth) * width));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, width, height);
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
  } catch {
    return null;
  }
}

const wallStyle = (shape) => {
  const name = shape.name || '';
  // Facade colours taken from the real campus photographs in public/img:
  // red-brick teaching blocks with cream floor bands, cream hostels and
  // bungalows, grey workshops/sports halls, and a cream-and-brick main gate.
  if (/main gate|north gate|west gate|south gate|\bgate\b/i.test(name)) {
    return { wall: '#efe3c8', roof: '#5d625d', band: '#a64d3c' };
  }
  if (/library/i.test(name)) return { wall: '#c06a55', roof: '#77736a', band: '#f0e4cb' };
  if (/acedemic|academic|admin|dept|department|block|lecture|class|production|engineering|polytechnic|college|institute|school/i.test(name)) {
    return { wall: '#b25b49', roof: '#6f6c64', band: '#efe3c8' };
  }
  if (/hostel|mess/i.test(name)) return { wall: '#e2cfa8', roof: '#918a7b', band: '#b45d47' };
  if (/sports|gym|stadium|court|ground|pool/i.test(name)) return { wall: '#d6d1c4', roof: '#83867e', band: '#a9a294' };
  if (/workshop|industrial|automobile|cdrt|maintenance|testing|consultancy/i.test(name) || shape.kind === 'industrial') {
    return { wall: '#bdb8a8', roof: '#777970', band: '#8b887a' };
  }
  if (/auditorium|theatre/i.test(name)) return { wall: '#cbbfa6', roof: '#777268', band: '#9f4d3d' };
  if (/bungalow|principal|director/i.test(name)) return { wall: '#e8dcc2', roof: '#8b877b', band: '#a86a4f' };
  return { wall: '#d3c5ac', roof: '#948e80', band: '#a9633f' };
};

const niceScale = (metres) => {
  const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const step of steps) if (metres <= step) return step;
  return 1000;
};

export default function Campus3D({
  campus,
  detail,
  paths,
  trees,
  places = [],
  route = null,
  from,
  to,
  onSelect,
  theme = 'light',
  street = false,
  command = null,
  onPreset,
}) {
  const palette = PALETTES[theme] || PALETTES.light;
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const contextRef = useRef(null);
  const sampleRef = useRef(null);
  const contextSampleRef = useRef(null);
  const walkGroundRef = useRef(null);
  const cameraRef = useRef({ mode: 'orbit', yaw: -0.62, pitch: 0.76, dist: 1460, fov: 38, tx: 0, tz: 0 });
  const targetRef = useRef({ mode: 'orbit', yaw: -0.62, pitch: 0.76, dist: 1460, fov: 38, tx: 0, tz: 0, eye: null });
  const motionRef = useRef(0);
  const lastMotionRef = useRef(0);
  const drawRef = useRef(null);
  const dragRef = useRef(null);
  const hitRef = useRef({ markers: [], tops: [] });
  const frameRef = useRef(0);
  const [labels, setLabels] = useState(true);
  const [imageReady, setImageReady] = useState(false);
  const [contextReady, setContextReady] = useState(false);
  const [preset, setPreset] = useState('iso');
  const [zoomLabel, setZoomLabel] = useState(100);

  const shapes = useMemo(() => {
    const all = (campus?.geometry || [])
      .filter((shape) => Array.isArray(shape.pts) && shape.pts.length >= 3)
      .map((shape) => {
        const pts = shape.pts.map((point) => [Number(point[0]), Number(point[1])]);
        return {
          ...shape,
          pts,
          area: Math.abs(polygonArea(pts)),
          centroid: centroidOf(pts),
          roofTriangles: triangulatePolygon(pts),
        };
      })
      .filter((shape) => shape.pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) && shape.area > 1e-7);

    const boundary = all
      .filter((shape) => shape.type === 'amenity' && shape.kind === 'college' && shape.area > 0.2)
      .sort((a, b) => b.area - a.area)[0];

    const detailBuildings = detail?.buildings || {};
    const buildings = [];
    const flats = [];

    // Many real OSM footprints are unnamed. Match each one to the nearest
    // curated campus place so the facade palette follows what the building is
    // (red-brick teaching block, cream hostel, grey workshop) instead of
    // falling back to one generic colour.
    const curatedPlaces = (places || [])
      .filter((place) => Array.isArray(place.pos))
      .map((place) => ({ name: place.name || '', pos: place.pos }));
    const nameFor = (shape) => {
      if ((shape.name || '').trim().length > 2) return shape.name;
      let best = null;
      for (const place of curatedPlaces) {
        const metres = Math.hypot(
          (shape.centroid[0] - place.pos[0]) * METRES_X,
          (shape.centroid[1] - place.pos[1]) * METRES_Z,
        );
        if (metres < 42 && (!best || metres < best.metres)) best = { name: place.name, metres };
      }
      return best?.name || shape.name;
    };

    for (const shape of all) {
      if (OFF_CAMPUS.test(shape.name || '')) continue;
      // Only model geometry that the satellite export actually covers. OSM
      // returns complete ways that intersect the bbox, so a few footprints sit
      // outside it; extruding those would leave buildings floating on nothing.
      if (!insideFrame(shape.centroid, 0.002)) continue;
      if (shape === boundary) continue;
      const meta = detailBuildings[String(shape.id)] || null;
      const isBuilding =
        shape.type === 'building' ||
        (shape.type === 'amenity' && ['college', 'clinic', 'school'].includes(shape.kind) && shape.area < 0.002);
      if (!isBuilding) {
        flats.push({ ...shape, flat: shape.kind || shape.type });
        continue;
      }
      const levels = meta?.levels && meta.levels > 0 ? meta.levels : estimateLevels(shape);
      const taggedHeight = meta?.height && meta.height > 2 ? meta.height : null;
      // Some OSM buildings carry `height` in feet, or a storey count that
      // contradicts the level tag. Only trust a height that can plausibly
      // contain the tagged floors; otherwise derive it and label the source.
      const plausibleHeight =
        taggedHeight &&
        (!meta?.levels || (taggedHeight >= meta.levels * 2.3 && taggedHeight <= meta.levels * 8 + 2));
      const height = plausibleHeight
        ? taggedHeight
        : Math.round((levels * FLOOR_HEIGHT + 0.7) * 10) / 10;
      const style = wallStyle({ ...shape, name: nameFor(shape) });
      buildings.push({
        ...shape,
        height,
        levels: Math.round(levels),
        levelsSource: meta?.levels ? 'osm' : 'estimate',
        heightSource: plausibleHeight ? 'osm' : meta?.levels ? 'levels' : 'estimate',
        wall: style.wall,
        roof: style.roof,
        band: style.band,
        roofShape: meta?.roofShape || '',
        meta,
      });
    }

    // Drop amenity duplicates that sit on top of an extruded building.
    const positioned = buildings.filter((shape) => shape.type === 'building');
    const dedupedFlats = flats.filter((flat) => {
      if (flat.type !== 'amenity') return true;
      return !positioned.some(
        (building) =>
          Math.abs(building.centroid[0] - flat.centroid[0]) < 0.0025 &&
          Math.abs(building.centroid[1] - flat.centroid[1]) < 0.0025 &&
          building.area > flat.area * 1.1,
      );
    });

    return {
      buildings: buildings.sort((a, b) => a.area - b.area),
      flats: dedupedFlats,
      boundary: boundary?.pts || null,
    };
  }, [campus, detail, places]);

  const placeIndex = useMemo(
    () =>
      places
        .filter((place) => Array.isArray(place.pos))
        .map((place) => ({ ...place, key: norm(place.name) })),
    [places],
  );

  const matchPlace = useCallback(
    (shape) => {
      const name = norm(shape.name);
      if (!name) return null;
      const direct = placeIndex.find(
        (place) => place.key === name || place.key.includes(name) || name.includes(place.key),
      );
      if (direct) return direct;
      return (
        placeIndex.find((place) =>
          (place.aliases || []).some((entry) => {
            const alias = norm(entry);
            return alias && (alias === name || name.includes(alias) || alias.includes(name));
          }),
        ) || null
      );
    },
    [placeIndex],
  );

  const treeList = useMemo(
    () => (trees?.trees || []).filter((tree) => Array.isArray(tree.pos)).slice(0, 60),
    [trees],
  );

  const pathList = useMemo(() => {
    if (!paths?.nodes || !paths?.edges) return [];
    const nodes = paths.nodes;
    return paths.edges
      .map((edge) => {
        const a = nodes[edge.a];
        const b = nodes[edge.b];
        if (!a?.pos || !b?.pos) return null;
        if (!insideFrame(a.pos) || !insideFrame(b.pos)) return null;
        return { kind: edge.kind, a: a.pos, b: b.pos };
      })
      .filter(Boolean);
  }, [paths]);

  const routePoints = useMemo(
    () => (Array.isArray(route?.points) ? route.points.filter((point) => Array.isArray(point)) : []),
    [route],
  );

  useEffect(() => {
    let cancelled = false;
    const load = (src, target, ready, sampleTarget) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (cancelled) return;
        target.current = image;
        if (sampleTarget) sampleTarget.current = makeSample(image);
        ready(true);
      };
      image.src = src;
      return image;
    };
    const context = load(SATELLITE_CONTEXT.src, contextRef, setContextReady, contextSampleRef);
    const detail = load(SATELLITE_DETAIL.src, imageRef, setImageReady, sampleRef);
    return () => {
      cancelled = true;
      context.onload = null;
      detail.onload = null;
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    if (!width || !height) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const cam = cameraRef.current;
    const focal = (0.5 * height) / Math.tan((cam.fov * D2R) / 2);

    let eye;
    let forward;
    if (cam.mode === 'walk') {
      eye = cam.eye;
      const cp = Math.cos(cam.pitch);
      forward = [Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp];
    } else {
      const cp = Math.cos(cam.pitch);
      const sp = Math.sin(cam.pitch);
      eye = [cam.tx + cam.dist * cp * Math.sin(cam.yaw), cam.dist * sp, cam.tz - cam.dist * cp * Math.cos(cam.yaw)];
      const length = Math.hypot(cam.tx - eye[0], eye[1], cam.tz - eye[2]) || 1;
      forward = [(cam.tx - eye[0]) / length, -eye[1] / length, (cam.tz - eye[2]) / length];
    }

    const right = (() => {
      const cross = [-forward[2], 0, forward[0]];
      const length = Math.hypot(cross[0], cross[2]) || 1;
      return [cross[0] / length, 0, cross[2] / length];
    })();
    const up = [
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ];

    const project = (x, y, z) => {
      const rx = x - eye[0];
      const ry = y - eye[1];
      const rz = z - eye[2];
      const zc = rx * forward[0] + ry * forward[1] + rz * forward[2];
      if (zc < 0.8) return null;
      const xc = rx * right[0] + ry * right[1] + rz * right[2];
      const yc = rx * up[0] + ry * up[1] + rz * up[2];
      return [width / 2 + (focal * xc) / zc, height / 2 - (focal * yc) / zc, zc];
    };

    // Sky above the horizon, city tone below it.
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const horizon =
      cam.mode === 'walk'
        ? height / 2 + focal * Math.tan(cam.pitch)
        : height / 2 - focal * Math.tan(cam.pitch);
    if (horizon < height) {
      const groundFill = ctx.createLinearGradient(0, Math.max(0, horizon), 0, height);
      groundFill.addColorStop(0, palette.outside);
      groundFill.addColorStop(1, palette.outsideEdge);
      ctx.fillStyle = groundFill;
      ctx.fillRect(0, Math.max(0, horizon), width, height - Math.max(0, horizon));
    }

    // Satellite ground: split in triangles so the perspective texture mapping
    // stays exact instead of relying on a single affine transform.
    const drawTriangle = (s, d, source) => {
      const [[sx0, sy0], [sx1, sy1], [sx2, sy2]] = s;
      const [[dx0, dy0], [dx1, dy1], [dx2, dy2]] = d;
      const det = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
      if (!det) return;
      const a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / det;
      const b = ((dx2 - dx0) * (sx1 - sx0) - (dx1 - dx0) * (sx2 - sx0)) / det;
      const c = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / det;
      const e = ((dy2 - dy0) * (sx1 - sx0) - (dy1 - dy0) * (sx2 - sx0)) / det;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(dx0, dy0);
      ctx.lineTo(dx1, dy1);
      ctx.lineTo(dx2, dy2);
      ctx.closePath();
      ctx.clip();
      ctx.transform(a, c, b, e, dx0 - a * sx0 - b * sy0, dy0 - c * sx0 - e * sy0);
      ctx.drawImage(source, 0, 0);
      ctx.restore();
    };

    const drawRoof = (shape, points, fallback) => {
      const source = imageRef.current;
      const roofArea = Math.abs(polygonArea(points));
      const sw = source?.naturalWidth || source?.width || 0;
      const sh = source?.naturalHeight || source?.height || 0;
      const triangles = shape.roofTriangles || [];
      if (!source || !sw || !sh || roofArea < 100 || !triangles.length) {
        drawPolygon(points, fallback, palette.parapet, 0.8);
        return;
      }

      // The roof footprint shares coordinates with the real satellite export.
      // Warp that photograph onto the raised OSM polygon, triangle by triangle,
      // so roof color and rooftop detail stay tied to the actual building.
      for (const indices of triangles) {
        const sourcePoints = indices.map((index) => [shape.pts[index][0] * sw, shape.pts[index][1] * sh]);
        const screenPoints = indices.map((index) => [points[index][0], points[index][1]]);
        drawTriangle(sourcePoints, screenPoints, source);
      }
      ctx.save();
      ctx.globalAlpha = theme === 'dark' ? 0.1 : 0.045;
      drawPolygon(points, theme === 'dark' ? '#101820' : '#fffaf0', null);
      ctx.restore();
      drawPolygon(points, null, palette.parapet, 0.8);
    };

    const drawGround = (source, box, grid) => {
      if (!source) return;
      const sw = source.naturalWidth || source.width;
      const sh = source.naturalHeight || source.height;
      if (!sw || !sh) return;
      for (let row = 0; row < grid; row += 1) {
        for (let col = 0; col < grid; col += 1) {
          const u0 = box.x + (col / grid) * box.width;
          const u1 = box.x + ((col + 1) / grid) * box.width;
          const v0 = box.y + (row / grid) * box.height;
          const v1 = box.y + ((row + 1) / grid) * box.height;
          const p00 = project((u0 - 0.5) * METRES_X, 0, (v0 - 0.5) * METRES_Z);
          const p10 = project((u1 - 0.5) * METRES_X, 0, (v0 - 0.5) * METRES_Z);
          const p11 = project((u1 - 0.5) * METRES_X, 0, (v1 - 0.5) * METRES_Z);
          const p01 = project((u0 - 0.5) * METRES_X, 0, (v1 - 0.5) * METRES_Z);
          if (!p00 || !p10 || !p11 || !p01) continue;
          const sx = (value) => ((value - box.x) / box.width) * sw;
          const sy = (value) => ((value - box.y) / box.height) * sh;
          const s00 = [sx(u0), sy(v0)];
          const s10 = [sx(u1), sy(v0)];
          const s11 = [sx(u1), sy(v1)];
          const s01 = [sx(u0), sy(v1)];
          drawTriangle([s00, s10, s11], [p00, p10, p11], source);
          drawTriangle([s00, s11, s01], [p00, p11, p01], source);
        }
      }
    };

    /**
     * First-person ground. The triangle grid used for the orbit camera skips
     * any cell that crosses the near plane, which leaves a black wedge under
     * the camera in Street mode. Walk mode therefore projects each screen row
     * back onto the ground plane and samples the same georeferenced satellite
     * export, so the pavement reaches all the way to the bottom of the frame.
     */
    const drawWalkGround = () => {
      const detailSample = sampleRef.current;
      const contextSample = contextSampleRef.current;
      if (!detailSample && !contextSample) return;
      if (!(cam.eye[1] > 0.2)) return;
      const cell = 3;
      const lw = Math.max(1, Math.ceil(width / cell));
      const lh = Math.max(1, Math.ceil(height / cell));
      let store = walkGroundRef.current;
      if (!store || store.canvas.width !== lw || store.canvas.height !== lh) {
        const canvas = document.createElement('canvas');
        canvas.width = lw;
        canvas.height = lh;
        const context2d = canvas.getContext('2d');
        if (!context2d) return;
        store = { canvas, context2d, image: context2d.createImageData(lw, lh) };
        walkGroundRef.current = store;
      }
      const { data } = store.image;
      data.fill(0);

      const cp = Math.cos(cam.pitch);
      const sp = Math.sin(cam.pitch);
      const [eyeX, eyeY, eyeZ] = cam.eye;
      const fwdX = Math.sin(cam.yaw);
      const fwdZ = -Math.cos(cam.yaw);
      const rightX = Math.cos(cam.yaw);
      const rightZ = Math.sin(cam.yaw);
      const horizonY = height / 2 + focal * Math.tan(cam.pitch);
      const fog = theme === 'dark' ? [40, 47, 40] : [150, 158, 142];

      const rgb = [0, 0, 0];
      const readSample = (sample, box, u, v) => {
        if (!sample) return false;
        const fu = (u - box.x) / box.width;
        const fv = (v - box.y) / box.height;
        if (fu < 0 || fu > 1 || fv < 0 || fv > 1) return false;
        const ix = Math.min(sample.width - 1, Math.max(0, Math.round(fu * (sample.width - 1))));
        const iy = Math.min(sample.height - 1, Math.max(0, Math.round(fv * (sample.height - 1))));
        const index = (iy * sample.width + ix) * 4;
        rgb[0] = sample.data[index];
        rgb[1] = sample.data[index + 1];
        rgb[2] = sample.data[index + 2];
        return true;
      };

      for (let ly = 0; ly < lh; ly += 1) {
        const py = (ly + 0.5) * cell;
        if (py <= horizonY + 2) continue;
        const hh = py - height / 2;
        const denom = hh * cp - focal * sp;
        if (Math.abs(denom) < 1e-6) continue;
        const distance = (eyeY * (hh * sp + focal * cp)) / denom;
        if (!(distance > 0.08)) continue;
        const zc = distance * cp - eyeY * sp;
        if (!(zc > 0.25)) continue;
        const baseX = eyeX + distance * fwdX;
        const baseZ = eyeZ + distance * fwdZ;
        const lateralScale = zc / focal;
        const haze = Math.min(0.68, 1 - Math.exp(-distance / 320));
        const rowOffset = ly * lw * 4;
        for (let lx = 0; lx < lw; lx += 1) {
          const lateral = ((lx + 0.5) * cell - width / 2) * lateralScale;
          const u = (baseX + lateral * rightX) / METRES_X + 0.5;
          const v = (baseZ + lateral * rightZ) / METRES_Z + 0.5;
          if (!readSample(detailSample, SATELLITE_DETAIL, u, v) && !readSample(contextSample, SATELLITE_CONTEXT, u, v)) {
            rgb[0] = 96;
            rgb[1] = 108;
            rgb[2] = 82;
          }
          const index = rowOffset + lx * 4;
          data[index] = rgb[0] + (fog[0] - rgb[0]) * haze;
          data[index + 1] = rgb[1] + (fog[1] - rgb[1]) * haze;
          data[index + 2] = rgb[2] + (fog[2] - rgb[2]) * haze;
          data[index + 3] = 255;
        }
      }

      store.context2d.putImageData(store.image, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(store.canvas, 0, 0, width, height);
      ctx.restore();
    };

    if (cam.mode === 'walk') {
      drawWalkGround();
    } else {
      // Low-resolution context first, then the sharp campus export on top.
      if (contextReady) drawGround(contextRef.current, SATELLITE_CONTEXT, 5);
      if (imageReady) {
        drawGround(imageRef.current, SATELLITE_DETAIL, 8);
        // Soft edge so the photo does not end in a hard rectangle.
        const edge = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.34, width / 2, height / 2, Math.max(width, height) * 0.78);
        edge.addColorStop(0, 'rgba(0,0,0,0)');
        edge.addColorStop(1, theme === 'dark' ? 'rgba(8,14,10,0.34)' : 'rgba(60,70,52,0.2)');
        ctx.fillStyle = edge;
        ctx.fillRect(0, 0, width, height);
      }
    }

    const drawPolygon = (points, fill, stroke, lineWidth = 1) => {
      if (points.length < 3) return;
      ctx.beginPath();
      points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    };

    // Themed ground overlays (sports grounds, parking, lawns...).
    for (const flat of shapes.flats) {
      const key = flat.kind === 'swimming_pool' ? 'swimming_pool' : flat.flat || flat.kind || 'default';
      const fill = palette.flat[key] || palette.flat.default;
      const points = flat.pts.map(([x, z]) => {
        const [wx, wz] = world([x, z]);
        return project(wx, 0.06, wz);
      });
      if (points.some((point) => !point)) continue;
      drawPolygon(points, fill, null);
    }

    // Walkable network, thinner than the roads it follows.
    for (const path of pathList) {
      const [ax, az] = world(path.a);
      const [bx, bz] = world(path.b);
      const a = project(ax, 0.12, az);
      const b = project(bx, 0.12, bz);
      if (!a || !b) continue;
      const soft = path.kind === 'service' || path.kind === 'residential' || path.kind === 'unclassified';
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = soft ? palette.service : palette.path;
      ctx.lineWidth = soft ? 1 : 1.8;
      ctx.stroke();
    }

    const faces = [];
    const tops = [];

    // Buildings -----------------------------------------------------------------
    for (const shape of shapes.buildings) {
      const { pts, height: h, levels } = shape;
      const base = pts.map(([x, z]) => {
        const [wx, wz] = world([x, z]);
        return project(wx, 0, wz);
      });
      const top = pts.map(([x, z]) => {
        const [wx, wz] = world([x, z]);
        return project(wx, h, wz);
      });
      if (base.some((point) => !point) || top.some((point) => !point)) continue;

      const topDepth = top.reduce((sum, point) => sum + point[2], 0) / top.length;

      // Ground shadow, offset in the sun direction.
      const shadowOffset = [h * 0.32, h * 0.22];
      const shadowPoints = pts.map(([x, z]) => {
        const [wx, wz] = world([x, z]);
        return project(wx + shadowOffset[0], 0.04, wz + shadowOffset[1]);
      });
      if (shadowPoints.every(Boolean)) {
        faces.push({ kind: 'shadow', points: shadowPoints, depth: topDepth + 0.5, fill: palette.shadow });
      }

      // Roof.
      const roofColor = theme === 'dark' ? shape.roof : shape.roof;
      faces.push({ kind: 'top', points: top, depth: topDepth, shape, fill: roofColor, levels });
      tops.push({ shape, points: top, depth: topDepth });

      const orientation = polygonArea(pts) >= 0 ? 1 : -1;
      for (let i = 0; i < pts.length; i += 1) {
        const [x1, z1] = pts[i];
        const [x2, z2] = pts[(i + 1) % pts.length];
        const dx = x2 - x1;
        const dz = z2 - z1;
        const length = Math.hypot(dx * METRES_X, dz * METRES_Z);
        if (length < 0.8) continue;
        const nx = (orientation * dz * METRES_X) / (length || 1);
        const nz = (orientation * -dx * METRES_Z) / (length || 1);
        const toEye = [eye[0] - world([x1, z1])[0], eye[2] - world([x1, z1])[1]];
        if (nx * toEye[0] + nz * toEye[1] <= 0.5) continue;

        const b0 = base[i];
        const b1 = base[(i + 1) % pts.length];
        const t0 = top[i];
        const t1 = top[(i + 1) % pts.length];
        const light = Math.max(0, nx * -0.62 + nz * -0.5);
        const shade = 0.68 + 0.32 * light;
        const wallColor = shadeColor(shape.wall, shade);
        const depth = (b0[2] + b1[2] + t0[2] + t1[2]) / 4;
        faces.push({
          kind: 'wall',
          points: [b0, b1, t1, t0],
          depth,
          fill: wallColor,
          shape,
          corners: { b0, b1, t0, t1 },
          screenLength: Math.hypot(b1[0] - b0[0], b1[1] - b0[1]),
          metres: length,
        });
      }
    }

    // Route is depth-sorted with the buildings so it is hidden behind them.
    if (routePoints.length > 1) {
      for (let i = 1; i < routePoints.length; i += 1) {
        const [ax, az] = world(routePoints[i - 1]);
        const [bx, bz] = world(routePoints[i]);
        const a = project(ax, 1.1, az);
        const b = project(bx, 1.1, bz);
        if (!a || !b) continue;
        faces.push({ kind: 'route', a, b, depth: (a[2] + b[2]) / 2 });
      }
    }

    // Real trees from OSM.
    for (const tree of treeList) {
      const [wx, wz] = world(tree.pos);
      const center = project(wx, 4.6, wz);
      if (!center) continue;
      const radius = clamp((focal * 2.6) / center[2], 0.7, 9);
      faces.push({ kind: 'tree', x: center[0], y: center[1], r: radius, depth: center[2] });
    }

    faces.sort((a, b) => b.depth - a.depth);

    // Paint faces.
    for (const face of faces) {
      if (face.kind === 'route') {
        ctx.beginPath();
        ctx.moveTo(face.a[0], face.a[1]);
        ctx.lineTo(face.b[0], face.b[1]);
        ctx.strokeStyle = palette.routeGlow;
        ctx.lineWidth = 11;
        ctx.stroke();
        ctx.strokeStyle = palette.routeHalo;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = palette.route;
        ctx.lineWidth = 4;
        ctx.setLineDash([]);
        ctx.stroke();
        continue;
      }
      if (face.kind === 'tree') {
        const gradient = ctx.createRadialGradient(face.x - face.r * 0.3, face.y - face.r * 0.4, face.r * 0.2, face.x, face.y, face.r);
        gradient.addColorStop(0, palette.treeTop);
        gradient.addColorStop(1, palette.tree);
        ctx.beginPath();
        ctx.arc(face.x, face.y, face.r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        continue;
      }
      if (face.kind === 'shadow') {
        ctx.globalAlpha = 0.55;
        drawPolygon(face.points, face.fill, null);
        ctx.globalAlpha = 1;
        continue;
      }
      if (face.kind === 'top') {
        drawRoof(face.shape, face.points, face.fill);
        // Slightly inset roof deck line for depth.
        if (face.points.length > 3) {
          ctx.beginPath();
          const inset = face.points.map(([x, y]) => [x + (width / 2 - x) * 0.012, y + (height / 2 - y) * 0.012]);
          inset.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.closePath();
          ctx.strokeStyle = 'rgba(255,255,255,0.16)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
        continue;
      }
      if (face.kind === 'wall') {
        drawPolygon(face.points, face.fill, theme === 'dark' ? 'rgba(0,0,0,0.28)' : 'rgba(52,60,45,0.2)', 0.6);
        if (face.screenLength > 26 && face.points[0][1] - face.points[3][1] !== 0) {
          drawFacade(ctx, face, palette, zoomLabel);
        }
      }
    }

    // Place pins ---------------------------------------------------------------
    const markers = [];
    for (const place of placeIndex) {
      const [wx, wz] = world(place.pos);
      const point = project(wx, 2.5, wz);
      if (!point) continue;
      const active = place.id === to || place.id === from;
      const radius = active ? 5.6 : 3.6;
      ctx.beginPath();
      ctx.arc(point[0], point[1], radius + 2.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8, 18, 12, 0.28)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
      ctx.fillStyle = place.id === to ? palette.end : place.id === from ? palette.start : palette.pin;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      if (active) {
        ctx.beginPath();
        ctx.arc(point[0], point[1], radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = place.id === to ? palette.end : palette.start;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.55;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      markers.push({ x: point[0], y: point[1], r: Math.max(13, radius + 6), id: place.id });
    }

    // Compass and scale ---------------------------------------------------------
    const compassX = width - 34;
    const compassY = height - 104;
    ctx.save();
    ctx.beginPath();
    ctx.arc(compassX, compassY, 17, 0, Math.PI * 2);
    ctx.fillStyle = theme === 'dark' ? 'rgba(12,22,17,0.62)' : 'rgba(252,249,240,0.82)';
    ctx.fill();
    ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(30,50,38,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const north = [0, 0, -1];
    const nx = north[0] * right[0] + north[1] * right[1] + north[2] * right[2];
    const ny = north[0] * up[0] + north[1] * up[1] + north[2] * up[2];
    const length = Math.hypot(nx, ny) || 1;
    const ux = nx / length;
    const uy = -ny / length;
    ctx.beginPath();
    ctx.moveTo(compassX + ux * 11, compassY + uy * 11);
    ctx.lineTo(compassX - uy * 4, compassY + ux * 4);
    ctx.lineTo(compassX + uy * 4, compassY - ux * 4);
    ctx.closePath();
    ctx.fillStyle = palette.end;
    ctx.fill();
    ctx.font = '700 9px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = theme === 'dark' ? '#cfe0d5' : '#37483c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', compassX + ux * 22, compassY + uy * 22);
    ctx.restore();

    if (cam.mode !== 'walk') {
      const origin = project(cam.tx, 0, cam.tz);
      const east = project(cam.tx + 100, 0, cam.tz);
      if (origin && east) {
        const pixelsPer100 = Math.hypot(east[0] - origin[0], east[1] - origin[1]);
        const value = niceScale((100 * 140) / (pixelsPer100 || 1));
        const barPixels = (value / 100) * pixelsPer100;
        const bx = 16;
        const by = height - 58;
        ctx.save();
        ctx.strokeStyle = theme === 'dark' ? 'rgba(233,239,228,0.8)' : 'rgba(24,42,32,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + barPixels, by);
        ctx.moveTo(bx, by - 4);
        ctx.lineTo(bx, by + 4);
        ctx.moveTo(bx + barPixels, by - 4);
        ctx.lineTo(bx + barPixels, by + 4);
        ctx.stroke();
        ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = theme === 'dark' ? '#cfe0d5' : '#2c4034';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${value} m`, bx, by - 6);
        ctx.restore();
      }
    }

    // Labels -------------------------------------------------------------------
    const placeCandidates = placeIndex
      .map((place) => {
        const [wx, wz] = world(place.pos);
        const point = project(wx, 2.5, wz);
        if (!point) return null;
        return { place, x: point[0], y: point[1] - 13, depth: point[2] };
      })
      .filter(Boolean)
      .sort((a, b) => a.depth - b.depth);

    const activeCandidates = placeCandidates.filter((entry) => entry.place.id === to || entry.place.id === from);

    if (activeCandidates.length || labels) {
      const boxes = [];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '650 10px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';

      const overlaps = (box, list) =>
        list.some(
          (other) =>
            box.l < other.r + 2 &&
            box.r > other.l - 2 &&
            box.t < other.b + 1 &&
            box.b > other.t - 1,
        );

      const placePlacement = (entry, isActive) => {
        const text = entry.place.name.length > 30 ? `${entry.place.name.slice(0, 29)}…` : entry.place.name;
        const boxWidth = ctx.measureText(text).width + 12;
        const boxHeight = isActive ? 17 : 15;
        const x = clamp(entry.x, boxWidth / 2 + 4, width - boxWidth / 2 - 4);
        const y = clamp(entry.y, boxHeight / 2 + 4, height - boxHeight / 2 - 4);
        return {
          entry,
          isActive,
          text,
          x,
          y,
          box: { l: x - boxWidth / 2, r: x + boxWidth / 2, t: y - boxHeight / 2, b: y + boxHeight / 2, w: boxWidth, h: boxHeight },
        };
      };

      const paintPlace = (placement) => {
        const { entry, isActive, text, x, y, box } = placement;
        ctx.fillStyle = palette.labelBg;
        ctx.strokeStyle = palette.labelBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(box.l, box.t, box.w, box.h, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isActive ? (entry.place.id === to ? palette.end : palette.start) : palette.label;
        ctx.fillText(text, x, y + 0.5);
      };

      // Active endpoints keep their names even when labels are switched off.
      const activePlacements = activeCandidates.map((entry) => placePlacement(entry, true));
      const activeBoxes = activePlacements.map((placement) => placement.box);

      if (labels) {
        const normalLimit = cam.mode === 'walk' ? 8 : cam.dist < 700 ? 24 : cam.dist < 1200 ? 16 : 11;
        let drawn = 0;
        for (const entry of placeCandidates) {
          if (drawn >= normalLimit) break;
          if (entry.place.id === to || entry.place.id === from) continue;
          if (cam.mode === 'walk' ? entry.depth > 320 : entry.depth > 2400) break;
          const placement = placePlacement(entry, false);
          if (overlaps(placement.box, boxes) || overlaps(placement.box, activeBoxes)) continue;
          paintPlace(placement);
          boxes.push(placement.box);
          drawn += 1;
        }
      }

      for (const placement of activePlacements) {
        paintPlace(placement);
        boxes.push(placement.box);
      }

      // Building labels for the largest roofs, only when labels are on. Skip
      // buildings that already have a curated place label to avoid duplicates.
      if (labels && (cam.mode === 'walk' || cam.dist < 2600)) {
        const candidates = tops
          .filter((top) => top.shape.name && top.shape.area > 0.00012 && !matchPlace(top.shape))
          .map((top) => {
            const xs = top.points.map((point) => point[0]);
            const ys = top.points.map((point) => point[1]);
            const left = Math.min(...xs);
            const right = Math.max(...xs);
            const topY = Math.min(...ys);
            const bottomY = Math.max(...ys);
            return { shape: top.shape, x: (left + right) / 2, y: (topY + bottomY) / 2, w: right - left, h: bottomY - topY };
          })
          .filter((entry) => entry.w > 24 && entry.h > 7)
          .sort((a, b) => b.w * b.h - a.w * a.h)
          .slice(0, cam.dist < 900 ? 16 : 8);

        ctx.font = '600 9.5px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
        for (const entry of candidates) {
          const text = entry.shape.name.length > 32 ? `${entry.shape.name.slice(0, 31)}…` : entry.shape.name;
          const boxWidth = ctx.measureText(text).width + 10;
          const boxHeight = 14;
          const x = clamp(entry.x, boxWidth / 2 + 4, width - boxWidth / 2 - 4);
          const y = clamp(entry.y, boxHeight / 2 + 4, height - boxHeight / 2 - 4);
          const box = { l: x - boxWidth / 2, r: x + boxWidth / 2, t: y - boxHeight / 2, b: y + boxHeight / 2 };
          if (overlaps(box, boxes)) continue;
          ctx.fillStyle = theme === 'dark' ? 'rgba(16,26,20,0.78)' : 'rgba(255,252,244,0.86)';
          ctx.beginPath();
          ctx.roundRect(box.l, box.t, boxWidth, boxHeight, 4);
          ctx.fill();
          ctx.fillStyle = palette.label;
          ctx.fillText(text, x, y + 0.5);
          boxes.push(box);
        }
      }
    }

    hitRef.current = { markers, tops };
  }, [shapes, placeIndex, routePoints, treeList, pathList, to, from, labels, palette, theme, imageReady, contextReady]);

  drawRef.current = draw;

  const stepCamera = useCallback((dt) => {
    const cam = cameraRef.current;
    const goal = targetRef.current;
    const alpha = 1 - Math.exp(-Math.min(64, Math.max(1, dt)) / 62);
    let moving = false;
    for (const key of ['yaw', 'pitch', 'dist', 'fov', 'tx', 'tz']) {
      if (!Number.isFinite(goal[key])) continue;
      const delta = goal[key] - cam[key];
      if (Math.abs(delta) > 0.0015) {
        cam[key] += delta * alpha;
        moving = true;
      } else {
        cam[key] = goal[key];
      }
    }
    cam.mode = goal.mode;
    if (goal.eye) {
      if (!Array.isArray(cam.eye)) cam.eye = [...goal.eye];
      for (let i = 0; i < 3; i += 1) {
        const delta = goal.eye[i] - cam.eye[i];
        if (Math.abs(delta) > 0.003) {
          cam.eye[i] += delta * alpha;
          moving = true;
        } else {
          cam.eye[i] = goal.eye[i];
        }
      }
    }
    return moving;
  }, []);

  const runCameraMotion = useCallback(() => {
    if (motionRef.current) return;
    lastMotionRef.current = performance.now();
    const tick = (now) => {
      const dt = now - lastMotionRef.current;
      lastMotionRef.current = now;
      const moving = stepCamera(dt);
      drawRef.current?.();
      if (moving) {
        motionRef.current = window.requestAnimationFrame(tick);
      } else {
        motionRef.current = 0;
      }
    };
    motionRef.current = window.requestAnimationFrame(tick);
  }, [stepCamera]);

  const stopCameraMotion = useCallback(() => {
    if (motionRef.current) window.cancelAnimationFrame(motionRef.current);
    motionRef.current = 0;
  }, []);

  const scheduleDraw = useCallback(() => {
    if (frameRef.current || motionRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      drawRef.current?.();
    });
  }, []);

  useEffect(() => {
    draw();
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      stopCameraMotion();
    };
  }, [draw, stopCameraMotion]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => scheduleDraw());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [scheduleDraw]);

  const setZoom = useCallback(
    (factor) => {
      const goal = targetRef.current;
      if (goal.mode === 'walk') {
        goal.fov = clamp(goal.fov / factor, 26, 88);
      } else {
        goal.dist = clamp(goal.dist / factor, MIN_DIST, MAX_DIST);
        setZoomLabel(zoomLabelFor(goal.dist));
      }
      runCameraMotion();
    },
    [runCameraMotion],
  );

  const pan = useCallback((screenDx, screenDy) => {
    const goal = targetRef.current;
    const wrap = wrapRef.current;
    const [tx, tz] = panTargetByScreen(goal, wrap?.clientWidth || 900, wrap?.clientHeight || 600, screenDx, screenDy);
    const dx = tx - goal.tx;
    const dz = tz - goal.tz;
    goal.tx = clamp(tx, -1400, 1400);
    goal.tz = clamp(tz, -1400, 1400);
    if (goal.mode === 'walk' && Array.isArray(goal.eye)) {
      goal.eye = [goal.eye[0] + dx, goal.eye[1], goal.eye[2] + dz];
    }
    runCameraMotion();
  }, [runCameraMotion]);

  // Convert a screen position to the point on the ground plane (y = 0) under
  // it. Used so wheel zoom keeps the campus point under the cursor fixed
  // instead of always zooming towards the middle of the screen.
  const screenToGround = useCallback((clientX, clientY) => {
    const cam = cameraRef.current;
    const wrap = wrapRef.current;
    if (!wrap || cam.mode === 'walk') return null;
    const rect = wrap.getBoundingClientRect();
    return orbitGround(cam, rect.width, rect.height, clientX - rect.left, clientY - rect.top);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0011);
      const cam = cameraRef.current;
      const goal = targetRef.current;
      if (cam.mode === 'walk') {
        setZoom(factor);
        return;
      }
      const nextDist = clamp(goal.dist / factor, MIN_DIST, MAX_DIST);
      const ground = screenToGround(event.clientX, event.clientY);
      if (ground && cam.dist > 1) {
        // Scale the camera target about the ground point under the cursor. The
        // eye then stays on the same line through that point, so the clicked
        // spot keeps the same pixel position while the map zooms.
        const [tx, tz] = zoomTargetAboutGround(cam, ground, nextDist);
        goal.tx = clamp(tx, -1400, 1400);
        goal.tz = clamp(tz, -1400, 1400);
      }
      goal.dist = nextDist;
      setZoomLabel(zoomLabelFor(nextDist));
      runCameraMotion();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [screenToGround, setZoom, runCameraMotion]);

  const applyPreset = useCallback(
    (name, extra = {}) => {
      const cam = cameraRef.current;
      const goal = targetRef.current;
      setPreset(name);
      if (name === 'iso') {
        Object.assign(goal, { mode: 'orbit', yaw: -0.62, pitch: 0.76, dist: 1460, fov: 38, tx: 0, tz: 0, eye: null });
        setZoomLabel(100);
      } else if (name === 'top') {
        Object.assign(goal, { mode: 'orbit', yaw: 0, pitch: 1.49, dist: 1860, fov: 36, tx: 0, tz: 0, eye: null });
        setZoomLabel(78);
      } else if (name === 'north') {
        Object.assign(goal, { mode: 'orbit', yaw: 0, pitch: 0.52, dist: 960, fov: 42, tx: 0, tz: 30, eye: null });
        setZoomLabel(152);
      } else if (name === 'east') {
        Object.assign(goal, { mode: 'orbit', yaw: -Math.PI / 2, pitch: 0.52, dist: 960, fov: 42, tx: 0, tz: 0, eye: null });
        setZoomLabel(152);
      } else if (name === 'focus') {
        // Click-to-focus: centre the camera on the clicked place or ground
        // point and move closer without snapping away to the route centre.
        const target = extra?.placeId
          ? placeIndex.find((place) => place.id === extra.placeId)
          : null;
        const pos = target?.pos || extra?.world || null;
        if (Array.isArray(pos)) {
          const [tx, tz] = world(pos);
          const yaw = cam.mode === 'orbit' ? cam.yaw : -0.62;
          const pitch = cam.mode === 'orbit' ? cam.pitch : 0.76;
          const dist = clamp(Math.min(goal.dist, 820), 380, 1200);
          Object.assign(goal, { mode: 'orbit', yaw, pitch, dist, fov: 38, tx, tz, eye: null });
          setZoomLabel(zoomLabelFor(dist));
        }
      } else if (name === 'route') {
        if (routePoints.length > 1) {
          const xs = routePoints.map((point) => point[0]);
          const zs = routePoints.map((point) => point[1]);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minZ = Math.min(...zs);
          const maxZ = Math.max(...zs);
          const [tx, tz] = world([(minX + maxX) / 2, (minZ + maxZ) / 2]);
          const spanX = Math.max(140, (maxX - minX) * METRES_X);
          const spanZ = Math.max(140, (maxZ - minZ) * METRES_Z);
          const vfov = 38 * D2R;
          const aspect = (wrapRef.current?.clientWidth || 900) / (wrapRef.current?.clientHeight || 600);
          const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
          const dist = clamp(
            Math.max(spanZ / (2 * Math.tan(vfov / 2)), spanX / (2 * Math.tan(hfov / 2))) * 1.35 + 120,
            420,
            3200,
          );
          Object.assign(goal, { mode: 'orbit', yaw: -0.55, pitch: 0.72, dist, fov: 38, tx, tz, eye: null });
          setZoomLabel(zoomLabelFor(dist));
        } else {
          Object.assign(goal, { mode: 'orbit', yaw: -0.62, pitch: 0.76, dist: 1460, fov: 38, tx: 0, tz: 0, eye: null });
          setZoomLabel(100);
        }
      } else if (name === 'street') {
        // Stand on the walkway before the destination and face the destination
        // itself (not merely the last graph node, which can sit around a
        // corner). Candidate viewpoints are checked against the real building
        // footprints so the camera does not end up inside a wall.
        const walk = routePoints.length > 1 ? routePoints.slice(0, -1) : [];
        const pathEnd = walk[walk.length - 1];
        const targetPlace = placeIndex.find((place) => place.id === to);
        const aim = targetPlace?.pos || pathEnd;
        let chosen = null;
        if (walk.length > 1 && pathEnd && aim) {
          const ignored = new Set();
          for (const building of shapes.buildings) {
            const place = matchPlace(building);
            const nearEnd =
              Math.hypot(
                (building.centroid[0] - pathEnd[0]) * METRES_X,
                (building.centroid[1] - pathEnd[1]) * METRES_Z,
              ) < 34;
            if ((targetPlace && place?.id === targetPlace.id) || nearEnd) ignored.add(building.id);
          }
          let walked = 0;
          for (let i = walk.length - 1; i > 0; i -= 1) {
            const dx = (walk[i][0] - walk[i - 1][0]) * METRES_X;
            const dz = (walk[i][1] - walk[i - 1][1]) * METRES_Z;
            const segment = Math.hypot(dx, dz);
            if (segment < 0.5) continue;
            walked += segment;
            if (walked < 38) continue;
            const eye = walk[i - 1];
            if (shapes.buildings.some((building) => pointInPolygon(eye[0], eye[1], building.pts))) continue;
            const metres = Math.hypot(
              (aim[0] - eye[0]) * METRES_X,
              (aim[1] - eye[1]) * METRES_Z,
            );
            const samples = Math.max(5, Math.ceil(metres / 7));
            let blocked = 0;
            for (let sample = 1; sample < samples; sample += 1) {
              const t = sample / samples;
              const x = eye[0] + (aim[0] - eye[0]) * t;
              const z = eye[1] + (aim[1] - eye[1]) * t;
              for (const building of shapes.buildings) {
                if (ignored.has(building.id)) continue;
                if (pointInPolygon(x, z, building.pts)) {
                  blocked += 1;
                  break;
                }
              }
            }
            const score = blocked * 1000 + Math.abs(walked - 72);
            if (!chosen || score < chosen.score) chosen = { eye, walked, blocked, score };
            if (walked > 180) break;
          }
        }
        if (!chosen && walk.length) chosen = { eye: walk[0], walked: 0, blocked: 0 };
        if (chosen) {
          const eye = chosen.eye;
          const yaw = Math.atan2(
            (aim[0] - eye[0]) * METRES_X,
            -(aim[1] - eye[1]) * METRES_Z,
          );
          Object.assign(cam, {
            mode: 'walk',
            eye: [world(eye)[0], 24, world(eye)[1]],
            yaw,
            pitch: -0.3,
            fov: 64,
            tx: world(eye)[0],
            tz: world(eye)[1],
          });
          Object.assign(goal, {
            mode: 'walk',
            eye: [world(eye)[0], 1.72, world(eye)[1]],
            yaw,
            pitch: 0.025,
            fov: 64,
            tx: world(eye)[0],
            tz: world(eye)[1],
          });
          setZoomLabel(100);
        } else {
          Object.assign(goal, { mode: 'orbit', yaw: -0.62, pitch: 0.76, dist: 1460, fov: 38, tx: 0, tz: 0, eye: null });
        }
      }
      if (goal.mode === 'orbit' && cam.mode !== 'orbit') cam.mode = 'orbit';
      runCameraMotion();
    },
    [matchPlace, placeIndex, routePoints, runCameraMotion, shapes.buildings, to],
  );

  // A "3D route" click while the map is already in 3D has no URL change to
  // react to, so MapPage also sends an explicit camera command.
  const commandRef = useRef('');
  useEffect(() => {
    if (!command?.id || commandRef.current === command.id) return;
    commandRef.current = command.id;
    applyPreset(command.name, command);
  }, [command, applyPreset]);

  // Leaving Street mode through the map's mode switch should fly back out to
  // the default 3D view instead of leaving the camera stuck at eye height.
  const previousStreetRef = useRef(false);
  useEffect(() => {
    if (street) {
      previousStreetRef.current = true;
      return;
    }
    if (previousStreetRef.current) {
      previousStreetRef.current = false;
      if (cameraRef.current.mode === 'walk' && targetRef.current.mode === 'walk') applyPreset('iso');
    }
  }, [street, applyPreset]);

  const reset = () => applyPreset('iso');
  const choosePreset = (name) => {
    applyPreset(name);
    onPreset?.(name);
  };

  const streetKeyRef = useRef('');
  useEffect(() => {
    if (!street) {
      streetKeyRef.current = '';
      return;
    }
    if (routePoints.length < 2) return;
    const key = `${from}->${to}:${routePoints.length}:${routePoints[0]?.[0]}:${routePoints[0]?.[1]}`;
    if (streetKeyRef.current === key) return;
    streetKeyRef.current = key;
    applyPreset('street');
  }, [street, routePoints, from, to, applyPreset]);

  const handlePointerDown = (event) => {
    if (event.button === 2) return;
    stopCameraMotion();
    try {
      canvasRef.current?.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic or already-released pointers have no capture target.
    }
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      yaw: cameraRef.current.yaw,
      pitch: cameraRef.current.pitch,
      tx: cameraRef.current.tx,
      tz: cameraRef.current.tz,
      pan: event.shiftKey || event.button === 1,
      moved: false,
      prevDx: 0,
      prevDy: 0,
      lastStepX: 0,
      lastStepY: 0,
    };
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    drag.lastStepX = dx - drag.prevDx;
    drag.lastStepY = dy - drag.prevDy;
    drag.prevDx = dx;
    drag.prevDy = dy;
    const cam = cameraRef.current;
    const goal = targetRef.current;
    if (drag.pan && cam.mode !== 'walk') {
      const scale = (2 * cam.dist * Math.tan((cam.fov * D2R) / 2)) / (wrapRef.current?.clientHeight || 600);
      const rightX = Math.cos(cam.yaw);
      const rightZ = Math.sin(cam.yaw);
      const forwardX = Math.sin(cam.yaw);
      const forwardZ = -Math.cos(cam.yaw);
      cam.tx = drag.tx + (-rightX * dx + forwardX * dy) * scale;
      cam.tz = drag.tz + (-rightZ * dx + forwardZ * dy) * scale;
      goal.tx = cam.tx;
      goal.tz = cam.tz;
    } else {
      cam.yaw = drag.yaw + dx * 0.006;
      cam.pitch = clamp(drag.pitch + dy * 0.0045, cam.mode === 'walk' ? -0.5 : 0.06, cam.mode === 'walk' ? 0.75 : 1.5);
      goal.yaw = cam.yaw;
      goal.pitch = cam.pitch;
    }
    scheduleDraw();
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may have released capture before pointerup.
    }
    if (!drag) return;
    if (drag.moved) {
      const goal = targetRef.current;
      if (!drag.pan) {
        goal.yaw += clamp(drag.lastStepX * 0.055, -0.12, 0.12);
        goal.pitch = clamp(
          goal.pitch + clamp(drag.lastStepY * 0.04, -0.1, 0.1),
          cameraRef.current.mode === 'walk' ? -0.5 : 0.06,
          cameraRef.current.mode === 'walk' ? 0.75 : 1.5,
        );
        runCameraMotion();
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const { markers, tops } = hitRef.current;

    let nearest = null;
    for (const marker of markers) {
      const distance = Math.hypot(marker.x - x, marker.y - y);
      if (distance <= marker.r && (!nearest || distance < nearest.distance)) nearest = { id: marker.id, distance };
    }
    if (nearest) {
      onSelect?.(nearest.id);
      return;
    }

    const ordered = [...tops].sort((a, b) => a.depth - b.depth);
    for (const top of ordered) {
      if (!pointInPolygon(x, y, top.points)) continue;
      const place = matchPlace(top.shape);
      if (place) {
        onSelect?.(place.id);
      } else if (Array.isArray(top.shape.centroid)) {
        applyPreset('focus', { world: top.shape.centroid });
      }
      return;
    }

    // Clicking open ground focuses that spot too, so a click followed by the
    // + button zooms into the area the user actually picked.
    const ground = screenToGround(event.clientX, event.clientY);
    if (!ground) return;
    const point = [ground[0] / METRES_X + 0.5, ground[1] / METRES_Z + 0.5];
    if (insideFrame(point, 0.06)) applyPreset('focus', { world: point });
  };

  if (!campus?.geometry?.length) {
    return (
      <div className="campus3d-empty">
        <Box size={22} />
        <p>The 3D model needs the published campus footprints, which are still loading.</p>
      </div>
    );
  }

  return (
    <div className="campus3d" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="campus3d-canvas"
        role="img"
        aria-label="Interactive 3D model of the GNDEC campus. Drag to rotate, shift-drag to pan, scroll to zoom towards the cursor, and click a building to focus it and select directions."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={(event) => event.preventDefault()}
      />

      <div className="campus3d-views" role="group" aria-label="Camera view">
        <button type="button" className={preset === 'iso' ? 'active' : ''} onClick={() => choosePreset('iso')}>
          <Layers3 size={13} /> 3D
        </button>
        <button type="button" className={preset === 'top' ? 'active' : ''} onClick={() => choosePreset('top')}>
          Top
        </button>
        <button type="button" className={preset === 'north' ? 'active' : ''} onClick={() => choosePreset('north')}>
          Front
        </button>
        <button type="button" className={preset === 'east' ? 'active' : ''} onClick={() => choosePreset('east')}>
          Side
        </button>
        <button type="button" className={preset === 'street' ? 'active' : ''} onClick={() => choosePreset('street')}>
          <Footprints size={13} /> Street
        </button>
      </div>

      <div className="campus3d-hint">Scroll to zoom at the cursor · click any spot to focus · drag to orbit · shift-drag to pan</div>

      <div className="campus3d-controls">
        <div className="map-pan-pad campus3d-pan-pad" role="group" aria-label="Move 3D map">
          <button type="button" className="icon-btn pan-up" onClick={() => pan(0, -72)} aria-label="Move map up"><ArrowUp size={15} /></button>
          <button type="button" className="icon-btn pan-left" onClick={() => pan(-72, 0)} aria-label="Move map left"><ArrowLeft size={15} /></button>
          <button type="button" className="icon-btn pan-right" onClick={() => pan(72, 0)} aria-label="Move map right"><ArrowRight size={15} /></button>
          <button type="button" className="icon-btn pan-down" onClick={() => pan(0, 72)} aria-label="Move map down"><ArrowDown size={15} /></button>
        </div>
        <button type="button" className="icon-btn" onClick={() => setZoom(1.3)} aria-label="Zoom in">
          <Plus size={15} />
        </button>
        <button type="button" className="icon-btn" onClick={() => setZoom(1 / 1.3)} aria-label="Zoom out">
          <Minus size={15} />
        </button>
        <button type="button" className="icon-btn" onClick={reset} aria-label="Reset the 3D view">
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          className={`icon-btn ${labels ? 'active' : ''}`}
          onClick={() => setLabels((value) => !value)}
          aria-pressed={labels}
          aria-label={labels ? 'Hide place labels' : 'Show place labels'}
        >
          {labels ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
      </div>

      <div className="campus3d-scale">
        <span>{zoomLabel}%</span>
        <span>·</span>
        <span>{shapes.buildings.length} buildings</span>
        <span>·</span>
        <span>aerial ground + roofs</span>
      </div>

      <div className="campus3d-credit" title="Campus footprints and paths come from OpenStreetMap. Roofs use the georeferenced Esri aerial image. Untagged heights and facade details are estimates, not a measured scan.">Ground and roof imagery © Esri · Footprints © OpenStreetMap · Facades illustrative; some heights estimated</div>
    </div>
  );
}

function shadeColor(hex, shade) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const scale = clamp(shade, 0.3, 1.25);
  return `rgb(${Math.round(clamp(r * scale, 0, 255))}, ${Math.round(clamp(g * scale, 0, 255))}, ${Math.round(clamp(b * scale, 0, 255))})`;
}

function bilinear(b0, b1, t0, t1, u, v) {
  const x = (1 - u) * (1 - v) * b0[0] + u * (1 - v) * b1[0] + (1 - u) * v * t0[0] + u * v * t1[0];
  const y = (1 - u) * (1 - v) * b0[1] + u * (1 - v) * b1[1] + (1 - u) * v * t0[1] + u * v * t1[1];
  return [x, y];
}

function drawFacade(ctx, face, palette, zoom) {
  const { b0, b1, t0, t1 } = face.corners;
  const { shape, screenLength, metres } = face;
  const levels = clamp(shape.levels || 2, 1, 9);
  const detail = zoom >= 130 || screenLength > 75;
  if (!detail) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(b0[0], b0[1]);
  ctx.lineTo(b1[0], b1[1]);
  ctx.lineTo(t1[0], t1[1]);
  ctx.lineTo(t0[0], t0[1]);
  ctx.closePath();
  ctx.clip();

  // Real number of floor bands from the OSM level count, tinted with the
  // building's own trim colour (cream bands on red brick, brick bands on cream).
  if (levels > 1) {
    ctx.fillStyle = shape.band || palette.band;
    ctx.globalAlpha = 0.55;
    for (let floor = 1; floor < levels; floor += 1) {
      const v = floor / levels;
      const inset = 0.035 / levels;
      const a = bilinear(b0, b1, t0, t1, 0, v - inset);
      const b = bilinear(b0, b1, t0, t1, 1, v - inset);
      const c = bilinear(b0, b1, t0, t1, 1, v + inset);
      const d = bilinear(b0, b1, t0, t1, 0, v + inset);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const columns = clamp(Math.round((metres || 12) / 3.1), 1, 34);
  if (screenLength > 34 && levels <= 8) {
    for (let floor = 0; floor < levels; floor += 1) {
      const v0 = (floor + 0.34) / levels;
      const v1 = (floor + 0.78) / levels;
      for (let column = 0; column < columns; column += 1) {
        const u0 = (column + 0.26) / columns;
        const u1 = (column + 0.74) / columns;
        const p0 = bilinear(b0, b1, t0, t1, u0, v0);
        const p1 = bilinear(b0, b1, t0, t1, u1, v0);
        const p2 = bilinear(b0, b1, t0, t1, u1, v1);
        const p3 = bilinear(b0, b1, t0, t1, u0, v1);
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.lineTo(p3[0], p3[1]);
        ctx.closePath();
        ctx.fillStyle = palette.window;
        ctx.globalAlpha = 0.82;
        ctx.fill();
        ctx.strokeStyle = palette.windowLight;
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
  ctx.restore();
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
