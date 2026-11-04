/**
 * Orbit-camera maths shared by the 3D map renderer and its wheel zoom.
 *
 * The campus model is drawn with a simple perspective camera. These helpers
 * mirror the projection used by Campus3D so a cursor-anchored zoom can be
 * verified without a browser: the ground point under the cursor must stay at
 * the same screen pixel after the camera distance changes.
 */

const D2R = Math.PI / 180;

export const MIN_DIST = 120;
export const MAX_DIST = 5200;
export const ZOOM_BASE_DIST = 1460;

export const zoomLabelFor = (dist) => Math.round((ZOOM_BASE_DIST / dist) * 100);

export function orbitEye(cam) {
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  return [
    cam.tx + cam.dist * cp * Math.sin(cam.yaw),
    cam.dist * sp,
    cam.tz - cam.dist * cp * Math.cos(cam.yaw),
  ];
}

export function orbitBasis(cam) {
  const eye = orbitEye(cam);
  const length = Math.hypot(cam.tx - eye[0], eye[1], cam.tz - eye[2]) || 1;
  const forward = [
    (cam.tx - eye[0]) / length,
    -eye[1] / length,
    (cam.tz - eye[2]) / length,
  ];
  const cross = [-forward[2], 0, forward[0]];
  const crossLength = Math.hypot(cross[0], cross[2]) || 1;
  const right = [cross[0] / crossLength, 0, cross[2] / crossLength];
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  return { eye, forward, right, up };
}

export function orbitFocal(cam, height) {
  return (0.5 * height) / Math.tan((cam.fov * D2R) / 2);
}

export function orbitProject(cam, width, height, x, y, z) {
  const { eye, forward, right, up } = orbitBasis(cam);
  const rx = x - eye[0];
  const ry = y - eye[1];
  const rz = z - eye[2];
  const zc = rx * forward[0] + ry * forward[1] + rz * forward[2];
  if (zc < 0.8) return null;
  const xc = rx * right[0] + ry * right[1] + rz * right[2];
  const yc = rx * up[0] + ry * up[1] + rz * up[2];
  const focal = orbitFocal(cam, height);
  return [width / 2 + (focal * xc) / zc, height / 2 - (focal * yc) / zc, zc];
}

/**
 * Ground point (world x/z, y = 0) under a screen position inside the canvas.
 * Coordinates are canvas-local, with the origin at the canvas's top-left.
 */
export function screenToGround(cam, width, height, screenX, screenY) {
  if (!width || !height || !(cam.dist > 0)) return null;
  const { eye, forward, right, up } = orbitBasis(cam);
  const focal = orbitFocal(cam, height);
  const u = (screenX - width / 2) / focal;
  const v = -(screenY - height / 2) / focal;
  const dir = [
    forward[0] + right[0] * u + up[0] * v,
    forward[1] + right[1] * u + up[1] * v,
    forward[2] + right[2] * u + up[2] * v,
  ];
  if (Math.abs(dir[1]) < 1e-4) return null;
  const distance = -eye[1] / dir[1];
  if (!(distance > 0) || distance > 16000) return null;
  return [eye[0] + dir[0] * distance, eye[2] + dir[2] * distance];
}

/**
 * Move the camera target so `ground` stays under the same pixel while the
 * orbit radius changes from cam.dist to nextDist. Yaw, pitch and fov are kept.
 */
export function zoomTargetAboutGround(cam, ground, nextDist) {
  const ratio = nextDist / cam.dist;
  return [
    ground[0] + (cam.tx - ground[0]) * ratio,
    ground[1] + (cam.tz - ground[1]) * ratio,
  ];
}
