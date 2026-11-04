import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  Building2,
  Camera,
  Check,
  ChevronDown,
  CircleDot,
  Footprints,
  Info,
  Layers3,
  MapPin,
  Maximize2,
  Minus,
  Navigation,
  Plus,
  Route,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Link, useRouter } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import { categoryMeta, distanceMeters, findRoute, placePhoto, walkMinutes, CATEGORY_META } from '../lib/campus.js';
import { SATELLITE_CONTEXT, SATELLITE_DETAIL, SATELLITE_VIEW } from '../lib/map-bounds.js';
import { MAX_SCALE, MIN_SCALE, blendView, clampView, panView, viewIsClose, viewTransform, zoomView, zoomViewAtScreen } from '../lib/viewport.js';
import { norm, photoPath } from '../lib/utils.js';
import Campus3D from '../components/Campus3D.jsx';
import { RouteMap, RoutePreview } from '../components/RouteVisuals.jsx';
import {
  Badge,
  DataFoot,
  EmptyState,
  InlineNotice,
  Modal,
  PageHeader,
  Panel,
  PanelHead,
  SearchField,
  Segmented,
  Tabs,
} from '../components/ui.jsx';

const PLAN_VIEW = { width: 1.22, height: 1.34, x: -0.06, y: -0.08 };
const PLAN_DEFAULT = { scale: 1, x: 0, y: 0 };
const SATELLITE_DEFAULT = { scale: 1.34, x: 0, y: 0.01 };
const insideDetail = ([x, y]) =>
  x >= SATELLITE_DETAIL.x &&
  x <= SATELLITE_DETAIL.x + SATELLITE_DETAIL.width &&
  y >= SATELLITE_DETAIL.y &&
  y <= SATELLITE_DETAIL.y + SATELLITE_DETAIL.height;

const MODE_LABEL = {
  '3d': '3D model',
  satellite: 'Satellite',
  plan: 'Plan',
};

function toPoints(route) {
  if (!route?.points) return [];
  return route.points.filter(
    (point, index) => index === 0 || point[0] !== route.points[index - 1][0] || point[1] !== route.points[index - 1][1],
  );
}

export default function MapPage() {
  const { data, online, resolvedTheme } = useApp();
  const { searchParams, navigate } = useRouter();
  const campus = data?.campus;
  const detail = data?.campusDetail;
  const paths = data?.campusPaths;
  const trees = data?.campusTrees;
  const places = campus?.places || [];
  const gallery = campus?.gallery || [];

  const [mode, setMode] = useState(() => {
    const requested = searchParams.get('view');
    return requested === 'plan' || requested === 'satellite' ? requested : '3d';
  });
  const [view, setView] = useState(() => (mode === 'satellite' ? SATELLITE_DEFAULT : PLAN_DEFAULT));
  const [dragging, setDragging] = useState(false);
  const [cameraCommand, setCameraCommand] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [category, setCategory] = useState('all');
  const [placeQuery, setPlaceQuery] = useState('');
  const [panelTab, setPanelTab] = useState(searchParams.get('tab') === 'gallery' ? 'photos' : 'directions');
  const [lightbox, setLightbox] = useState(null);
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const frame = mode === 'satellite' ? SATELLITE_VIEW : PLAN_VIEW;
  const frameRef = useRef(frame);
  const viewRef = useRef(view);
  const targetViewRef = useRef(view);
  const viewMotionRef = useRef(0);
  const dragRef = useRef(null);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const suppressClickRef = useRef(false);
  const framedRouteRef = useRef(false);
  frameRef.current = frame;
  viewRef.current = view;
  const streetRequested = searchParams.get('street') === '1';

  const roomQuery = searchParams.get('room') || '';
  const room = useMemo(
    () => (data?.rooms?.rooms || []).find((item) => norm(item.code) === norm(roomQuery) || norm(item.id) === norm(roomQuery.replace(/[^a-z0-9]/gi, ''))),
    [data, roomQuery],
  );

  const [from, setFrom] = useState(searchParams.get('from') || 'main-gate');
  const [to, setTo] = useState(searchParams.get('to') || room?.placeId || 'library');

  const toParam = searchParams.get('to');
  const fromParam = searchParams.get('from');

  useEffect(() => {
    if (room?.placeId) {
      setTo(room.placeId);
      setPanelTab('directions');
    }
    // Only react when the room in the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomQuery, room?.id]);

  useEffect(() => {
    if (toParam) setTo(toParam);
  }, [toParam]);

  useEffect(() => {
    if (fromParam) setFrom(fromParam);
  }, [fromParam]);

  useEffect(() => {
    const requested = searchParams.get('view');
    if (requested === 'plan' || requested === 'satellite') setMode(requested);
  }, [searchParams]);

  const route = useMemo(() => findRoute(campus, from, to, paths), [campus, from, to, paths]);
  const source = places.find((place) => place.id === from);
  const destination = places.find((place) => place.id === to);
  const routePoints = useMemo(() => toPoints(route), [route]);

  // Nearest published OSM levels/height for the selected destination, when a
  // building polygon can be matched by name. Nothing is invented: unmatched
  // places simply do not show floor data.
  const destinationBuilding = useMemo(() => {
    if (!destination || !detail?.buildings) return null;
    const words = norm(destination.name).split(' ').filter((word) => word.length > 3);
    let best = null;
    for (const shape of campus?.geometry || []) {
      const meta = detail.buildings[String(shape.id)];
      if (!meta || !shape.name) continue;
      const shapeWords = norm(shape.name).split(' ').filter((word) => word.length > 3);
      if (!shapeWords.length) continue;
      const shared = shapeWords.filter((word) => words.includes(word)).length;
      const score = shared / Math.max(1, Math.min(words.length, shapeWords.length));
      if (score >= 0.6 && (!best || score > best.score)) best = { shape, meta, score };
    }
    if (!best) return null;
    return {
      name: best.shape.name,
      levels: best.meta.levels,
      height: best.meta.height,
      source: best.meta.levels || best.meta.height ? 'OpenStreetMap tags' : 'no published levels',
    };
  }, [campus, destination, detail]);

  const filteredPlaces = useMemo(() => {
    const terms = norm(placeQuery).split(' ').filter(Boolean);
    return places
      .filter((place) => category === 'all' || place.category === category)
      .filter((place) => {
        if (!terms.length) return true;
        const haystack = norm(`${place.name} ${place.category} ${place.description} ${(place.aliases || []).join(' ')}`);
        return terms.every((term) => haystack.includes(term));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [places, category, placeQuery]);

  const nearby = useMemo(() => {
    if (!destination) return [];
    return places
      .filter((place) => place.id !== destination.id)
      .map((place) => ({ place, distance: distanceMeters(place, destination) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
  }, [places, destination]);

  const setRouteParams = (updates) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    navigate(`/map?${next.toString()}`, { replace: true, keepScroll: true });
  };

  const setRouteParam = (key, value) => setRouteParams({ [key]: value });

  const requestPreset = (name, extra = {}) => setCameraCommand({ name, ...extra, id: `${Date.now()}-${Math.random()}` });

  const selectDestination = (id, { fromMap = false } = {}) => {
    setTo(id);
    setRouteParam('to', id);
    setPanelTab('directions');
    if (mode === '3d' && !streetRequested) {
      if (fromMap) {
        // A direct click on the 3D map should keep the camera where the user
        // clicked. Mark the initial route framing as spent so the new route
        // URL does not pull the camera away to the route centre.
        framedRouteRef.current = true;
        requestPreset('focus', { placeId: id });
      } else {
        requestPreset('route');
      }
    }
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    setRouteParams({ from: to, to: from });
    if (mode === '3d' && !streetRequested) requestPreset('route');
  };

  // Arriving from Ask Compass or a shared link should frame the whole route,
  // not leave the camera at the default overview.
  useEffect(() => {
    if (framedRouteRef.current) return;
    if (mode !== '3d' || streetRequested) return;
    if (!toParam && !fromParam) return;
    if (!route?.points || route.points.length < 2) return;
    framedRouteRef.current = true;
    requestPreset('route');
    // Only auto-frame the first route URL for this map visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, streetRequested, route, toParam, fromParam]);

  const defaultView = mode === 'satellite' ? SATELLITE_DEFAULT : PLAN_DEFAULT;

  const stopViewMotion = useCallback(() => {
    if (viewMotionRef.current) window.cancelAnimationFrame(viewMotionRef.current);
    viewMotionRef.current = 0;
  }, []);

  const commitView = useCallback((next) => {
    const clamped = clampView(next, frameRef.current);
    viewRef.current = clamped;
    targetViewRef.current = clamped;
    setView(clamped);
  }, []);

  const runViewMotion = useCallback(() => {
    if (viewMotionRef.current) return;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(64, now - last);
      last = now;
      const current = viewRef.current;
      const target = targetViewRef.current;
      if (viewIsClose(current, target, 0.0004)) {
        viewRef.current = target;
        setView(target);
        viewMotionRef.current = 0;
        return;
      }
      const next = blendView(current, target, 1 - Math.exp(-dt / 58));
      viewRef.current = next;
      setView(next);
      viewMotionRef.current = window.requestAnimationFrame(tick);
    };
    viewMotionRef.current = window.requestAnimationFrame(tick);
  }, []);

  const animateToView = useCallback(
    (next) => {
      targetViewRef.current = clampView(next, frameRef.current);
      runViewMotion();
    },
    [runViewMotion],
  );

  const framePointFromClient = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  }, []);

  const zoom = (delta) => {
    const base = targetViewRef.current;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, base.scale + delta));
    const frame = frameRef.current;
    animateToView(zoomView(base, scale, { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }, frame));
  };

  const pan = (direction) => {
    const frame = frameRef.current;
    const stepX = frame.width * 0.12;
    const stepY = frame.height * 0.12;
    const delta = {
      up: [0, -stepY],
      down: [0, stepY],
      left: [-stepX, 0],
      right: [stepX, 0],
    }[direction];
    if (delta) animateToView(panView(targetViewRef.current, delta[0], delta[1], frame));
  };

  const resetView = () => animateToView(defaultView);

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const svg = svgRef.current;
    try {
      svg?.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic or already-released pointers have no capture target.
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    suppressClickRef.current = false;
    if (pointersRef.current.size >= 2) {
      const pair = [...pointersRef.current.values()];
      const a = pair[0];
      const b = pair[1];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      pinchRef.current = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        point: framePointFromClient(midX, midY),
        view: { ...targetViewRef.current },
      };
      dragRef.current = null;
      setDragging(false);
      stopViewMotion();
      return;
    }
    stopViewMotion();
    const startPoint = framePointFromClient(event.clientX, event.clientY);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startPoint,
      origin: { ...viewRef.current },
      lastPoint: startPoint,
      lastTime: performance.now(),
      vx: 0,
      vy: 0,
      moved: false,
    };
    setDragging(true);
  };

  const onPointerMove = (event) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const pair = [...pointersRef.current.values()];
      const a = pair[0];
      const b = pair[1];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const midPoint = framePointFromClient(midX, midY);
      if (!midPoint) return;
      const factor = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) / pinchRef.current.distance;
      const frame = frameRef.current;
      let next = zoomViewAtScreen(pinchRef.current.view, pinchRef.current.view.scale * factor, pinchRef.current.point, frame);
      next = panView(next, midPoint.x - pinchRef.current.point.x, midPoint.y - pinchRef.current.point.y, frame);
      suppressClickRef.current = true;
      commitView(next);
      return;
    }

    const drag = dragRef.current;
    if (!drag || !drag.startPoint) return;
    const point = framePointFromClient(event.clientX, event.clientY);
    if (!point) return;
    const dx = point.x - drag.startPoint.x;
    const dy = point.y - drag.startPoint.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.004) {
      drag.moved = true;
      suppressClickRef.current = true;
    }
    const frame = frameRef.current;
    commitView({ scale: drag.origin.scale, x: drag.origin.x + dx, y: drag.origin.y + dy });

    const now = performance.now();
    const elapsed = Math.max(1, now - drag.lastTime);
    drag.vx = (point.x - drag.lastPoint.x) / elapsed;
    drag.vy = (point.y - drag.lastPoint.y) / elapsed;
    drag.lastPoint = point;
    drag.lastTime = now;
  };

  const onPointerUp = (event) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    try {
      svgRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may have released capture before pointerup.
    }
    if (!drag || !drag.moved) return;
    const frame = frameRef.current;
    if (Math.abs(drag.vx) + Math.abs(drag.vy) > 0.00004) {
      targetViewRef.current = clampView(
        {
          scale: viewRef.current.scale,
          x: viewRef.current.x + drag.vx * 95,
          y: viewRef.current.y + drag.vy * 95,
        },
        frame,
      );
      runViewMotion();
    }
  };

  const onDoubleClick = (event) => {
    const point = framePointFromClient(event.clientX, event.clientY);
    if (!point) return;
    const frame = frameRef.current;
    const base = targetViewRef.current;
    animateToView(zoomViewAtScreen(base, Math.min(MAX_SCALE, base.scale * 1.65), point, frame));
  };

  useEffect(() => stopViewMotion, [stopViewMotion]);

  useEffect(() => {
    stopViewMotion();
    const next = mode === 'satellite' ? SATELLITE_DEFAULT : PLAN_DEFAULT;
    viewRef.current = next;
    targetViewRef.current = next;
    setView(next);
    dragRef.current = null;
    pinchRef.current = null;
    pointersRef.current.clear();
    setDragging(false);
  }, [mode, stopViewMotion]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || mode === '3d') return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const point = framePointFromClient(event.clientX, event.clientY);
      if (!point) return;
      const base = targetViewRef.current;
      const factor = Math.exp(-event.deltaY * 0.0014);
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, base.scale * factor));
      targetViewRef.current = zoomViewAtScreen(base, nextScale, point, frameRef.current);
      runViewMotion();
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [mode, framePointFromClient, runViewMotion]);

  if (!data) return null;

  const categoryCounts = places.reduce((acc, place) => {
    acc[place.category] = (acc[place.category] || 0) + 1;
    return acc;
  }, {});

  const roomsAtPlace = room ? [] : [];
  const routePhoto = destination ? placePhoto(destination, campus) : null;
  const atDefault =
    Math.abs(view.scale - defaultView.scale) < 0.01 &&
    Math.abs(view.x - defaultView.x) < 0.004 &&
    Math.abs(view.y - defaultView.y) < 0.004;

  return (
    <div className="map-page">
      <PageHeader
        eyebrow="RASTA SAATHI · CAMPUS NAVIGATION"
        title="Find your way around campus"
        description={`${places.length} campus places mapped from OpenStreetMap. Routes follow the mapped walking network; endpoint locations can be approximate. The 3D view uses mapped footprints, with illustrative facades and estimated heights wherever survey data is missing.`}
      />

      {!online && (
        <InlineNotice tone="warn" title="Offline map mode">
          The illustrated campus map still works offline. External photos need a connection.
        </InlineNotice>
      )}

      <div className="map-layout">
        <section className="map-stage">
          <div className="map-toolbar">
            <SearchField value={placeQuery} onChange={setPlaceQuery} placeholder="Find a place on campus…" className="map-search" />
            <div className="map-toolbar-actions">
              <div className="map-mode-switch" role="group" aria-label="Map view">
                <button type="button" className={mode === '3d' ? 'active' : ''} onClick={() => { setMode('3d'); setRouteParams({ view: '', street: '' }); }}>
                  3D
                </button>
                <button type="button" className={mode === 'satellite' ? 'active' : ''} onClick={() => { setMode('satellite'); setRouteParams({ view: 'satellite', street: '' }); }}>
                  Satellite
                </button>
                <button type="button" className={mode === 'plan' ? 'active' : ''} onClick={() => { setMode('plan'); setRouteParams({ view: 'plan', street: '' }); }}>
                  Plan
                </button>
              </div>
              {mode !== '3d' && (
                <>
                  <button type="button" className="icon-btn" onClick={() => zoom(-0.25)} aria-label="Zoom out" disabled={view.scale <= MIN_SCALE + 0.001}>
                    <Minus size={16} />
                  </button>
                  <span className="zoom-level">{Math.round(view.scale * 100)}%</span>
                  <button type="button" className="icon-btn" onClick={() => zoom(0.25)} aria-label="Zoom in" disabled={view.scale >= MAX_SCALE - 0.001}>
                    <Plus size={16} />
                  </button>
                  <button type="button" className="icon-btn" onClick={resetView} aria-label="Reset map view" disabled={atDefault}>
                    <Maximize2 size={15} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div
            ref={wrapRef}
            className={`map-canvas-wrap ${mode === '3d' ? 'is-3d' : mode === 'satellite' ? 'is-satellite' : ''} ${dragging ? 'is-dragging' : ''}`}
          >
            {mode === '3d' ? (
              <Campus3D
                campus={campus}
                detail={detail}
                paths={paths}
                trees={trees}
                places={places}
                route={route}
                from={from}
                to={to}
                theme={resolvedTheme}
                street={streetRequested}
                command={cameraCommand}
                onPreset={(name) => setRouteParams({ street: name === 'street' ? '1' : '' })}
                onSelect={(id) => selectDestination(id, { fromMap: true })}
              />
            ) : (
            <svg
              ref={svgRef}
              className="campus-svg"
              viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
              preserveAspectRatio={mode === 'satellite' ? 'xMidYMid slice' : 'xMidYMid meet'}
              role="img"
              aria-label={mode === 'satellite' ? 'Satellite map of the GNDEC campus with walking routes' : 'Illustrated plan of the GNDEC campus with gates, buildings and walking routes'}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={onDoubleClick}
            >
              <defs>
                <pattern id="map-grid" width="0.035" height="0.035" patternUnits="userSpaceOnUse">
                  <circle cx="0.008" cy="0.008" r="0.0028" fill="#bdb59e" opacity="0.5" />
                </pattern>
                <pattern id="map-hatch" width="0.014" height="0.014" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="0.014" stroke="#b3a98e" strokeWidth="0.0018" opacity="0.45" />
                </pattern>
                <filter id="marker-shadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="0.004" stdDeviation="0.004" floodColor="#14352b" floodOpacity="0.25" />
                </filter>
              </defs>

              <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill={mode === 'satellite' ? '#2c3a2a' : '#f4f0e3'} />

              <g
                transform={viewTransform(view, frame)}
                className="map-zoom"
              >
                {mode === 'satellite' && (
                  <>
                    <image
                      href={SATELLITE_CONTEXT.src}
                      x={SATELLITE_CONTEXT.x}
                      y={SATELLITE_CONTEXT.y}
                      width={SATELLITE_CONTEXT.width}
                      height={SATELLITE_CONTEXT.height}
                      preserveAspectRatio="none"
                    />
                    <image
                      href={SATELLITE_DETAIL.src}
                      x={SATELLITE_DETAIL.x}
                      y={SATELLITE_DETAIL.y}
                      width={SATELLITE_DETAIL.width}
                      height={SATELLITE_DETAIL.height}
                      preserveAspectRatio="none"
                    />
                    <rect
                      x={SATELLITE_DETAIL.x}
                      y={SATELLITE_DETAIL.y}
                      width={SATELLITE_DETAIL.width}
                      height={SATELLITE_DETAIL.height}
                      fill="none"
                      stroke="rgba(255,255,255,0.18)"
                      strokeWidth="0.0025"
                    />
                  </>
                )}
                {mode === 'plan' && <rect x={PLAN_VIEW.x} y={PLAN_VIEW.y} width={PLAN_VIEW.width} height={PLAN_VIEW.height} fill="url(#map-grid)" />}
                {mode === 'plan' && campus?.geometry?.map((shape) => {
                  const leisure = shape.type === 'leisure';
                  const isPool = shape.kind === 'swimming_pool';
                  const isParking = shape.kind === 'parking';
                  const isSchool = shape.kind === 'school';
                  const fill = isPool ? '#c9e3e8' : isParking ? '#e3dfd2' : leisure ? '#dce6c9' : isSchool ? '#dfe8d2' : '#e8e1cd';
                  return (
                    <polygon
                      key={shape.id}
                      points={shape.pts.map((point) => point.join(',')).join(' ')}
                      fill={fill}
                      stroke={leisure ? '#b9c6a4' : '#c8bda3'}
                      strokeWidth="0.0022"
                      opacity={leisure ? 0.9 : 1}
                    />
                  );
                })}

                {mode === 'satellite' && campus?.geometry?.filter((shape) => shape.type === 'leisure').map((shape) => (
                  <polygon
                    key={shape.id}
                    points={shape.pts.map((point) => point.join(',')).join(' ')}
                    fill={shape.kind === 'swimming_pool' ? 'rgba(70,150,175,0.35)' : 'rgba(255,255,255,0.05)'}
                    stroke="rgba(255,255,255,0.55)"
                    strokeWidth="0.0018"
                  />
                ))}

                {paths?.edges?.map((edge, index) => {
                  const a = paths.nodes?.[edge.a];
                  const b = paths.nodes?.[edge.b];
                  if (!a?.pos || !b?.pos) return null;
                  if (mode === 'satellite' && (!insideDetail(a.pos) || !insideDetail(b.pos))) return null;
                  const soft = edge.kind === 'service' || edge.kind === 'residential' || edge.kind === 'unclassified';
                  return (
                    <line
                      key={index}
                      x1={a.pos[0]}
                      y1={a.pos[1]}
                      x2={b.pos[0]}
                      y2={b.pos[1]}
                      stroke={mode === 'satellite' ? 'rgba(255,255,255,0.28)' : '#b6ae97'}
                      strokeWidth={soft ? 0.0022 : 0.0034}
                      opacity={soft ? 0.45 : 0.7}
                    />
                  );
                })}

                {routePoints.length > 1 && (
                  <>
                    <polyline
                      points={routePoints.map((point) => point.join(',')).join(' ')}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="0.022"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.9"
                    />
                    <polyline
                      points={routePoints.map((point) => point.join(',')).join(' ')}
                      fill="none"
                      stroke="#0f6b4f"
                      strokeWidth="0.011"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="0.03 0.014"
                    />
                  </>
                )}

                {places
                  .filter((place) => place.pos)
                  .map((place) => {
                    const meta = categoryMeta(place.category);
                    const isDestination = place.id === to;
                    const isSource = place.id === from;
                    const isHovered = hovered === place.id;
                    const radius = isDestination || isSource ? 0.017 : isHovered ? 0.013 : 0.0095;
                    return (
                      <g
                        key={place.id}
                        className="svg-place"
                        role="button"
                        tabIndex={0}
                        aria-label={`${place.name}. ${place.category}. ${isDestination ? 'Destination' : 'Click to set as destination'}`}
                        onMouseEnter={() => setHovered(place.id)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!suppressClickRef.current) selectDestination(place.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            selectDestination(place.id);
                          }
                        }}
                      >
                        <circle cx={place.pos[0]} cy={place.pos[1]} r={radius + 0.008} fill="transparent" />
                        {(isDestination || isSource) && <circle cx={place.pos[0]} cy={place.pos[1]} r={radius + 0.007} fill="none" stroke={meta.color} strokeWidth="0.0035" opacity="0.6" />}
                        <circle
                          cx={place.pos[0]}
                          cy={place.pos[1]}
                          r={radius}
                          fill={isDestination ? '#0f6b4f' : isSource ? '#c97a45' : meta.color}
                          stroke="#ffffff"
                          strokeWidth={isDestination || isSource ? 0.004 : 0.0028}
                          filter="url(#marker-shadow)"
                        />
                        {(isDestination || isSource || isHovered) && (
                          <g>
                            <rect
                              x={place.pos[0] + 0.02}
                              y={place.pos[1] - 0.018}
                              width={Math.min(0.42, 0.012 * place.name.length + 0.03)}
                              height="0.032"
                              rx="0.008"
                              fill="#122f26"
                              opacity="0.94"
                            />
                            <text x={place.pos[0] + 0.03} y={place.pos[1] + 0.003} fill="#f8f5ea" fontSize="0.018" fontWeight="700">
                              {place.name.length > 30 ? `${place.name.slice(0, 29)}…` : place.name}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                {source?.pos && (
                  <g>
                    <circle cx={source.pos[0]} cy={source.pos[1]} r="0.022" fill="none" stroke="#c97a45" strokeWidth="0.003" opacity="0.35" />
                  </g>
                )}
              </g>
            </svg>
            )}

            {mode !== '3d' && (
              <div className="map-pan-pad map-pan-controls" role="group" aria-label="Move map">
                <button type="button" className="icon-btn pan-up" onClick={() => pan('up')} aria-label="Move map up"><ArrowUp size={16} /></button>
                <button type="button" className="icon-btn pan-left" onClick={() => pan('left')} aria-label="Move map left"><ArrowLeft size={16} /></button>
                <button type="button" className="icon-btn pan-right" onClick={() => pan('right')} aria-label="Move map right"><ArrowRight size={16} /></button>
                <button type="button" className="icon-btn pan-down" onClick={() => pan('down')} aria-label="Move map down"><ArrowDown size={16} /></button>
              </div>
            )}

            <div className="map-legend">
              <span><i style={{ background: '#0f6b4f' }} /> Destination</span>
              <span><i style={{ background: '#c97a45' }} /> Start</span>
              <span><i style={{ background: '#4766c7' }} /> Campus place</span>
              <span className="map-legend-osm">
                {mode === '3d'
                  ? 'OSM footprints · imagery © Esri'
                  : mode === 'satellite'
                    ? 'Esri World Imagery · footprints © OpenStreetMap'
                    : 'Illustrated plan · route metres are real'}
              </span>
            </div>

            <div className="map-category-bar">
              <button type="button" className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>
                All <em>{places.length}</em>
              </button>
              {Object.entries(categoryCounts).map(([key, count]) => (
                <button type="button" key={key} className={category === key ? 'active' : ''} onClick={() => setCategory(key)}>
                  {categoryMeta(key).label} <em>{count}</em>
                </button>
              ))}
            </div>

            {placeQuery && (
              <div className="map-search-results">
                {filteredPlaces.slice(0, 8).map((place) => (
                  <button
                    type="button"
                    key={place.id}
                    onClick={() => {
                      selectDestination(place.id);
                      setPlaceQuery('');
                    }}
                  >
                    <span>
                      <b>{place.name}</b>
                      <small>{categoryMeta(place.category).label}</small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                ))}
                {!filteredPlaces.length && <p>No place matched “{placeQuery}”.</p>}
              </div>
            )}
          </div>
        </section>

        <aside className="map-panel">
          <Tabs
            options={[
              { value: 'directions', label: 'Directions', icon: Route },
              { value: 'places', label: 'Places', icon: MapPin },
              { value: 'photos', label: 'Photos', icon: Camera },
            ]}
            value={panelTab}
            onChange={setPanelTab}
          />

          {panelTab === 'directions' && (
            <div className="directions-panel">
              {room && (
                <div className="room-route-card">
                  {room.image ? <img src={room.image} alt={`${room.code} room`} /> : <span className="room-route-icon"><MapPin size={18} /></span>}
                  <div>
                    <span className="eyebrow">ROOM LOOKUP</span>
                    <b>{room.code}</b>
                    <small>{[room.block, room.floor].filter(Boolean).join(' · ') || 'Block and floor not verified'}</small>
                  </div>
                  <Badge tone={room.block ? 'gold' : 'neutral'}>{room.block ? 'Block inferred' : 'Unverified'}</Badge>
                </div>
              )}
              <div className="route-pickers">
                <label className="route-picker">
                  <span>Starting from</span>
                  <select value={from} onChange={(event) => { const id = event.target.value; setFrom(id); setRouteParam('from', id); if (mode === '3d' && !streetRequested) requestPreset('route'); }}>
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>{place.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                <button type="button" className="swap-btn" onClick={swap} aria-label="Swap start and destination">
                  <ArrowLeftRight size={15} />
                </button>
                <label className="route-picker">
                  <span>Going to</span>
                  <select value={to} onChange={(event) => { const id = event.target.value; setTo(id); setRouteParam('to', id); if (mode === '3d' && !streetRequested) requestPreset('route'); }}>
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>{place.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
              </div>

              {destination && (
                <div className="destination-card">
                  <div className="destination-photo">
                    {routePhoto ? <img src={routePhoto} alt={destination.name} loading="lazy" /> : <span><MapPin size={24} /></span>}
                    <Badge tone={destination.verified ? 'green' : 'gold'}>{destination.verified ? 'Location checked' : 'Approximate location'}</Badge>
                  </div>
                  <div className="destination-copy">
                    <span className="eyebrow">{categoryMeta(destination.category).label.toUpperCase()}</span>
                    <h2>{destination.name}</h2>
                    <p>{destination.description || 'A campus place from the Compass place list.'}</p>
                    {destination.floor && <small>Floor: {destination.floor}</small>}
                    {destinationBuilding?.levels && (
                      <small>
                        {destinationBuilding.levels} floors
                        {destinationBuilding.height ? ` · ${destinationBuilding.height} m` : ''} · {destinationBuilding.source}
                      </small>
                    )}
                  </div>
                </div>
              )}

              {route ? (
                <>
                  <div className="route-summary">
                    <span className="route-summary-icon"><Footprints size={20} /></span>
                    <div>
                      <b>{Math.round(route.meters)} m</b>
                      <span>about {route.minutes} min walk</span>
                    </div>
                    <Badge tone="green">Shortest</Badge>
                  </div>
                  <RoutePreview
                    points={route.points}
                    from={source}
                    to={destination}
                    metres={route.meters}
                    minutes={route.minutes}
                    onOpen={() => {
                      setMode('3d');
                      setRouteParams({ view: '', street: '' });
                      requestPreset('route');
                    }}
                  />
                  <div className="route-actions">
                    <button type="button" onClick={() => { setMode('3d'); setRouteParams({ view: '', street: '' }); requestPreset('route'); }}>
                      <Layers3 size={13} /> 3D route
                    </button>
                    <button type="button" onClick={() => { setMode('3d'); setRouteParams({ view: '', street: '1' }); requestPreset('street'); }}>
                      <Footprints size={13} /> Street view
                    </button>
                  </div>
                  <div className="route-meta">
                    <span><Route size={12} /> {route.steps.length - 1} turns · OpenStreetMap walk network</span>
                    {route.connector && (route.connector.from > 8 || route.connector.to > 8) && (
                      <span><Info size={12} /> Up to {Math.max(route.connector.from, route.connector.to)} m from a mapped path to the door</span>
                    )}
                    {route.alternative && (
                      <span><ArrowLeftRight size={12} /> Longer alternative: {Math.round(route.alternative.meters)} m · {route.alternative.minutes} min</span>
                    )}
                  </div>
                  <ol className="route-steps with-thumbs">
                    <li>
                      <span className="step-thumb">
                        <RouteMap points={source?.pos ? [source.pos] : []} compact padding={0.045} label={`Satellite view of ${source?.name || 'the starting point'}`} />
                        <b className="step-thumb-index start">A</b>
                      </span>
                      <div>
                        <b>Start at {source?.name || 'your location'}</b>
                        <small>{source?.description || 'Use the main gate as a safe default starting point.'}</small>
                      </div>
                    </li>
                    {route.steps.map((step, index) => (
                      <li key={`${step.instruction}-${index}`}>
                        {step.points?.length ? (
                          <span className="step-thumb">
                            <RouteMap points={step.points} compact padding={0.03} label={`Satellite view of step ${index + 1}`} />
                            <b className={`step-thumb-index ${step.turn === 'arrive' ? 'end' : ''}`}>
                              {step.turn === 'arrive' ? <Check size={11} /> : index + 1}
                            </b>
                          </span>
                        ) : (
                          <span className={`step-marker ${step.turn === 'arrive' ? 'end' : ''}`}>
                            {step.turn === 'arrive' ? <Check size={13} /> : index + 1}
                          </span>
                        )}
                        <div>
                          <b>{step.instruction}</b>
                          <small>
                            {step.turn === 'arrive'
                              ? destination?.description || 'Check campus signs at the building entrance.'
                              : `${step.turn === 'left' ? 'Turn left' : step.turn === 'right' ? 'Turn right' : step.turn === 'start' ? 'Start' : 'Continue'} · ${Math.round(step.metres)} m · facing ${step.direction}`}
                          </small>
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <EmptyState icon={Navigation} title="Choose a destination">
                  Pick a place on the map, or use the selectors above to plan an estimated walk.
                </EmptyState>
              )}

              {route?.verified === false && (
                <InlineNotice tone="warn" title="Location confidence varies">
                  At least one endpoint is approximate. Use nearby signage or ask at the department office.
                </InlineNotice>
              )}
              {nearby.length > 0 && (
                <div className="nearby-block">
                  <span className="eyebrow">NEARBY</span>
                  <div className="nearby-list">
                    {nearby.map(({ place, distance }) => (
                      <button type="button" key={place.id} onClick={() => selectDestination(place.id)}>
                        <span className="nearby-dot" style={{ background: categoryMeta(place.category).color }} />
                        <span>{place.name}</span>
                        <em>{Math.round(distance)} m</em>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="map-disclaimer">
                <Info size={13} /> Distances follow the mapped walkable network. Indoor door-level routes and lift/stairs
                choices are not published, so the last few metres to a room are indicative.
              </p>
            </div>
          )}

          {panelTab === 'places' && (
            <div className="places-panel">
              <SearchField value={placeQuery} onChange={setPlaceQuery} placeholder="Filter places…" />
              <div className="places-list">
                {filteredPlaces.map((place) => (
                  <button type="button" key={place.id} className={`place-list-row ${place.id === to ? 'active' : ''}`} onClick={() => selectDestination(place.id)}>
                    <span className="place-list-dot" style={{ background: categoryMeta(place.category).color }} />
                    <span>
                      <b>{place.name}</b>
                      <small>{categoryMeta(place.category).label}{place.verified ? '' : ' · approximate'}</small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {panelTab === 'photos' && (
            <div className="photos-panel">
              <div className="photos-intro">
                <span className="eyebrow">REAL CAMPUS PHOTOS</span>
                <p>Public college gallery and official room photos. Every image is credited.</p>
              </div>
              <div className="photo-gallery">
                {gallery.map((item, index) => (
                  <button
                    type="button"
                    key={`${item.src}-${index}`}
                    className="photo-tile"
                    onClick={() => setLightbox(item)}
                    style={{ backgroundImage: `url(${photoPath(item.src)})` }}
                    aria-label={item.title}
                  >
                    <span>
                      <b>{item.title}</b>
                      <small>{item.place || 'Campus'}</small>
                    </span>
                  </button>
                ))}
              </div>
              <p className="fine-print">Some photos show interiors or sports facilities. Access hours may differ from the general campus timings.</p>
            </div>
          )}

          <div className="map-side-links">
            <button type="button" className="text-button" onClick={() => setPanelTab('photos')}>
              <Camera size={14} /> Campus photo gallery
            </button>
          </div>
        </aside>
      </div>

      <div className="map-bottom-grid">
        <Panel>
          <PanelHead eyebrow="GOOD TO KNOW" title={`${places.length} places mapped`} description="GNDEC shares its campus with GND Polytechnic, hostels and a public school. Gates and access hours can change." />
          <div className="place-category-grid">
            {Object.entries(CATEGORY_META).map(([key, meta]) => (
              <button type="button" key={key} className="category-tile" onClick={() => { setCategory(key); setPanelTab('places'); }}>
                <span style={{ background: meta.color }} />
                <b>{meta.label}</b>
                <small>{categoryCounts[key] || 0} places</small>
              </button>
            ))}
          </div>
        </Panel>
        <Panel className="map-facts">
          <span className="eyebrow">CAMPUS FACTS</span>
          <h2>86 acres, one shared campus.</h2>
          <dl>
            <div><dt>Established</dt><dd>{campus?.facts?.established || 1953}</dd></div>
            <div><dt>Address</dt><dd>{campus?.facts?.address || 'Gill Road, Ludhiana'}</dd></div>
            <div><dt>Library</dt><dd>{campus?.facts?.libraryHours?.weekdays || '8 am – 10 pm'} weekdays</dd></div>
            <div><dt>Hostels</dt><dd>{campus?.facts?.hostels || 'On-campus housing'}</dd></div>
          </dl>
          <DataFoot>Facts from the official GNDEC campus page. Verify access rules with the college.</DataFoot>
        </Panel>
      </div>

      {lightbox && (
        <Modal open onClose={() => setLightbox(null)} title={lightbox.title} subtitle={lightbox.caption} size="lg">
          <div className="lightbox">
            <img src={photoPath(lightbox.src)} alt={lightbox.title} />
            <p>
              <span>{lightbox.credit}</span>
              <span>{lightbox.place ? `Place: ${places.find((place) => place.id === lightbox.place)?.name || lightbox.place}` : ''}</span>
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
