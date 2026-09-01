// POST the password -> if it matches DATA_PASSWORD, set a signed, HttpOnly
// session cookie and redirect into the requested general research area. The password lives only in an
// env var (never shipped to the client); the cookie is an HMAC token, not the
// password. Wrong guesses are throttled. Runs at the edge.
export const config = { runtime: 'edge' };

const enc = new TextEncoder();
const TTL = 24 * 3600; // session lifetime, seconds (24h)

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg))));
}
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/newsletter.html';
  if (value === '/newsletter.html' || value.startsWith('/newsletter/')) return value;
  if (value === '/quantbench.html') return value;
  if (value === '/data.html') return value;
  if (value.startsWith('/api/quantbench?path=quantbench%2F') || value.startsWith('/api/quantbench?path=quantbench/')) return value;
  return '/newsletter.html';
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const expected = process.env.DATA_PASSWORD || process.env.NEWSLETTER_PASSWORD || '';
  const secret = process.env.SESSION_SECRET || '';
  const origin = new URL(req.url).origin;

  let pw = '', nextPath = '/newsletter.html';
  const ct = req.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) {
      const body = (await req.json()) || {};
      pw = body.password || '';
      nextPath = safeNext(body.next);
    } else {
      const body = await req.formData();
      pw = body.get('password') || '';
      nextPath = safeNext(body.get('next'));
    }
  } catch (_) { pw = ''; }

  const ok = expected && safeEq(pw, expected);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600)); // slow down online brute-force
    const retry = new URL('/gate.html', origin);
    retry.searchParams.set('e', '1');
    retry.searchParams.set('next', nextPath);
    return new Response(null, { status: 303, headers: { Location: retry.toString() } });
  }
  const exp = Date.now() + TTL * 1000;
  const sig = await hmac(secret, String(exp));
  const cookie = `pl_session=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL}`;
  return new Response(null, { status: 303, headers: { Location: origin + nextPath, 'Set-Cookie': cookie } });
}
