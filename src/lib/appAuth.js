import { safeEqual } from '@/lib/session';

// Master password check for destructive operations.
// ponytail: password is read from the `x-app-password` header or a JSON body
// field - never from the query string, which leaks into access logs,
// browser history and Referer headers.
export function extractAppPassword(req, body) {
  const headerPassword = req.headers.get('x-app-password');
  if (headerPassword) return headerPassword;
  if (body && typeof body.password === 'string') return body.password;
  return null;
}

export function isValidAppPassword(candidate) {
  const expected = process.env.APP_PASSWORD;
  if (!expected || !candidate) return false;
  return safeEqual(candidate, expected);
}
