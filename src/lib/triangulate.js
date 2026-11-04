/** Triangulate a simple 2D polygon into vertex-index triangles (ear clipping). */
export function triangulatePolygon(points) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const vertices = points.map((point) => [Number(point?.[0]), Number(point?.[1])]);
  if (vertices.some((point) => !point.every(Number.isFinite))) return [];
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) vertices.pop();
  if (vertices.length < 3) return [];

  const area = vertices.reduce((sum, point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
  if (Math.abs(area) < 1e-12) return [];

  const winding = Math.sign(area);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const contains = (point, a, b, c) => {
    const epsilon = 1e-10;
    return (
      winding * cross(a, b, point) >= -epsilon &&
      winding * cross(b, c, point) >= -epsilon &&
      winding * cross(c, a, point) >= -epsilon
    );
  };

  const remaining = vertices.map((_, index) => index);
  const triangles = [];
  let guard = vertices.length * vertices.length;
  while (remaining.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let cursor = 0; cursor < remaining.length; cursor += 1) {
      const previous = remaining[(cursor + remaining.length - 1) % remaining.length];
      const current = remaining[cursor];
      const next = remaining[(cursor + 1) % remaining.length];
      const a = vertices[previous];
      const b = vertices[current];
      const c = vertices[next];
      if (winding * cross(a, b, c) <= 1e-12) continue;

      const hasVertexInside = remaining.some((candidate) => {
        if (candidate === previous || candidate === current || candidate === next) return false;
        return contains(vertices[candidate], a, b, c);
      });
      if (hasVertexInside) continue;

      triangles.push([previous, current, next]);
      remaining.splice(cursor, 1);
      clipped = true;
      break;
    }
    if (!clipped) return [];
  }

  if (remaining.length === 3) triangles.push(remaining);
  return triangles;
}
