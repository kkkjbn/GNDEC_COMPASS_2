/**
 * Small, pure helpers for the SVG map's pan/zoom camera.
 *
 * The map is drawn inside a fixed viewBox. Zooming is a scale around the
 * centre of that frame plus a translation, so the same maths works for the
 * illustrated plan and the satellite frame.
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const frameCentre = (frame) => ({
  x: frame.x + frame.width / 2,
  y: frame.y + frame.height / 2,
});

/**
 * Keep the zoomed frame covering the viewport. At 1x there is nothing to pan;
 * above 1x the frame may move by half of the extra width/height on each side.
 */
export function clampView(view, frame, minScale = MIN_SCALE, maxScale = MAX_SCALE) {
  const scale = clamp(Number(view.scale) || minScale, minScale, maxScale);
  const limitX = ((scale - 1) * frame.width) / 2;
  const limitY = ((scale - 1) * frame.height) / 2;
  return {
    scale,
    x: clamp(Number(view.x) || 0, -limitX, limitX),
    y: clamp(Number(view.y) || 0, -limitY, limitY),
  };
}

/**
 * Change the zoom while keeping `point` (in viewBox coordinates) under the
 * cursor or pinch midpoint.
 */
export function zoomView(view, nextScale, point, frame, minScale = MIN_SCALE, maxScale = MAX_SCALE) {
  const targetScale = clamp(Number(nextScale) || view.scale, minScale, maxScale);
  const centre = frameCentre(frame);
  const x = view.x + (point.x - centre.x) * (view.scale - targetScale);
  const y = view.y + (point.y - centre.y) * (view.scale - targetScale);
  return clampView({ scale: targetScale, x, y }, frame, minScale, maxScale);
}

/** Convert an SVG viewport point to its underlying map coordinate. */
export function mapPointAtScreen(view, screenPoint, frame) {
  const centre = frameCentre(frame);
  const scale = Number(view.scale) || 1;
  return {
    x: centre.x + (screenPoint.x - centre.x - view.x) / scale,
    y: centre.y + (screenPoint.y - centre.y - view.y) / scale,
  };
}

/** Zoom toward a viewport point while keeping its ground point fixed. */
export function zoomViewAtScreen(view, nextScale, screenPoint, frame, minScale = MIN_SCALE, maxScale = MAX_SCALE) {
  return zoomView(view, nextScale, mapPointAtScreen(view, screenPoint, frame), frame, minScale, maxScale);
}

export function panView(view, dx, dy, frame, minScale = MIN_SCALE, maxScale = MAX_SCALE) {
  return clampView({ scale: view.scale, x: view.x + dx, y: view.y + dy }, frame, minScale, maxScale);
}

export function viewTransform(view, frame) {
  const centre = frameCentre(frame);
  return `translate(${centre.x + view.x} ${centre.y + view.y}) scale(${view.scale}) translate(${-centre.x} ${-centre.y})`;
}

/**
 * Exponential interpolation used by the map's requestAnimationFrame camera.
 * `alpha` is 0..1 for this frame.
 */
export function blendView(current, target, alpha) {
  const t = clamp(alpha, 0, 1);
  return {
    scale: current.scale + (target.scale - current.scale) * t,
    x: current.x + (target.x - current.x) * t,
    y: current.y + (target.y - current.y) * t,
  };
}

export const viewIsClose = (current, target, epsilon = 0.0008) =>
  Math.abs(current.scale - target.scale) < epsilon &&
  Math.abs(current.x - target.x) < epsilon &&
  Math.abs(current.y - target.y) < epsilon;

/**
 * Build a padded, aspect-correct viewBox around a route or a single step.
 * Returns null when the points cannot be measured.
 */
export function pointsViewBox(points, aspect = 2.1, padding = 0.035) {
  const valid = (points || []).filter(
    (point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]),
  );
  if (!valid.length) return null;
  const xs = valid.map((point) => point[0]);
  const ys = valid.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let width = maxX - minX + padding * 2;
  let height = maxY - minY + padding * 2;
  if (!(width > 0) || !(height > 0)) return null;
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}
