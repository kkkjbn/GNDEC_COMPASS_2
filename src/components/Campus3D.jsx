import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Eye, EyeOff, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import { norm } from '../lib/utils.js';

/**
 * Real extruded 3D model of the published campus footprints.
 *
 * Every footprint comes from `campus.geometry`, which is the OpenStreetMap
 * extract already shipped with Compass. Buildings are extruded with a height
 * inferred from their footprint and kind, then painted with a small painter's
 * algorithm camera (yaw + pitch) on a canvas. No map tiles, no external map
 * service and no network request is used at runtime.
 */

const WORLD = 1000; // Normalised campus units → world metres.
const CAMERA = { yaw: -0.62, pitch: 0.9, zoom: 1.5 };
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 4.4;
const PITCH_MIN = 0.32;
const PITCH_MAX = 1.36;

const PALETTES = {
  light: {
    skyTop: '#eef3e8',
    skyBottom: '#dde7d6',
    ground: '#d9e3cb',
    groundEdge: '#bacba6',
    wall: [154, 20, 44],
    roof: [22, 44, 72],
    collegeWall: [158, 24, 40],
    industrialWall: [150, 12, 50],
    schoolWall: [96, 18, 52],
    flat: {
      leisure: '#aecb92',
      swimming_pool: '#a6cfd8',
      track: '#c9b89c',
      parking: '#cfc9ba',
      park: '#bcd4a0',
      clinic: '#d9d3c4',
      toilets: '#d9d3c4',
      fountain: '#b9d3d8',
      school: '#cfe0bb',
      default: '#c3d0b2',
    },
    label: '#1c3126',
    labelBg: 'rgba(250, 248, 240, 0.92)',
    route: '#0f6b4f',
    routeHalo: 'rgba(255, 255, 255, 0.9)',
    highlight: '#0f6b4f',
    shadow: 'rgba(30, 45, 35, 0.18)',
  },
  dark: {
    skyTop: '#101a15',
    skyBottom: '#16241d',
    ground: '#1b2c23',
    groundEdge: '#24382c',
    wall: [152, 14, 34],
    roof: [22, 30, 38],
    collegeWall: [150, 16, 36],
    industrialWall: [148, 9, 30],
    schoolWall: [140, 12, 34],
    flat: {
      leisure: '#2c4634',
      swimming_pool: '#24515a',
      track: '#4a4033',
      parking: '#333a32',
      park: '#31503a',
      clinic: '#363f36',
      toilets: '#363f36',
      fountain: '#2f4f55',
      school: '#334a38',
      default: '#33443a',
    },
    label: '#e9efe4',
    labelBg: 'rgba(16, 26, 20, 0.82)',
    route: '#6fd3a4',
    routeHalo: 'rgba(8, 18, 12, 0.85)',
    highlight: '#6fd3a4',
    shadow: 'rgba(0, 0, 0, 0.32)',
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

const shapeHeight = (shape) => {
  const { type, kind, name, area } = shape;
  // Large campus/school area polygons are ground, not roofs.
  if (area > 0.01) return 0;
  if (type === 'leisure') return 0;
  if (type === 'amenity' && kind !== 'school' && kind !== 'college') return 0;

  let base = 8;
  if (kind === 'college') base = 14;
  else if (kind === 'industrial') base = 10;
  else if (kind === 'school') base = 13;
  else if (kind === 'commercial') base = 9;
  else if (kind === 'PG') base = 7;

  let height = base + Math.sqrt(Math.max(area, 0)) * WORLD * 0.32;
  if (/library/i.test(name)) height = Math.max(height, 15);
  if (/admin/i.test(name)) height = Math.max(height, 16);
  if (/hostel|mess/i.test(name)) height = Math.max(height, 14);
  if (/workshop/i.test(name)) height = 10;
  if (/sports complex/i.test(name)) height = Math.max(height, 17);
  if (/auditorium|open air theatre/i.test(name)) height = Math.max(height, 8);
  return clamp(height, 5, 23);
};

const isFlat = (shape) => shape.height <= 0.01;

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

export default function Campus3D({
  campus,
  places = [],
  routePoints = [],
  from,
  to,
  onSelect,
  theme = 'light',
}) {
  const palette = PALETTES[theme] || PALETTES.light;
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef({ ...CAMERA });
  const dragRef = useRef(null);
  const hitRef = useRef({ markers: [], tops: [] });
  const frameRef = useRef(0);
  const [labels, setLabels] = useState(true);
  const [zoomLabel, setZoomLabel] = useState(CAMERA.zoom);

  const shapes = useMemo(() => {
    const all = (campus?.geometry || [])
      .filter((shape) => Array.isArray(shape.pts) && shape.pts.length >= 3)
      .map((shape) => {
        const pts = shape.pts.map((point) => [Number(point[0]), Number(point[1])]);
        const area = Math.abs(polygonArea(pts));
        const base = { ...shape, pts, area, centroid: centroidOf(pts), height: 0 };
        base.height = shapeHeight(base);
        return base;
      })
      .filter((shape) => shape.pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));

    // The largest college-area polygon is the campus boundary envelope.
    const boundary = all
      .filter((shape) => shape.type === 'amenity' && shape.kind === 'college' && shape.area > 0.2)
      .sort((a, b) => b.area - a.area)[0]?.pts;

    // The OSM extract also contains neighbouring blocks (school, sub-tehsil,
    // PG hostel, staff colony). Keep the campus envelope and drop the known
    // off-campus names; the polygon itself is a stitched multipolygon that is
    // not reliable for point-in-polygon tests.
    const OFF_CAMPUS = /nankana|sub tehsil|anand enterprises|csiom|abhay'?s pg/i;
    const boundaryBounds = boundary
      ? (() => {
          const xs = boundary.map((point) => point[0]);
          const ys = boundary.map((point) => point[1]);
          return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.min(Math.max(...ys), 0.9) };
        })()
      : null;

    const list = all
      .filter((shape) => shape.area <= 0.3)
      .filter((shape) => !OFF_CAMPUS.test(shape.name || ''))
      .filter((shape) => {
        if (!boundaryBounds) return true;
        const [cx, cz] = shape.centroid;
        return (
          cx >= boundaryBounds.minX - 0.02 &&
          cx <= boundaryBounds.maxX + 0.02 &&
          cz >= boundaryBounds.minY - 0.02 &&
          cz <= boundaryBounds.maxY + 0.02
        );
      });

    const xs = (boundary || list.flatMap((shape) => shape.pts)).map((point) => point[0]);
    const ys = (boundary || list.flatMap((shape) => shape.pts)).map((point) => point[1]);
    const bounds = xs.length
      ? {
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
          cx: (Math.min(...xs) + Math.max(...xs)) / 2,
          cy: (Math.min(...ys) + Math.max(...ys)) / 2,
          extent: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
        }
      : { minX: 0, maxX: 1, minY: 0, maxY: 1, cx: 0.5, cy: 0.5, extent: 1 };

    return { list: list.sort((a, b) => b.area - a.area), bounds, boundary };
  }, [campus]);

  const placeIndex = useMemo(
    () =>
      places
        .filter((place) => Array.isArray(place.pos))
        .map((place) => ({ ...place, key: norm(place.name) })),
    [places],
  );

  // Frame the official campus boundary. The raw OSM extract also contains
  // off-campus neighbours, so a place-based box would zoom out too far.
  const focus = useMemo(() => {
    const boundary = shapes.boundary;
    if (boundary) {
      const xs = boundary.map((point) => point[0]);
      const ys = boundary.map((point) => point[1]);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      };
    }
    const points = places.filter((place) => Array.isArray(place.pos)).map((place) => place.pos);
    if (!points.length) return null;
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const margin = 0.04;
    return {
      minX: Math.min(...xs) - margin,
      maxX: Math.max(...xs) + margin,
      minY: Math.min(...ys) - margin,
      maxY: Math.max(...ys) + margin,
    };
  }, [places, shapes]);

  const matchPlace = useCallback(
    (shape) => {
      const name = norm(shape.name);
      if (!name) return null;
      const direct = placeIndex.find((place) => place.key === name || place.key.includes(name) || name.includes(place.key));
      if (direct) return direct;
      const alias = placeIndex.find((place) =>
        (place.aliases || []).some((entry) => {
          const aliasKey = norm(entry);
          return aliasKey && (aliasKey === name || name.includes(aliasKey) || aliasKey.includes(name));
        }),
      );
      return alias || null;
    },
    [placeIndex],
  );

  const selectArtwork = useCallback(
    (place) => {
      if (place && onSelect) onSelect(place.id);
    },
    [onSelect],
  );

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

    const { yaw, pitch, zoom } = cameraRef.current;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const { bounds } = shapes;

    const rawProject = (x, z, y = 0) => {
      const wx = (x - bounds.cx) * WORLD;
      const wz = (z - bounds.cy) * WORLD;
      const rx = wx * cosYaw - wz * sinYaw;
      const rz = wx * sinYaw + wz * cosYaw;
      return [rx, rz * cosPitch - y * sinPitch, rz];
    };

    // Fit the whole model inside the canvas with room for the legend and controls.
    let minPX = Infinity;
    let maxPX = -Infinity;
    let minPY = Infinity;
    let maxPY = -Infinity;
    const consider = (x, z, y = 0) => {
      const [px, py] = rawProject(x, z, y);
      if (px < minPX) minPX = px;
      if (px > maxPX) maxPX = px;
      if (py < minPY) minPY = py;
      if (py > maxPY) maxPY = py;
    };
    const view = focus || {
      minX: bounds.minX,
      maxX: bounds.maxX,
      minY: bounds.minY,
      maxY: bounds.maxY,
    };
    consider(view.minX, view.minY);
    consider(view.maxX, view.minY);
    consider(view.maxX, view.maxY);
    consider(view.minX, view.maxY);
    for (const shape of shapes.list) {
      const [cx, cz] = shape.centroid;
      if (cx < view.minX || cx > view.maxX || cz < view.minY || cz > view.maxY) continue;
      for (const [x, z] of shape.pts) {
        consider(x, z, 0);
        if (shape.height > 0) consider(x, z, shape.height);
      }
    }

    const padX = 26;
    const padTop = 54;
    const padBottom = 66;
    const availW = Math.max(80, width - padX * 2);
    const availH = Math.max(80, height - padTop - padBottom);
    const spanX = Math.max(1e-6, maxPX - minPX);
    const spanY = Math.max(1e-6, maxPY - minPY);
    const fit = Math.min(availW / spanX, availH / spanY);
    const scale = fit * zoom;
    const originX = padX + (availW - spanX * scale) / 2 - minPX * scale;
    const originY = padTop + (availH - spanY * scale) / 2 - minPY * scale;

    const project = (x, z, y = 0) => {
      const [px, py, rz] = rawProject(x, z, y);
      return [originX + px * scale, originY + py * scale, rz];
    };

    // Sky / ground backdrop.
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const groundCorners = [
      project(view.minX, view.minY),
      project(view.maxX, view.minY),
      project(view.maxX, view.maxY),
      project(view.minX, view.maxY),
    ];
    ctx.beginPath();
    groundCorners.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = palette.ground;
    ctx.fill();
    ctx.strokeStyle = palette.groundEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const faces = [];
    const groundFaces = [];
    const tops = [];

    for (const shape of shapes.list) {
      const [shapeX, shapeZ] = shape.centroid;
      if (
        focus &&
        (shapeX < focus.minX - 0.03 ||
          shapeX > focus.maxX + 0.03 ||
          shapeZ < focus.minY - 0.03 ||
          shapeZ > focus.maxY + 0.03)
      ) {
        continue;
      }
      const { height: h, pts } = shape;
      const top = pts.map(([x, z]) => project(x, z, h));
      const topDepth = top.reduce((sum, point) => sum + point[2], 0) / top.length;
      const flat = isFlat(shape);

      const flatColor =
        palette.flat[shape.kind] ||
        (shape.type === 'leisure' ? palette.flat.leisure : palette.flat.default);

      let baseWall;
      if (shape.kind === 'college') baseWall = palette.collegeWall;
      else if (shape.kind === 'industrial') baseWall = palette.industrialWall;
      else if (shape.kind === 'school') baseWall = palette.schoolWall;
      else baseWall = palette.wall;

      const roofColor = flat ? flatColor : `hsl(${palette.roof[0]} ${palette.roof[1]}% ${palette.roof[2]}%)`;

      if (flat || h <= 0.01) {
        groundFaces.push({ points: top, depth: topDepth, fill: roofColor, stroke: null });
        continue;
      }

      // Top face (also the hit target).
      faces.push({ points: top, depth: topDepth, fill: roofColor, stroke: palette.shadow });
      if (shape.name && shape.area > 0.00004) {
        tops.push({ points: top, shape, depth: topDepth });
      }

      const orientation = polygonArea(pts) >= 0 ? 1 : -1;
      for (let i = 0; i < pts.length; i += 1) {
        const [x1, z1] = pts[i];
        const [x2, z2] = pts[(i + 1) % pts.length];
        const dx = x2 - x1;
        const dz = z2 - z1;
        const length = Math.hypot(dx, dz);
        if (length < 1e-6) continue;
        const nx = (orientation * dz) / length;
        const nz = (orientation * -dx) / length;
        // Back-face culling: the camera sits on the +rz side.
        if (nx * sinYaw + nz * cosYaw <= 0.02) continue;

        const shade = 0.62 + 0.38 * Math.max(0, nx * -0.55 + nz * 0.83);
        const wall = `hsl(${baseWall[0]} ${baseWall[1]}% ${clamp(baseWall[2] * shade, 8, 92)}%)`;

        const quad = [project(x1, z1, 0), project(x2, z2, 0), project(x2, z2, h), project(x1, z1, h)];
        const depth = quad.reduce((sum, point) => sum + point[2], 0) / quad.length;
        faces.push({ points: quad, depth, fill: wall, stroke: null });
      }
    }

    groundFaces.sort((a, b) => a.depth - b.depth);
    for (const face of groundFaces) {
      ctx.beginPath();
      face.points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = face.fill;
      ctx.fill();
    }

    faces.sort((a, b) => a.depth - b.depth);
    for (const face of faces) {
      ctx.beginPath();
      face.points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = face.fill;
      ctx.fill();
      if (face.stroke) {
        ctx.strokeStyle = face.stroke;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }

    // Walking route, lifted slightly above the ground.
    if (routePoints && routePoints.length > 1) {
      const line = routePoints.map(([x, z]) => project(x, z, 2.5));
      ctx.beginPath();
      line.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = palette.routeHalo;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = palette.route;
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const markers = [];
    for (const place of placeIndex) {
      if (!place.pos) continue;
      const [x, y, depth] = project(place.pos[0], place.pos[1], 3);
      const active = place.id === to || place.id === from;
      const radius = active ? 6.5 : 4.6;
      ctx.beginPath();
      ctx.arc(x, y, radius + 2.5, 0, Math.PI * 2);
      ctx.fillStyle = palette.shadow;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = active ? palette.highlight : '#4766c7';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (active) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = palette.highlight;
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.55;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      markers.push({ x, y, r: Math.max(14, radius + 6), id: place.id, depth });
    }

    if (labels) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
      const boxes = [];
      const candidates = shapes.list
        .filter((shape) => shape.name && shape.height > 0 && shape.area > 0.00008)
        .map((shape) => {
          const points = shape.pts.map(([x, z]) => project(x, z, shape.height));
          const xs = points.map((point) => point[0]);
          const ys = points.map((point) => point[1]);
          const left = Math.min(...xs);
          const right = Math.max(...xs);
          const topY = Math.min(...ys);
          const bottomY = Math.max(...ys);
          return {
            shape,
            x: (left + right) / 2,
            y: (topY + bottomY) / 2,
            w: right - left,
            h: bottomY - topY,
          };
        })
        .filter((entry) => entry.w >= 16 && entry.h >= 5)
        .sort((a, b) => b.w * b.h - a.w * a.h)
        .slice(0, 16);

      for (const entry of candidates) {
        const { x, y } = entry;
        if (x < 30 || x > width - 30 || y < 18 || y > height - 18) continue;

        const text = entry.shape.name.length > 30 ? `${entry.shape.name.slice(0, 29)}…` : entry.shape.name;
        const metrics = ctx.measureText(text);
        const padX = 4;
        const boxWidth = metrics.width + padX * 2;
        const boxHeight = 16;
        const box = {
          l: x - boxWidth / 2,
          r: x + boxWidth / 2,
          t: y - boxHeight / 2,
          b: y + boxHeight / 2,
        };
        if (boxes.some((other) => box.l < other.r + 3 && box.r > other.l - 3 && box.t < other.b + 2 && box.b > other.t - 2)) continue;

        ctx.fillStyle = palette.labelBg;
        ctx.beginPath();
        ctx.roundRect(box.l, box.t, boxWidth, boxHeight, 4);
        ctx.fill();
        ctx.fillStyle = palette.label;
        ctx.fillText(text, x, y + 0.5);
        boxes.push(box);
      }

      // Place pins get small labels too, so the blue dots are identifiable.
      ctx.font = '650 9.5px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
      const pinPlaces = markers
        .map((marker) => ({ marker, place: placeIndex.find((place) => place.id === marker.id) }))
        .filter((entry) => entry.place?.name)
        .sort((a, b) => Number(b.place.id === to || b.place.id === from) - Number(a.place.id === to || a.place.id === from));

      for (const { marker, place } of pinPlaces) {
        const text = place.name.length > 26 ? `${place.name.slice(0, 25)}…` : place.name;
        const metrics = ctx.measureText(text);
        const boxWidth = metrics.width + 8;
        const boxHeight = 14;
        const x = Math.min(width - boxWidth / 2 - 4, Math.max(boxWidth / 2 + 4, marker.x));
        const y = marker.y - 12;
        if (y < 12 || y > height - 12) continue;
        const box = { l: x - boxWidth / 2, r: x + boxWidth / 2, t: y - boxHeight / 2, b: y + boxHeight / 2 };
        if (boxes.some((other) => box.l < other.r + 2 && box.r > other.l - 2 && box.t < other.b + 1 && box.b > other.t - 1)) continue;
        ctx.fillStyle = palette.labelBg;
        ctx.beginPath();
        ctx.roundRect(box.l, box.t, boxWidth, boxHeight, 4);
        ctx.fill();
        ctx.fillStyle = place.id === to || place.id === from ? palette.highlight : palette.label;
        ctx.fillText(text, x, y + 0.5);
        boxes.push(box);
      }
    }

    hitRef.current = { markers, tops };
  }, [shapes, placeIndex, routePoints, to, from, labels, palette, focus]);

  const scheduleDraw = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    draw();
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [draw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => scheduleDraw());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [scheduleDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const next = clamp(cameraRef.current.zoom * Math.exp(-event.deltaY * 0.0012), ZOOM_MIN, ZOOM_MAX);
      cameraRef.current.zoom = next;
      setZoomLabel(next);
      scheduleDraw();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [scheduleDraw]);

  const zoomBy = (factor) => {
    const next = clamp(cameraRef.current.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    cameraRef.current.zoom = next;
    setZoomLabel(next);
    scheduleDraw();
  };

  const rotateBy = (delta) => {
    cameraRef.current.yaw += delta;
    scheduleDraw();
  };

  const reset = () => {
    cameraRef.current = { ...CAMERA };
    setZoomLabel(CAMERA.zoom);
    scheduleDraw();
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      yaw: cameraRef.current.yaw,
      pitch: cameraRef.current.pitch,
      moved: false,
    };
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    cameraRef.current.yaw = drag.yaw + dx * 0.006;
    cameraRef.current.pitch = clamp(drag.pitch + dy * 0.004, PITCH_MIN, PITCH_MAX);
    scheduleDraw();
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
    if (!drag || drag.moved) return;

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
      selectArtwork(placeIndex.find((place) => place.id === nearest.id));
      return;
    }

    const ordered = [...tops].sort((a, b) => b.depth - a.depth);
    for (const top of ordered) {
      if (!pointInPolygon(x, y, top.points)) continue;
      const place = matchPlace(top.shape);
      if (place) selectArtwork(place);
      return;
    }
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
        aria-label="Interactive 3D model of the GNDEC campus. Drag to rotate, scroll to zoom, and select a place to show directions."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      <div className="campus3d-hint">Drag to orbit · scroll or pinch buttons to zoom · tap a building or pin</div>

      <div className="campus3d-controls">
        <button type="button" className="icon-btn" onClick={() => rotateBy(-0.32)} aria-label="Rotate left">
          <RotateCcw size={15} />
        </button>
        <button type="button" className="icon-btn" onClick={() => rotateBy(0.32)} aria-label="Rotate right">
          <RotateCw size={15} />
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
          <Minus size={15} />
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          <Plus size={15} />
        </button>
        <button type="button" className="icon-btn" onClick={reset} aria-label="Reset the 3D view">
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          className={`icon-btn ${labels ? 'active' : ''}`}
          onClick={() => setLabels((value) => !value)}
          aria-pressed={labels}
          aria-label={labels ? 'Hide building labels' : 'Show building labels'}
        >
          {labels ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
      </div>

      <div className="campus3d-scale">
        <span>{Math.round(zoomLabel * 100)}%</span>
        <span>·</span>
        <span>{shapes.list.filter((shape) => shape.height > 0).length} extruded footprints</span>
      </div>
    </div>
  );
}
