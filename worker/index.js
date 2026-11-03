/**
 * GNDEC Compass 2.0 Worker.
 *
 * Static assets are still served from ./dist. This script only adds the tiny
 * shared notice-banner config API so an admin change reaches every visitor,
 * instead of living in one browser's localStorage.
 *
 *   GET    /api/notice-banner   public read
 *   PUT    /api/notice-banner   admin write (x-admin-hash header)
 *   DELETE /api/notice-banner   admin reset (x-admin-hash header)
 *
 * The passcode gate is deliberately modest: the hash of the project passcode
 * is a Worker secret (ADMIN_PASSCODE_HASH) and is compared with the hash the
 * admin studio already computes in the browser. It is not a user account
 * system and must not be treated as protection for private data.
 */

const KV_KEY = 'notice-banner';
const DEFAULT_CONFIG = Object.freeze({
  durationDays: 3,
  hiddenNoticeIds: [],
  hiddenAll: false,
  updatedAt: null,
});

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, x-admin-hash',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      ...CORS_HEADERS,
    },
  });
}

function sanitizeConfig(input = {}) {
  const rawDuration = Number(input.durationDays);
  const durationDays = Number.isFinite(rawDuration)
    ? Math.min(14, Math.max(1, Math.round(rawDuration)))
    : DEFAULT_CONFIG.durationDays;
  const hiddenNoticeIds = Array.isArray(input.hiddenNoticeIds)
    ? [...new Set(input.hiddenNoticeIds.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))].slice(-200)
    : [];
  return {
    durationDays,
    hiddenNoticeIds,
    hiddenAll: Boolean(input.hiddenAll),
    updatedAt: input.updatedAt || null,
  };
}

async function readConfig(env) {
  if (!env.COMPASS_V2_KV) return { ...DEFAULT_CONFIG };
  try {
    const stored = await env.COMPASS_V2_KV.get(KV_KEY, 'json');
    return stored ? sanitizeConfig(stored) : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function safeEqual(left = '', right = '') {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function authorize(request, env) {
  if (!env.ADMIN_PASSCODE_HASH) {
    return json(
      { error: 'Admin writes are not configured on this Worker. Add the ADMIN_PASSCODE_HASH secret first.' },
      503,
    );
  }
  const provided = request.headers.get('x-admin-hash') || '';
  if (!safeEqual(provided, env.ADMIN_PASSCODE_HASH)) {
    return json({ error: 'The admin passcode did not match on the server.' }, 401);
  }
  return null;
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname !== '/api/notice-banner') {
    return json({ error: 'Unknown API route.' }, 404);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === 'GET') {
    return json({ config: await readConfig(env) });
  }

  if (request.method === 'PUT' || request.method === 'DELETE') {
    const denied = authorize(request, env);
    if (denied) return denied;

    if (!env.COMPASS_V2_KV) {
      return json({ error: 'The COMPASS_V2_KV binding is missing from this Worker.' }, 503);
    }

    if (request.method === 'DELETE') {
      await env.COMPASS_V2_KV.delete(KV_KEY);
      return json({ config: { ...DEFAULT_CONFIG }, reset: true });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Send a JSON body with durationDays, hiddenNoticeIds and hiddenAll.' }, 400);
    }

    const next = sanitizeConfig({ ...body, updatedAt: new Date().toISOString() });
    await env.COMPASS_V2_KV.put(KV_KEY, JSON.stringify(next));
    return json({ config: next });
  }

  return json({ error: 'Method not allowed.' }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/notice-banner') {
      return handleApi(request, env);
    }
    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'Unknown API route.' }, 404);
    }
    if (!env.ASSETS) {
      return new Response('Static asset binding is missing.', { status: 500 });
    }
    return env.ASSETS.fetch(request);
  },
};
