// Clears the session cookie and bounces back to the gate — the "lock" link.
// A plain GET works (it's just a link). Removing the cookie means the next
// request to the newsletter has no valid session, so the middleware shows the gate.
export const config = { runtime: 'edge' };

export default function handler(req) {
  const url = new URL(req.url);
  const origin = url.origin;
  const requested = url.searchParams.get('next') || '';
  const nextPath = requested === '/quantbench.html' ? '/quantbench.html' : '/newsletter.html';
  const cookie = 'pl_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  return new Response(null, { status: 303, headers: { Location: origin + nextPath, 'Set-Cookie': cookie } });
}
