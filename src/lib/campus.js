import { photoPath } from './utils.js';

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
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

export const walkMinutes = (meters, speedMetersPerSecond = 1.25) =>
  Math.max(1, Math.round(meters / speedMetersPerSecond / 60));

const buildGraph = (campus) => {
  if (!campus) return { nodes: {}, graph: {} };
  const nodes = {};
  for (const junction of campus.junctions || []) nodes[junction.id] = { ...junction, kind: 'junction' };
  for (const place of campus.places || []) {
    if (!place.node) continue;
    // A place may share a junction node (for example the admission cell sits in the admin block).
    if (!nodes[place.node]) {
      nodes[place.node] = {
        id: place.node,
        name: place.name,
        lat: place.lat,
        lon: place.lon,
        pos: place.pos,
        kind: 'place',
        placeId: place.id,
      };
    }
  }
  const graph = {};
  for (const id of Object.keys(nodes)) graph[id] = [];
  for (const edge of campus.edges || []) {
    const a = nodes[edge.a];
    const b = nodes[edge.b];
    if (!a || !b) continue;
    const weight = distanceMeters(a, b);
    graph[edge.a].push({ id: edge.b, weight, note: edge.note, edge });
    graph[edge.b].push({ id: edge.a, weight, note: edge.note, edge });
  }
  return { nodes, graph };
};

export function findRoute(campus, fromId, toId) {
  if (!campus || !fromId || !toId) return null;
  const source = (campus.places || []).find((place) => place.id === fromId);
  const target = (campus.places || []).find((place) => place.id === toId);
  if (!source || !target) return null;
  if (fromId === toId) {
    return { source, target, path: [], steps: [], meters: 0, minutes: 0, approx: true, samePlace: true };
  }
  const { nodes, graph } = buildGraph(campus);
  const start = source.node;
  const end = target.node;
  if (!start || !end || !nodes[start] || !nodes[end]) {
    const direct = distanceMeters(source, target);
    return {
      source,
      target,
      path: [source, target],
      steps: [],
      meters: direct,
      minutes: walkMinutes(direct),
      approx: true,
      unavailable: true,
    };
  }
  const distances = Object.fromEntries(Object.keys(nodes).map((id) => [id, Infinity]));
  const previous = {};
  const visited = new Set();
  distances[start] = 0;
  const queue = [start];
  while (queue.length) {
    queue.sort((a, b) => distances[a] - distances[b]);
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    if (current === end) break;
    for (const edge of graph[current] || []) {
      const nextDistance = distances[current] + edge.weight;
      if (nextDistance < distances[edge.id]) {
        distances[edge.id] = nextDistance;
        previous[edge.id] = { id: current, note: edge.note, edge: edge.edge };
        if (!queue.includes(edge.id)) queue.push(edge.id);
      }
    }
  }
  if (!Number.isFinite(distances[end])) {
    const direct = distanceMeters(source, target);
    return {
      source,
      target,
      path: [source, target],
      steps: [],
      meters: direct,
      minutes: walkMinutes(direct),
      approx: true,
      unavailable: true,
    };
  }
  const nodePath = [];
  let cursor = end;
  while (cursor !== start) {
    nodePath.unshift(previous[cursor]);
    cursor = previous[cursor].id;
  }
  const path = nodePath.map((entry) => nodes[entry.id]).filter(Boolean);
  const steps = nodePath.map((entry, index) => {
    const node = nodes[entry.id];
    const place = (campus.places || []).find((item) => item.node === entry.id || item.id === entry.id);
    const gallery = (campus.gallery || []).find((item) => item.place === place?.id && item.src);
    return {
      node,
      name: place?.name || node.name,
      instruction: entry.note || 'Continue along the campus path.',
      photo: place?.photo || gallery?.src || null,
      placeId: place?.id || null,
      index,
    };
  });
  const meters = distances[end];
  return {
    source,
    target,
    path,
    steps,
    meters,
    minutes: walkMinutes(meters),
    approx: true,
    verified: Boolean(source.verified && target.verified),
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
