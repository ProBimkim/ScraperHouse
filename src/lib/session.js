// Session token signing/verification.
// ponytail: HMAC-SHA256 via WebCrypto so it works on both Node and Edge runtimes.
// Session secret falls back to APP_PASSWORD so no new env var is required;
// rotating APP_PASSWORD invalidates all sessions (desirable).

const encoder = new TextEncoder();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

function getSecret() {
  const secret = process.env.SESSION_SECRET || process.env.APP_PASSWORD;
  if (!secret) {
    throw new Error('SESSION_SECRET or APP_PASSWORD must be set');
  }
  return secret;
}

async function getKey() {
  const raw = encoder.encode(getSecret());
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function signSession(ttlMs = SESSION_TTL_MS) {
  const expiresAt = Date.now() + ttlMs;
  // Random nonce: without it two logins in the same millisecond produce an
  // identical token, which makes session tokens predictable/replayable.
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${expiresAt}.${nonce}`;
  const key = await getKey();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySession(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expiresAtRaw, nonce, signature] = parts;
  if (!expiresAtRaw || !nonce || !signature) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  try {
    const key = await getKey();
    return await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(signature),
      encoder.encode(`${expiresAtRaw}.${nonce}`)
    );
  } catch {
    return false;
  }
}

export { SESSION_TTL_MS };

// Constant-time string comparison for secrets (avoids leaking content via timing)
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}
