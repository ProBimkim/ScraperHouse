// Shared HTTP probe helpers.
//
// The core problem this solves: a catch-all middleware (or a 404 page) answers
// UNAUTHENTICATED requests with a generic 401 JSON body. That response looks
// exactly like a real auth handler rejecting bad credentials, so a scanner
// cannot tell "this endpoint exists and rejects credentials" from "this path
// does not exist and the middleware blanket-rejected it".
//
// Differential probing solves it: probe a random path that certainly does not
// exist and compare the response signature. Identical signature => the
// candidate is just the catch-all, not a real endpoint.

import { randomBytes } from 'node:crypto';

export function responseSignature(status, body) {
  return `${status}:${String(body || '').slice(0, 120)}`;
}

export function randomMissPath(prefix = '/api') {
  return `${prefix}/__probe_miss_${randomBytes(8).toString('hex')}`;
}

/**
 * Probe an unknown path to learn the host's catch-all signature.
 * Returns null when the host could not be probed (network error).
 */
export async function getMissSignature(fetchImpl, baseUrl, prefix = '/api') {
  try {
    const res = await fetchImpl(`${baseUrl}${randomMissPath(prefix)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ probe: 'miss' }),
      redirect: 'manual',
      timeoutMs: 6000,
    });
    const body = await res.text().catch(() => '');
    return responseSignature(res.status, body);
  } catch {
    return null;
  }
}

/**
 * Decide whether a candidate path is a REAL credential handler.
 *
 * A candidate is real when its response differs from the catch-all baseline
 * AND the response is not a plain method/redirect/HTML answer.
 *
 * @param {Function} fetchImpl  resilientFetch-compatible function
 * @param {string}   url        absolute URL of the candidate
 * @param {string|null} missSig signature of the catch-all path (null = unknown)
 * @returns {Promise<{isReal: boolean, status: number, reason: string}>}
 */
export async function classifyAuthEndpoint(fetchImpl, url, missSig) {
  let status = 0;
  let body = '';

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'probe', password: 'probe', keyword: 'probe' }),
      redirect: 'manual',
      timeoutMs: 6000,
    });
    status = res.status;
    body = await res.text().catch(() => '');
  } catch (err) {
    return { isReal: false, status: 0, reason: `probe gagal: ${err.message}` };
  }

  if (status === 405 || status === 501) {
    return { isReal: false, status, reason: 'method ditolak (bukan handler POST)' };
  }
  if (status === 404) {
    return { isReal: false, status, reason: 'route tidak ada' };
  }
  if ([301, 302, 303, 307, 308].includes(status)) {
    return { isReal: false, status, reason: 'redirect, bukan handler' };
  }
  if (/<html|<!doctype/i.test(body)) {
    return { isReal: false, status, reason: 'respons HTML, bukan API' };
  }
  if (missSig && responseSignature(status, body) === missSig) {
    return { isReal: false, status, reason: 'respons identik dengan path acak (catch-all)' };
  }

  return { isReal: true, status, reason: `handler terverifikasi (HTTP ${status})` };
}
