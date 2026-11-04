import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Footprints,
  Info,
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
import { norm, photoPath } from '../lib/utils.js';
import Campus3D from '../components/Campus3D.jsx';
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

const VIEW = { width: 1.22, height: 1.34, x: -0.06, y: -0.08 };

function toPoints(route) {
  if (!route) return [];
  const points = [route.source, ...route.steps.map((step) => step.node), route.target]
    .filter((item) => item && item.pos)
    .map((item) => item.pos);
  return points.filter((point, index) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]);
}

export default function MapPage() {
  const { data, online, resolvedTheme } = useApp();
  const { searchParams, navigate } = useRouter();
  const campus = data?.campus;
  const places = campus?.places || [];
  const gallery = campus?.gallery || [];

  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [drag, setDrag] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [category, setCategory] = useState('all');
  const [placeQuery, setPlaceQuery] = useState('');
  const [panelTab, setPanelTab] = useState(searchParams.get('tab') === 'gallery' ? 'photos' : 'directions');
  const [lightbox, setLightbox] = useState(null);
  const [mode, setMode] = useState(searchParams.get('view') === 'plan' ? 'plan' : '3d');
  const svgRef = useRef(null);

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

  const route = useMemo(() => findRoute(campus, from, to), [campus, from, to]);
  const source = places.find((place) => place.id === from);
  const destination = places.find((place) => place.id === to);
  const routePoints = useMemo(() => toPoints(route), [route]);

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

  const setRouteParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    navigate(`/map?${next.toString()}`, { replace: true, keepScroll: true });
  };

  const selectDestination = (id) => {
    setTo(id);
    setRouteParam('to', id);
    setPanelTab('directions');
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    setRouteParam('from', to);
    setRouteParam('to', from);
  };

  const zoom = (delta) => {
    setView((current) => ({
      ...current,
      scale: Math.max(1, Math.min(2.8, Math.round((current.scale + delta) * 10) / 10)),
    }));
  };

  const resetView = () => setView({ scale: 1, x: 0, y: 0 });

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setDrag({ startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y, moved: false });
  };
  const onPointerMove = (event) => {
    if (!drag) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((event.clientX - drag.startX) / rect.width) * VIEW.width / view.scale;
    const dy = ((event.clientY - drag.startY) / rect.height) * VIEW.height / view.scale;
    if (Math.abs(dx) + Math.abs(dy) > 0.004) setDrag((current) => (current ? { ...current, moved: true } : current));
    setView((current) => ({ ...current, x: drag.originX + dx, y: drag.originY + dy }));
  };
  const onPointerUp = (event) => {
    if (drag?.moved) {
      setTimeout(() => setDrag(null), 0);
    } else {
      setDrag(null);
    }
    svgRef.current?.releasePointerCapture?.(event.pointerId);
  };

  if (!data) return null;

  const categoryCounts = places.reduce((acc, place) => {
    acc[place.category] = (acc[place.category] || 0) + 1;
    return acc;
  }, {});

  const roomsAtPlace = room ? [] : [];
  const routePhoto = destination ? placePhoto(destination, campus) : null;

  return (
    <div className="map-page">
      <PageHeader
        eyebrow="RASTA SAATHI · CAMPUS NAVIGATION"
        title="Find your way around campus"
        description={`Illustrated campus geometry, ${places.length} places, estimated walking routes and photo landmarks. Switch to 3D for an extruded model of the published building footprints. Indoor door-level routes are not verified yet.`}
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
                <button type="button" className={mode === 'plan' ? 'active' : ''} onClick={() => setMode('plan')}>
                  Plan
                </button>
                <button type="button" className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}>
                  3D
                </button>
              </div>
              {mode === 'plan' && (
                <>
                  <button type="button" className="icon-btn" onClick={() => zoom(-0.2)} aria-label="Zoom out" disabled={view.scale <= 1}>
                    <Minus size={16} />
                  </button>
                  <span className="zoom-level">{Math.round(view.scale * 100)}%</span>
                  <button type="button" className="icon-btn" onClick={() => zoom(0.2)} aria-label="Zoom in" disabled={view.scale >= 2.8}>
                    <Plus size={16} />
                  </button>
                  <button type="button" className="icon-btn" onClick={resetView} aria-label="Reset map view" disabled={view.scale === 1 && view.x === 0 && view.y === 0}>
                    <Maximize2 size={15} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className={`map-canvas-wrap ${mode === '3d' ? 'is-3d' : ''}`}>
            {mode === '3d' ? (
              <Campus3D
                campus={campus}
                places={places}
                routePoints={routePoints}
                from={from}
                to={to}
                theme={resolvedTheme}
                onSelect={(id) => selectDestination(id)}
              />
            ) : (
            <svg
              ref={svgRef}
              className="campus-svg"
              viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
              role="img"
              aria-label="Illustrated map of the GNDEC campus with gates, buildings and walking routes"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
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

              <rect x={VIEW.x} y={VIEW.y} width={VIEW.width} height={VIEW.height} fill="#f4f0e3" />
              <rect x={VIEW.x} y={VIEW.y} width={VIEW.width} height={VIEW.height} fill="url(#map-grid)" />

              <g
                transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
                style={{ transformOrigin: 'center', transition: drag ? 'none' : 'transform .22s ease' }}
              >
                {campus?.geometry?.map((shape) => {
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

                {campus?.edges?.map((edge, index) => {
                  const a = campus.junctions.find((node) => node.id === edge.a);
                  const b = campus.junctions.find((node) => node.id === edge.b);
                  if (!a?.pos || !b?.pos) return null;
                  return <line key={index} x1={a.pos[0]} y1={a.pos[1]} x2={b.pos[0]} y2={b.pos[1]} stroke="#b6ae97" strokeWidth="0.005" strokeDasharray="0.012 0.009" opacity="0.6" />;
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

                {campus?.junctions?.map((node) => (
                  <circle key={node.id} cx={node.pos?.[0]} cy={node.pos?.[1]} r="0.005" fill="#8d846d" opacity="0.6" />
                ))}

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
                          if (!drag?.moved) selectDestination(place.id);
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

            <div className="map-legend">
              <span><i style={{ background: '#0f6b4f' }} /> Destination</span>
              <span><i style={{ background: '#c97a45' }} /> Start</span>
              <span><i style={{ background: '#4766c7' }} /> Campus place</span>
              <span className="map-legend-osm">{mode === '3d' ? 'Extruded from published footprints · heights are schematic' : 'Illustrated campus plan · not to scale'}</span>
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
                  <select value={from} onChange={(event) => { setFrom(event.target.value); setRouteParam('from', event.target.value); }}>
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
                  <select value={to} onChange={(event) => { setTo(event.target.value); setRouteParam('to', event.target.value); }}>
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
                    <h3>{destination.name}</h3>
                    <p>{destination.description || 'A campus place from the Compass place list.'}</p>
                    {destination.floor && <small>Floor: {destination.floor}</small>}
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
                    <button type="button" className="btn subtle small" onClick={() => setPanelTab('photos')}>
                      <Camera size={14} /> Landmarks
                    </button>
                  </div>
                  <ol className="route-steps">
                    <li>
                      <span className="step-marker start">A</span>
                      <div>
                        <b>Start at {source?.name || 'your location'}</b>
                        <small>{source?.description || 'Use the main gate as a safe default starting point.'}</small>
                      </div>
                    </li>
                    {route.steps.map((step, index) => (
                      <li key={`${step.placeId || step.name}-${index}`}>
                        <span className="step-marker">{index + 1}</span>
                        <div>
                          <b>{step.name}</b>
                          <small>{step.instruction}</small>
                        </div>
                        {step.photo && <img src={photoPath(step.photo)} alt="" loading="lazy" />}
                      </li>
                    ))}
                    <li>
                      <span className="step-marker end">
                        <Check size={13} />
                      </span>
                      <div>
                        <b>Arrive at {destination?.name}</b>
                        <small>{destination?.description || 'Check campus signs at the building entrance.'}</small>
                      </div>
                    </li>
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
                <Info size={13} /> Walking times assume a fit adult on paved paths. Route lines are graph estimates, not live turn-by-turn navigation.
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
