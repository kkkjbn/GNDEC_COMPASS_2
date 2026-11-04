/**
 * Satellite imagery extents in the campus coordinate space.
 *
 * Campus coordinates are 0..1 over the bounds in campus.json:
 *   lon 75.8572–75.8658, lat 30.8642–30.8548 (y grows south).
 *
 * The detail export covers exactly those bounds. The context export is a wider
 * low-resolution frame, fetched from the same Esri service, so the 3D scene and
 * the 2D satellite view have real ground under the surrounding streets instead
 * of a flat colour. These numbers are derived from:
 *   context lon 75.85125–75.87175, lat 30.8652–30.8538
 * and are kept here so the renderer and the SVG viewBox cannot drift apart.
 */
export const SATELLITE_DETAIL = {
  src: '/img/map/campus-satellite.jpg',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

export const SATELLITE_CONTEXT = {
  src: '/img/map/campus-context.jpg',
  x: -0.69186,
  y: -0.10638,
  width: 2.38372,
  height: 1.21277,
};

export const SATELLITE_VIEW = {
  x: SATELLITE_CONTEXT.x,
  y: SATELLITE_CONTEXT.y,
  width: SATELLITE_CONTEXT.width,
  height: SATELLITE_CONTEXT.height,
};
