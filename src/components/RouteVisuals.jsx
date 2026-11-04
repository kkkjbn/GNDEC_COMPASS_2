import React from 'react';
import { SATELLITE_CONTEXT, SATELLITE_DETAIL } from '../lib/map-bounds.js';
import { pointsViewBox } from '../lib/viewport.js';

/**
 * A small, real-satellite crop of a route or a single leg.
 *
 * It reuses the same georeferenced Esri imagery as the main map, so every
 * thumbnail below the map is tied to the actual coordinates of the turn.
 */
export function RouteMap({ points, aspect = 2.1, padding = 0.03, compact = false, className = '', label = 'Satellite view of the walking route' }) {
  const box = pointsViewBox(points, aspect, padding);
  if (!box) return null;
  const valid = (points || []).filter((point) => Array.isArray(point));
  const start = valid[0];
  const end = valid[valid.length - 1];
  const pin = compact ? 0.0052 : 0.0105;
  const halo = compact ? 4 : 6;
  const line = compact ? 2.2 : 3.2;
  const path = valid.map((point) => point.join(',')).join(' ');
  return (
    <svg
      className={`route-map ${compact ? 'is-compact' : ''} ${className}`.trim()}
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label}
    >
      <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="#26352a" />
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
      {valid.length > 1 && (
        <>
          <polyline
            points={path}
            fill="none"
            stroke="rgba(255,255,255,0.94)"
            strokeWidth={halo}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={path}
            fill="none"
            stroke={compact ? '#26b57f' : '#0f6b4f'}
            strokeWidth={line}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
      {start && <circle cx={start[0]} cy={start[1]} r={pin} fill="#c97a45" stroke="#fff" strokeWidth={compact ? 0.9 : 1.4} vectorEffect="non-scaling-stroke" />}
      {valid.length > 1 && <circle cx={end[0]} cy={end[1]} r={pin} fill="#0f6b4f" stroke="#fff" strokeWidth={compact ? 0.9 : 1.4} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

export function RoutePreview({ points, from, to, metres, minutes, onOpen }) {
  if (!points || points.length < 2) return null;
  return (
    <div className="route-preview">
      <button
        type="button"
        className="route-preview-map"
        onClick={onOpen}
        aria-label={`Open this route in the 3D map: ${Math.round(metres)} m · ${minutes} min from ${from?.name || 'the start'} to ${to?.name || 'the destination'}`}
      >
        <RouteMap points={points} label={`Satellite route from ${from?.name || 'the start'} to ${to?.name || 'the destination'}`} />
        <span className="route-preview-badge">{Math.round(metres)} m · {minutes} min</span>
      </button>
      <div className="route-preview-foot">
        <span><i className="route-dot start" />{from?.name || 'Start'}</span>
        <span><i className="route-dot end" />{to?.name || 'Destination'}</span>
      </div>
    </div>
  );
}
