// Self-check for the session signing/verification path (security-critical).
// Run: node scripts/test_session.mjs
import assert from 'node:assert';

process.env.APP_PASSWORD = 'test-master-password';
process.env.SESSION_SECRET = 'test-session-secret';

const { signSession, verifySession, safeEqual, SESSION_TTL_MS } = await import('../src/lib/session.js');

const results = [];
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    results.push(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    results.push(`  FAIL  ${name} -> ${err.message}`);
  }
}

const token = await signSession(60_000);

await check('token bertanda tangan berformat expiry.nonce.signature', () => {
  assert.strictEqual(typeof token, 'string');
  const parts = token.split('.');
  assert.strictEqual(parts.length, 3, 'token harus punya 3 bagian');
  const [expiresAt, nonce, signature] = parts;
  assert.ok(Number.isFinite(Number(expiresAt)), 'expiredAt harus berisi timestamp');
  assert.ok(nonce.length > 10, 'nonce harus ada dan cukup panjang');
  assert.ok(signature.length > 20, 'signature harus memiliki panjang memadai');
});

await check('verifySession menerima token yang valid', async () => {
  assert.strictEqual(await verifySession(token), true);
});

await check('verifySession MENOLAK literal "true" (cookie lama yang bisa dipalsukan)', async () => {
  assert.strictEqual(await verifySession('true'), false);
});

await check('verifySession menolak signature yang dirusak', async () => {
  assert.strictEqual(await verifySession(token.slice(0, -4) + 'AAAA'), false);
});

await check('verifySession menolak token kedaluwarsa', async () => {
  assert.strictEqual(await verifySession(await signSession(-1000)), false);
});

await check('verifySession menolak input null/undefined/kosong/aneh', async () => {
  for (const bad of [null, undefined, '', 'abc', 'a.b', 123]) {
    assert.strictEqual(await verifySession(bad), false, `input ${JSON.stringify(bad)} harus ditolak`);
  }
});

await check('token berbeda tiap panggilan (tidak dapat diprediksi)', async () => {
  const a = await signSession(60_000);
  const b = await signSession(60_000);
  assert.notStrictEqual(a, b, 'token tidak boleh dapat diprediksi');
});

await check('safeEqual membandingkan isi dengan benar', () => {
  assert.strictEqual(safeEqual('abc', 'abc'), true);
  assert.strictEqual(safeEqual('abc', 'abd'), false);
  assert.strictEqual(safeEqual('abc', 'abcd'), false);
  assert.strictEqual(safeEqual(null, 'abc'), false);
});

await check('TTL default 7 hari', () => {
  assert.strictEqual(SESSION_TTL_MS, 7 * 24 * 60 * 60 * 1000);
});

console.log('\nSession security self-check:');
console.log(results.join('\n'));
console.log(failed ? `\nRESULT: ${failed} GAGAL` : '\nRESULT: SEMUA LOLOS');
process.exit(failed ? 1 : 0);
