import { get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const enc = new TextEncoder();

function b64url(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message))));
}

function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function cookieVal(header, name) {
  if (!header) return '';
  for (const part of header.split(/;\s*/)) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index) === name) return part.slice(index + 1);
  }
  return '';
}

function requestHeader(req, name) {
  if (req.headers && typeof req.headers.get === 'function') return req.headers.get(name) || '';
  const value = req.headers && req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : (value || '');
}

function requestUrl(req) {
  try {
    return new URL(req.url);
  } catch (_) {
    const host = requestHeader(req, 'x-forwarded-host') || requestHeader(req, 'host') || 'localhost';
    const protocol = requestHeader(req, 'x-forwarded-proto') || 'https';
    return new URL(req.url || '/', `${protocol}://${host}`);
  }
}

async function isAuthenticated(req) {
  const secret = process.env.SESSION_SECRET || '';
  const value = cookieVal(requestHeader(req, 'cookie'), 'pl_session');
  if (!value || !secret) return false;

  const dot = value.lastIndexOf('.');
  if (dot <= 0) return false;
  const expires = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!/^\d+$/.test(expires) || Number(expires) <= Date.now()) return false;

  try {
    return safeEq(signature, await hmac(secret, expires));
  } catch (_) {
    return false;
  }
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(body);
}

function gateRedirect(req, res) {
  const requested = requestUrl(req);
  const gate = new URL('/gate.html', requested.origin);
  gate.searchParams.set('next', requested.pathname + requested.search);
  return send(res, 307, '', { Location: gate.toString(), 'Cache-Control': 'private, no-store' });
}

function validPath(pathname) {
  return typeof pathname === 'string'
    && pathname.startsWith('quantbench/')
    && !pathname.includes('..')
    && !pathname.includes('\\')
    && !pathname.includes('\0');
}

function disposition(pathname, contentType) {
  const filename = pathname.split('/').pop().replace(/["\\]/g, '_');
  const inline = contentType === 'application/pdf'
    || contentType.startsWith('text/')
    || contentType.includes('json');
  return `${inline ? 'inline' : 'attachment'}; filename="${filename}"`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }
  if (!(await isAuthenticated(req))) return gateRedirect(req, res);

  const url = requestUrl(req);
  const pathname = url.searchParams.get('path') || '';
  if (!validPath(pathname)) return send(res, 404, 'Not Found');

  const result = await get(pathname, {
    access: 'private',
    ifNoneMatch: requestHeader(req, 'if-none-match') || undefined,
  });
  if (!result || result.statusCode === 404) return send(res, 404, 'Not Found');
  if (result.statusCode === 304) {
    return send(res, 304, '', {
      ETag: result.blob.etag,
      'Cache-Control': 'private, no-cache',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }

  const contentType = result.blob.contentType || 'application/octet-stream';
  const headers = {
    'Content-Type': contentType,
    'Content-Disposition': disposition(pathname, contentType),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    ETag: result.blob.etag,
  };
  res.statusCode = 200;
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  if (req.method === 'HEAD') return res.end();
  await pipeline(Readable.fromWeb(result.stream), res);
}
