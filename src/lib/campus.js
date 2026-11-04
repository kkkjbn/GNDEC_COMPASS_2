import { photoPath } from './utils.js';

/**
 * Campus navigation maths.
 *
 * Distances are real great-circle metres. Routes run on the OpenStreetMap
 * footpath/road graph (`public/data/campus-paths.json`), which is the same
 * network a pedestrian can actually use, and fall back to the older
 * hand-checked junction graph when the detailed network is unavailable.
 */

const EARTH_RADIUS = 6371000;
const WALK_SPEED = 1.25; // metres per second, about 4.5 km/h

export const distanceMeters = (a, b) => {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) {
    return 0;
  }
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

export const walkMinutes = (meters, speedMetersPerSecond = WALK_SPEED) =>
  Math.max(1, Math.round(meters / speedMetersPerSecond / 60));

export const bearingDegrees = (a, b) => {
  if (!a || !b) return 0;
  const rad = (value) => (value * Math.PI) / 180;
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
};

const COMPASS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
];

export const compassLabel = (degrees) => COMPASS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];

const signedTurn = (from, to) => {
  let delta = ((to - from + 540) % 360) - 180;
  if (delta <= -180) delta += 360;
  return delta;
};

const ROAD_LABELS = {
  residential: 'the campus road',
  service: 'the service road',
  unclassified: 'the campus road',
  living_street: 'the campus lane',
  footway: 'the footpath',
  pedestrian: 'the walkway',
  path: 'the path',
  steps: 'the steps',
  track: 'the track',
  cycleway: 'the cycle path',
};

const roadLabel = (edge) => edge?.name || ROAD_LABELS[edge?.kind] || 'the campus path';

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

const pathGraphCache = new WeakMap();

function buildPathGraph(paths) {
  if (!paths || !paths.nodes || !Array.isArray(paths.edges)) return null;
  if (pathGraphCache.has(paths)) return pathGraphCache.get(paths);
  const nodes = paths.nodes;
  const adjacency = new Map();
  for (const id of Object.keys(nodes)) adjacency.set(id, []);
  for (const edge of paths.edges) {
    const a = nodes[edge.a];
    const b = nodes[edge.b];
    if (!a || !b) continue;
    const metres = Number.isFinite(edge.m) && edge.m > 0 ? edge.m : distanceMeters(a, b);
    if (!Number.isFinite(metres) || metres <= 0) continue;
    if (!adjacency.has(edge.a)) adjacency.set(edge.a, []);
    if (!adjacency.has(edge.b)) adjacency.set(edge.b, []);
    adjacency.get(edge.a).push({ to: edge.b, metres, edge });
    adjacency.get(edge.b).push({ to: edge.a, metres, edge });
  }
  const graph = { nodes, adjacency, snapCache: new WeakMap() };
  pathGraphCache.set(paths, graph);
  return graph;
}

function nearestNode(graph, point) {
  if (!graph || !point) return null;
  if (graph.snapCache.has(point)) return graph.snapCache.get(point);
  let best = null;
  for (const [id, node] of Object.entries(graph.nodes)) {
    const metres = distanceMeters(point, node);
    if (!best || metres < best.metres) best = { id, node, metres };
  }
  if (best) graph.snapCache.set(point, best);
  return best;
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(key, value) {
    const items = this.items;
    items.push({ key, value });
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent].key <= items[index].key) break;
      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  }

  pop() {
    const items = this.items;
    if (!items.length) return null;
    const top = items[0];
    const last = items.pop();
    if (items.length && last) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && items[left].key < items[smallest].key) smallest = left;
        if (right < items.length && items[right].key < items[smallest].key) smallest = right;
        if (smallest === index) break;
        [items[smallest], items[index]] = [items[index], items[smallest]];
        index = smallest;
      }
    }
    return top;
  }
}

function shortestPath(graph, startId, endId, weightOf) {
  const distances = new Map([[startId, 0]]);
  const previous = new Map();
  const settled = new Set();
  const heap = new MinHeap();
  heap.push(0, startId);
  while (heap.size) {
    const entry = heap.pop();
    if (!entry) break;
    const { value: id } = entry;
    if (settled.has(id)) continue;
    settled.add(id);
    if (id === endId) break;
    for (const edge of graph.adjacency.get(id) || []) {
      const weight = weightOf(edge);
      const next = (distances.get(id) || 0) + weight;
      if (next < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, next);
        previous.set(edge.to, { id, edge: edge.edge, metres: edge.metres });
        heap.push(next, edge.to);
      }
    }
  }
  if (!settled.has(endId)) return null;
  const ids = [];
  const edges = [];
  let cursor = endId;
  while (cursor !== startId) {
    const step = previous.get(cursor);
    if (!step) return null;
    ids.unshift(cursor);
    edges.unshift(step.edge);
    cursor = step.id;
  }
  ids.unshift(startId);
  let metres = 0;
  for (const edge of edges) metres += Number.isFinite(edge?.m) ? edge.m : 0;
  return { ids, edges, metres };
}

// ---------------------------------------------------------------------------
// Legacy fallback graph (hand-checked junctions kept in campus.json)
// ---------------------------------------------------------------------------

const LEGACY_LABELS = {
  'j-main-gate': 'Main Gate',
  'j-northgate': 'North Gate',
  'j-westgate': 'West Gate',
  'j-southgate': 'South Gate',
  'j-admin': 'Administration Block',
  'j-library': 'Central Library',
  'j-labs': 'Laboratory Block',
  'j-workshop': 'Central Workshops',
  'j-quad': 'Automobile Block',
  'j-sports': 'Sports Complex',
  'j-north': 'North Campus',
  'j-hostel': 'Hostel Zone',
  'j-west': 'West Campus',
  'j-mba': 'Business Administration',
  'j-gndp': 'GND Polytechnic',
  'j-poly': 'Polytechnic Campus',
};

function buildLegacyGraph(campus) {
  if (!campus) return null;
  const nodes = {};
  for (const junction of campus.junctions || []) nodes[junction.id] = { ...junction, kind: 'junction' };
  for (const place of campus.places || []) {
    if (!place.node || nodes[place.node]) continue;
    nodes[place.node] = {
      id: place.node,
      name: place.name,
      lat: place.lat,
      lon: place.lon,
      pos: place.pos,
      kind: 'place',
    };
  }
  const adjacency = new Map();
  for (const id of Object.keys(nodes)) adjacency.set(id, []);
  for (const edge of campus.edges || []) {
    const a = nodes[edge.a];
    const b = nodes[edge.b];
    if (!a || !b) continue;
    const metres = distanceMeters(a, b);
    adjacency.get(edge.a)?.push({ to: edge.b, metres, edge });
    adjacency.get(edge.b)?.push({ to: edge.a, metres, edge });
  }
  return { nodes, adjacency, snapCache: new WeakMap(), legacy: true };
}

// ---------------------------------------------------------------------------
// Directions
// ---------------------------------------------------------------------------

function buildDirections(segments, target) {
  const steps = [];
  let index = 0;
  let previousEndBearing = null;
  while (index < segments.length) {
    const start = index;
    let metres = segments[index].metres;
    let cursor = index + 1;
    while (cursor < segments.length) {
      const turn = Math.abs(signedTurn(segments[cursor - 1].bearing, segments[cursor].bearing));
      if (turn > 26) break;
      metres += segments[cursor].metres;
      cursor += 1;
    }
    const first = segments[start];
    const last = segments[cursor - 1];
    const bearing = first.bearing;
    const turn = previousEndBearing == null ? null : signedTurn(previousEndBearing, bearing);
    const isFirst = steps.length === 0;
    const direction = compassLabel(bearing);
    const distanceText = metres >= 95 ? `${Math.round(metres / 10) * 10} m` : `${Math.round(metres)} m`;
    // Keep the real geometry of this leg so the directions list can show a
    // satellite crop of the actual turn instead of a generic illustration.
    const points = [];
    for (let i = start; i < cursor; i += 1) {
      const segment = segments[i];
      for (const point of [segment.from, segment.to]) {
        if (!Array.isArray(point?.pos)) continue;
        const previousPoint = points[points.length - 1];
        if (previousPoint && previousPoint[0] === point.pos[0] && previousPoint[1] === point.pos[1]) continue;
        points.push(point.pos);
      }
    }
    let instruction;
    if (isFirst) {
      instruction = `Head ${direction} along ${roadLabel(first.edge)} for ${distanceText}`;
    } else if (turn != null && turn > 26) {
      instruction = `Turn right and continue ${direction} for ${distanceText}`;
    } else if (turn != null && turn < -26) {
      instruction = `Turn left and continue ${direction} for ${distanceText}`;
    } else {
      instruction = `Keep going ${direction} for ${distanceText}`;
    }
    if (last.edge?.steps) instruction = `${instruction}, then take the steps`;
    steps.push({
      index: steps.length,
      instruction,
      metres,
      bearing,
      direction,
      turn: turn == null ? 'start' : turn > 26 ? 'right' : turn < -26 ? 'left' : 'straight',
      kind: first.edge?.kind || 'footway',
      name: last.edge?.name || '',
      at: last.to?.pos || null,
      points,
    });
    previousEndBearing = last.bearing;
    index = cursor;
  }
  if (steps.length) {
    const last = steps[steps.length - 1];
    steps.push({
      index: steps.length,
      instruction: `Arrive at ${target?.name || 'your destination'}`,
      metres: 0,
      bearing: last.bearing,
      direction: last.direction,
      turn: 'arrive',
      kind: 'arrive',
      name: target?.name || '',
      at: target?.pos || null,
      points: Array.isArray(target?.pos) ? [target.pos] : [],
    });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function findRoute(campus, fromId, toId, paths) {
  if (!campus || !fromId || !toId) return null;
  const source = (campus.places || []).find((place) => place.id === fromId);
  const target = (campus.places || []).find((place) => place.id === toId);
  if (!source || !target) return null;
  if (fromId === toId) {
    return {
      source,
      target,
      path: [],
      points: source.pos ? [source.pos] : [],
      steps: [],
      meters: 0,
      minutes: 0,
      approx: false,
      samePlace: true,
      shortest: true,
    };
  }

  const graph = buildPathGraph(paths) || buildLegacyGraph(campus);
  if (!graph) {
    const direct = distanceMeters(source, target);
    return {
      source,
      target,
      path: [],
      points: [source.pos, target.pos].filter(Boolean),
      steps: [],
      meters: direct,
      minutes: walkMinutes(direct),
      approx: true,
      unavailable: true,
      shortest: true,
    };
  }

  const snapFor = (place) => {
    if (graph.legacy && place.node && graph.nodes[place.node]) {
      return { id: place.node, node: graph.nodes[place.node], metres: distanceMeters(place, graph.nodes[place.node]) };
    }
    return nearestNode(graph, place);
  };
  const startSnap = snapFor(source);
  const endSnap = snapFor(target);
  if (!startSnap || !endSnap) {
    const direct = distanceMeters(source, target);
    return {
      source,
      target,
      path: [],
      points: [source.pos, target.pos].filter(Boolean),
      steps: [],
      meters: direct,
      minutes: walkMinutes(direct),
      approx: true,
      unavailable: true,
      shortest: true,
    };
  }

  const connectorStart = startSnap.metres;
  const connectorEnd = endSnap.metres;

  let nodePath = { ids: [startSnap.id], edges: [], metres: 0 };
  if (startSnap.id !== endSnap.id) {
    const result = shortestPath(graph, startSnap.id, endSnap.id, (edge) => edge.metres);
    if (!result) {
      const direct = distanceMeters(source, target);
      return {
        source,
        target,
        path: [],
        points: [source.pos, target.pos].filter(Boolean),
        steps: [],
        meters: direct,
        minutes: walkMinutes(direct),
        approx: true,
        unavailable: true,
        shortest: true,
      };
    }
    nodePath = result;
  }

  const points = [];
  const legs = [];
  const pushPoint = (point) => {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return;
    const last = points[points.length - 1];
    if (last && Math.abs(last.lat - point.lat) < 1e-9 && Math.abs(last.lon - point.lon) < 1e-9) return;
    points.push(point);
  };
  const addLeg = (from, to, edge) => {
    if (!from || !to) return;
    const metres = distanceMeters(from, to);
    if (metres < 0.6) return;
    legs.push({ from, to, metres, bearing: bearingDegrees(from, to), edge });
  };
  const doorwayEdge = { kind: 'footway', name: '' };
  const sourceNode = graph.nodes[startSnap.id];
  const targetNode = graph.nodes[endSnap.id];

  pushPoint(source);
  for (const id of nodePath.ids) pushPoint(graph.nodes[id]);
  pushPoint(target);

  addLeg(source, sourceNode, connectorStart > 2 ? doorwayEdge : null);
  for (let i = 1; i < nodePath.ids.length; i += 1) {
    addLeg(graph.nodes[nodePath.ids[i - 1]], graph.nodes[nodePath.ids[i]], nodePath.edges[i - 1]);
  }
  addLeg(targetNode, target, connectorEnd > 2 ? doorwayEdge : null);

  const pathNodes = nodePath.ids.map((id) => graph.nodes[id]);
  const meters = legs.reduce((sum, leg) => sum + leg.metres, 0);
  const steps = buildDirections(legs, target);
  const approxConnector = Math.max(connectorStart, connectorEnd);

  // A secondary walking route: re-run Dijkstra with the chosen edges
  // penalised, which produces a genuinely different path when the network
  // has an alternative. It is only offered when it is a sensible detour.
  let alternative = null;
  if (nodePath.edges.length > 2) {
    const used = new Set(nodePath.edges);
    const alt = shortestPath(graph, startSnap.id, endSnap.id, (edge) =>
      used.has(edge.edge) ? edge.metres * 6 : edge.metres,
    );
    if (alt && alt.ids.length > 1) {
      const altPoints = [];
      const altPush = (point) => {
        if (!point) return;
        const last = altPoints[altPoints.length - 1];
        if (last && Math.abs(last.lat - point.lat) < 1e-9 && Math.abs(last.lon - point.lon) < 1e-9) return;
        altPoints.push(point);
      };
      altPush(source);
      for (const id of alt.ids) altPush(graph.nodes[id]);
      altPush(target);
      let altMetres = altPoints.reduce(
        (sum, point, index) => (index ? sum + distanceMeters(altPoints[index - 1], point) : 0),
        0,
      );
      if (altMetres > meters * 1.06 && altMetres < meters * 1.45) {
        alternative = {
          points: altPoints.map((point) => point.pos),
          meters: altMetres,
          minutes: walkMinutes(altMetres),
        };
      }
    }
  }

  return {
    source,
    target,
    path: pathNodes,
    points: points.map((point) => point.pos),
    steps,
    meters,
    minutes: walkMinutes(meters),
    approx: approxConnector > 30,
    connector: {
      from: Math.round(connectorStart),
      to: Math.round(connectorEnd),
    },
    verified: Boolean(source.verified && target.verified),
    shortest: true,
    alternative,
  };
}

export function nearestPlace(campus, point) {
  if (!campus || !point) return null;
  return (campus.places || [])
    .map((place) => ({ place, distance: distanceMeters(place, point) }))
    .sort((a, b) => a.distance - b.distance)[0]?.place;
}

export function placePhoto(place, campus) {
  if (!place) return null;
  if (place.photo) return photoPath(place.photo);
  const gallery = (campus?.gallery || []).find((item) => item.place === place.id && item.src);
  return gallery ? photoPath(gallery.src) : null;
}

export const CATEGORY_META = {
  gate: { label: 'Gates', color: '#0e6b4f', icon: 'gate' },
  admin: { label: 'Offices', color: '#b4763f', icon: 'office' },
  library: { label: 'Library', color: '#4766c7', icon: 'book' },
  academic: { label: 'Academic blocks', color: '#138a72', icon: 'building' },
  lab: { label: 'Labs & workshops', color: '#c6583e', icon: 'lab' },
  landmark: { label: 'Landmarks', color: '#8a5aa5', icon: 'star' },
  sports: { label: 'Sports', color: '#c49a25', icon: 'ball' },
  hostel: { label: 'Hostels', color: '#7d6b52', icon: 'bed' },
  food: { label: 'Food', color: '#dc784d', icon: 'food' },
  health: { label: 'Health', color: '#c84d67', icon: 'health' },
  bank: { label: 'Bank', color: '#0e7e9e', icon: 'bank' },
};

export const categoryMeta = (category) =>
  CATEGORY_META[category] || { label: category || 'Campus', color: '#0e6b4f', icon: 'pin' };
