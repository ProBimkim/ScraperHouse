import assert from 'node:assert';

// Test rate limiter logic
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function checkAttempt(ip, now = Date.now()) {
  const attempt = loginAttempts.get(ip);
  if (attempt && now < attempt.resetAt && attempt.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: attempt ? MAX_ATTEMPTS - attempt.count : MAX_ATTEMPTS };
}

function recordAttempt(ip, now = Date.now()) {
  const attempt = loginAttempts.get(ip);
  if (!attempt || now >= attempt.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    attempt.count += 1;
  }
}

// 1. First 5 attempts should be allowed
const testIp = '192.168.1.100';
for (let i = 1; i <= 5; i++) {
  const check = checkAttempt(testIp);
  assert.strictEqual(check.allowed, true, `Attempt ${i} should be allowed`);
  recordAttempt(testIp);
}

// 2. 6th attempt should be blocked
const checkBlocked = checkAttempt(testIp);
assert.strictEqual(checkBlocked.allowed, false, '6th attempt must be blocked by rate limiter');

// 3. Different IP should still be allowed
assert.strictEqual(checkAttempt('10.0.0.1').allowed, true, 'Different IP should be allowed');

// 4. Test CSRF Origin check logic
function checkCsrf(origin, host, secFetchSite) {
  if (secFetchSite === 'cross-site') return false;
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

assert.strictEqual(checkCsrf('https://evil.com', 'scraperhouse.vercel.app', 'cross-site'), false);
assert.strictEqual(checkCsrf('https://evil.com', 'scraperhouse.vercel.app', 'same-origin'), false);
assert.strictEqual(checkCsrf('https://scraperhouse.vercel.app', 'scraperhouse.vercel.app', 'same-origin'), true);
assert.strictEqual(checkCsrf(null, 'scraperhouse.vercel.app', 'same-origin'), true);

console.log('All security checks passed successfully!');
