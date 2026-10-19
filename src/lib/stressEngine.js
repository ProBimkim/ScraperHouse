import http from 'http';
import https from 'https';
import nodeFetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
export { generateChaosMeshSuite } from './chaosMeshGenerator.js';

// --- IP Rotating Proxy & Stealth Configuration ---
const PROXY_LIST_ENV = process.env.PROXY_LIST || process.env.PROXY_URL || '';
const PROXIES = PROXY_LIST_ENV.split(',').map(p => p.trim()).filter(p => p.length > 0);

export function getStressProxy() {
  if (PROXIES.length === 0) return null;
  return PROXIES[Math.floor(Math.random() * PROXIES.length)];
}

const STRESS_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
];

export function getStressUserAgent() {
  return STRESS_USER_AGENTS[Math.floor(Math.random() * STRESS_USER_AGENTS.length)];
}

// High-performance pooled keep-alive agents without socket bottlenecks (no upper limit on concurrency)
const directHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: Infinity,
  maxFreeSockets: 512,
  timeout: 60000,
});

const directHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: Infinity,
  maxFreeSockets: 512,
  timeout: 60000,
  rejectUnauthorized: false, // Allow testing staging/self-signed certs
});

/**
 * Calculates quantile percentile from a sorted array of numbers.
 */
function calculateQuantile(sortedArr, q) {
  if (sortedArr.length === 0) return 0;
  const pos = (sortedArr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedArr[base + 1] !== undefined) {
    return Math.round(sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]));
  }
  return Math.round(sortedArr[base]);
}

/**
 * Evaluates server stability, breaking point, and developer recommendations.
 */
function synthesizeStressAnalysis({
  totalCompleted,
  successfulCount,
  failedCount,
  avgLatency,
  p50Latency,
  p95Latency,
  p99Latency,
  maxRps,
  avgRps,
  statusCodes,
  breakingPointDetected,
  breakingPointRequestIndex,
  concurrency,
  durationSec
}) {
  const errorRatePct = totalCompleted > 0 ? (failedCount / totalCompleted) * 100 : 0;
  const has5xx = Object.keys(statusCodes).some(code => code.startsWith('5'));
  const has429 = Boolean(statusCodes['429']);
  const hasTimeouts = Boolean(statusCodes['ETIMEDOUT'] || statusCodes['TIMEOUT']);
  const hasConnReset = Boolean(statusCodes['ECONNRESET'] || statusCodes['ECONNREFUSED']);

  let grade = 'A';
  let statusSummary = 'Rock Solid & High Stability';

  if (errorRatePct > 25 || (has5xx && errorRatePct > 15)) {
    grade = 'F';
    statusSummary = 'Server Breakdown / Severe Overload (Breaking Point Reached)';
  } else if (errorRatePct > 10 || hasConnReset) {
    grade = 'D';
    statusSummary = 'Critical Saturation (Connections Dropped / Heavy Errors)';
  } else if (errorRatePct > 3 || avgLatency > 2000 || p95Latency > 3500) {
    grade = 'C';
    statusSummary = 'Degraded Performance (Significant Latency Spikes)';
  } else if (errorRatePct > 0.5 || avgLatency > 800 || p95Latency > 1500) {
    grade = 'B';
    statusSummary = 'Acceptable / Moderate Load with Minor Jitter';
  } else if (avgLatency < 300 && p95Latency < 600) {
    grade = 'A+';
    statusSummary = 'Flawless Throughput & Ultra-Fast Response';
  }

  // Estimate maximum sustainable Concurrent Users (CCU) & RPS
  const safeFactor = grade === 'A+' || grade === 'A' ? 0.9 : grade === 'B' ? 0.75 : 0.4;
  const estimatedMaxSafeRps = Math.max(Math.round(maxRps * safeFactor), 1);
  const estimatedMaxSafeCcu = Math.max(Math.round(concurrency * safeFactor), 1);

  // Identify specific architectural bottlenecks
  const detectedBottlenecks = [];
  if (has429) {
    detectedBottlenecks.push(`HTTP 429 (Rate Limit / WAF Throttling): ${statusCodes['429']} requests were throttled by security guards or reverse proxy.`);
  }
  if (statusCodes['502'] || statusCodes['504']) {
    detectedBottlenecks.push(`Gateway / Upstream Timeout (502/504): Reverse proxy (Nginx/Cloudflare) timed out waiting for backend worker process response.`);
  }
  if (statusCodes['500'] || statusCodes['503']) {
    detectedBottlenecks.push(`Internal Server Error / Service Unavailable (500/503): Backend application or database connection pool reached maximum capacity.`);
  }
  if (hasTimeouts) {
    detectedBottlenecks.push(`Socket Timeouts: Server network backlog queue (TCP listen backlog) was full, causing dropped connection handshakes.`);
  }
  if (p99Latency > avgLatency * 3 && avgLatency > 200) {
    detectedBottlenecks.push(`High Latency Tail (p99: ${p99Latency}ms vs avg: ${avgLatency}ms): Significant resource contention during peak concurrency bursts.`);
  }
  if (detectedBottlenecks.length === 0) {
    detectedBottlenecks.push('No critical infrastructure bottlenecks detected under tested traffic volume.');
  }

  // Developer Actionable Checklist
  const developerChecklist = [
    `Set baseline capacity: Server safely sustained ~${estimatedMaxSafeRps} req/sec (~${estimatedMaxSafeCcu} concurrent virtual visitors) without service disruption.`,
  ];

  if (has429) {
    developerChecklist.push('Tune Web Application Firewall (WAF) or Nginx `limit_req_zone` burst allowance to prevent legitimate user surges from being blocked.');
  }
  if (has5xx || hasTimeouts) {
    developerChecklist.push('Scale backend worker pools (e.g. increase PHP-FPM `pm.max_children`, Node.js cluster processes, or Gunicorn workers).');
    developerChecklist.push('Inspect database connection pool limit (e.g. MongoDB maxPoolSize, PostgreSQL max_connections) to ensure queries do not queue under load.');
    developerChecklist.push('Configure HTTP Reverse Proxy timeouts (e.g., `proxy_read_timeout 60s` in Nginx).');
  }
  if (avgLatency > 500) {
    developerChecklist.push('Implement HTTP Edge Caching (Cloudflare, Varnish, or Redis cache) for static assets and repetitive GET queries to reduce compute pressure.');
  }
  developerChecklist.push('Set up automated monitoring & alerts on server CPU utilization (>80%) and memory threshold to trigger auto-scaling before peak events.');

  return {
    grade,
    statusSummary,
    errorRatePct: Number(errorRatePct.toFixed(2)),
    estimatedMaxSafeRps,
    estimatedMaxSafeCcu,
    breakingPointDetected: breakingPointDetected || (errorRatePct > 5),
    breakingPointDetails: breakingPointDetected 
      ? `Server began degrading around request #${breakingPointRequestIndex || Math.round(totalCompleted * 0.6)} under ${concurrency} concurrent workers.` 
      : (errorRatePct > 5 ? `Error rate reached ${errorRatePct.toFixed(1)}% during traffic test.` : 'No server breaking point reached within the configured traffic volume.'),
    detectedBottlenecks,
    developerChecklist,
  };
}

/**
 * Executes high-volume server performance & stress testing with real-time streaming telemetry.
 */
export async function runServerStressTest({
  targetUrl,
  method = 'GET',
  totalRequests = 100, // No artificial maximum limit!
  concurrency = 10,
  intervalMs = 0, // Delay between requests in worker (0 = maximum stress / blast, >0 = paced user simulation)
  timeoutMs = 10000,
  useRotatingProxy = false,
  customHeaders = {},
  body = null,
  abortSignal = null,
  onProgress = () => {},
}) {
  const startTime = performance.now();
  const parsedUrl = new URL(targetUrl);
  const isHttps = parsedUrl.protocol === 'https:';

  // Sanitize numeric inputs without upper limit on totalRequests or concurrency (user-controlled CCU!)
  const plannedTotal = Math.max(parseInt(totalRequests, 10) || 100, 1);
  const activeConcurrency = Math.max(parseInt(concurrency, 10) || 10, 1);
  const pacedDelay = Math.max(parseInt(intervalMs, 10) || 0, 0);
  const reqTimeout = Math.max(parseInt(timeoutMs, 10) || 10000, 1000);

  let dispatchedCount = 0;
  let completedCount = 0;
  let successfulCount = 0;
  let failedCount = 0;

  const statusCodes = {};
  const errorSamples = [];

  // Latency metrics tracking
  let latencySum = 0;
  let minLatency = Infinity;
  let maxLatency = 0;

  // Reservoir sampling up to 5,000 latencies for high-precision percentiles without memory bloat
  const RESERVOIR_CAP = 5000;
  const latencyReservoir = [];

  // Real-time rolling metrics window (last 2 seconds)
  const rollingWindow = [];
  let maxObservedRps = 0;
  let breakingPointDetected = false;
  let breakingPointRequestIndex = null;
  let baselineLatency = null;

  // Timeline series (sampled roughly every 1 second)
  const timeline = [];
  let lastTimelineSample = performance.now();

  // Progress emitter throttler (every 180ms)
  let lastProgressEmit = performance.now();

  function recordRequestResult(durationMs, statusCode, errMessage = null) {
    completedCount++;
    const codeKey = statusCode ? String(statusCode) : (errMessage || 'ERROR');
    statusCodes[codeKey] = (statusCodes[codeKey] || 0) + 1;

    if (statusCode >= 200 && statusCode < 400) {
      successfulCount++;
    } else {
      failedCount++;
      if (errorSamples.length < 15) {
        errorSamples.push({
          time: new Date().toLocaleTimeString(),
          code: codeKey,
          message: errMessage || `HTTP ${statusCode}`,
        });
      }
    }

    // Latency
    latencySum += durationMs;
    if (durationMs < minLatency) minLatency = durationMs;
    if (durationMs > maxLatency) maxLatency = durationMs;

    // Reservoir sample insertion
    if (latencyReservoir.length < RESERVOIR_CAP) {
      latencyReservoir.push(durationMs);
    } else {
      const replaceIdx = Math.floor(Math.random() * completedCount);
      if (replaceIdx < RESERVOIR_CAP) {
        latencyReservoir[replaceIdx] = durationMs;
      }
    }

    // Baseline calculation after first 25 requests
    if (baselineLatency === null && completedCount >= 25 && successfulCount > 15) {
      baselineLatency = latencySum / completedCount;
    }

    // Detect breaking point (e.g. latency triples or consecutive 5xx/429/timeouts)
    if (!breakingPointDetected && baselineLatency !== null && completedCount > 30) {
      if (durationMs > baselineLatency * 3.5 || (statusCode >= 500) || (statusCode === 429)) {
        breakingPointDetected = true;
        breakingPointRequestIndex = completedCount;
      }
    }

    // Rolling window for live RPS
    const now = performance.now();
    rollingWindow.push({ timestamp: now, durationMs, success: statusCode >= 200 && statusCode < 400 });

    // Clean old entries (> 2000ms ago)
    while (rollingWindow.length > 0 && rollingWindow[0].timestamp < now - 2000) {
      rollingWindow.shift();
    }

    // Live RPS calculation
    const windowElapsedSec = rollingWindow.length > 1 ? (now - rollingWindow[0].timestamp) / 1000 : 1;
    const currentLiveRps = windowElapsedSec > 0 ? Math.round(rollingWindow.length / windowElapsedSec) : 0;
    if (currentLiveRps > maxObservedRps) {
      maxObservedRps = currentLiveRps;
    }

    // Timeline recording every 1000ms
    if (now - lastTimelineSample >= 1000) {
      const elapsedOverall = Math.round((now - startTime) / 1000);
      const rollingAvgLat = rollingWindow.length > 0
        ? Math.round(rollingWindow.reduce((acc, r) => acc + r.durationMs, 0) / rollingWindow.length)
        : Math.round(durationMs);

      const recentErrors = rollingWindow.filter(r => !r.success).length;
      const recentErrorRate = rollingWindow.length > 0 ? Math.round((recentErrors / rollingWindow.length) * 100) : 0;

      timeline.push({
        second: elapsedOverall,
        rps: currentLiveRps,
        avgLatency: rollingAvgLat,
        errorRate: recentErrorRate,
        completed: completedCount,
      });
      lastTimelineSample = now;
    }

    // Throttle progress emissions
    if (now - lastProgressEmit >= 180 || completedCount === plannedTotal) {
      const avgSoFar = Math.round(latencySum / completedCount);
      const errorRateSoFar = Number(((failedCount / completedCount) * 100).toFixed(1));

      onProgress({
        type: 'tick',
        completed: completedCount,
        total: plannedTotal,
        percent: Math.min(Math.round((completedCount / plannedTotal) * 100), 100),
        liveRps: currentLiveRps,
        avgLatency: avgSoFar,
        minLatency: minLatency === Infinity ? 0 : Math.round(minLatency),
        maxLatency: Math.round(maxLatency),
        successful: successfulCount,
        failed: failedCount,
        errorRate: errorRateSoFar,
        statusCodes: { ...statusCodes },
        activeConcurrency,
        breakingPointDetected,
        elapsedSec: Number(((now - startTime) / 1000).toFixed(1)),
      });
      lastProgressEmit = now;
    }
  }

  // Single HTTP Request Execution
  async function executeSingleRequest() {
    const reqStart = performance.now();
    const activeProxy = useRotatingProxy ? getStressProxy() : null;
    const userAgent = getStressUserAgent();

    const headers = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      ...customHeaders,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), reqTimeout);

    // Chain parent abort signal if provided
    let abortListener = null;
    if (abortSignal) {
      abortListener = () => controller.abort();
      abortSignal.addEventListener('abort', abortListener);
    }

    try {
      let res;
      if (activeProxy) {
        const proxyAgent = new HttpsProxyAgent(activeProxy);
        res = await nodeFetch(targetUrl, {
          method,
          headers,
          body: (method === 'POST' || method === 'PUT') ? body : undefined,
          agent: proxyAgent,
          signal: controller.signal,
        });
      } else {
        // Direct high-throughput keep-alive agent
        const agent = isHttps ? directHttpsAgent : directHttpAgent;
        res = await nodeFetch(targetUrl, {
          method,
          headers,
          body: (method === 'POST' || method === 'PUT') ? body : undefined,
          agent,
          signal: controller.signal,
        });
      }

      clearTimeout(timer);
      const reqDuration = performance.now() - reqStart;
      recordRequestResult(reqDuration, res.status);
    } catch (err) {
      clearTimeout(timer);
      const reqDuration = performance.now() - reqStart;
      let errCode = 'ERR';
      if (err.name === 'AbortError') {
        errCode = (abortSignal && abortSignal.aborted) ? 'STOPPED' : 'ETIMEDOUT';
      } else if (err.code) {
        errCode = err.code;
      }
      recordRequestResult(reqDuration, null, errCode);
    } finally {
      if (abortSignal && abortListener) {
        abortSignal.removeEventListener('abort', abortListener);
      }
    }
  }

  // Worker loop pulling from shared dispatchedCount
  async function workerLoop() {
    while (dispatchedCount < plannedTotal) {
      if (abortSignal && abortSignal.aborted) {
        break;
      }
      dispatchedCount++;
      await executeSingleRequest();

      // Paced simulation delay if requested
      if (pacedDelay > 0 && dispatchedCount < plannedTotal && !(abortSignal && abortSignal.aborted)) {
        await new Promise(resolve => setTimeout(resolve, pacedDelay));
      }
    }
  }

  // Spawn concurrency worker pool (up to plannedTotal if concurrency > plannedTotal)
  const workers = [];
  const workerCount = Math.min(activeConcurrency, plannedTotal);
  for (let i = 0; i < workerCount; i++) {
    workers.push(workerLoop());
  }

  await Promise.all(workers);

  const totalDurationMs = performance.now() - startTime;
  const durationSec = Number((totalDurationMs / 1000).toFixed(2));

  // Compute final percentiles
  latencyReservoir.sort((a, b) => a - b);
  const p50Latency = calculateQuantile(latencyReservoir, 0.50);
  const p90Latency = calculateQuantile(latencyReservoir, 0.90);
  const p95Latency = calculateQuantile(latencyReservoir, 0.95);
  const p99Latency = calculateQuantile(latencyReservoir, 0.99);
  const finalAvgLatency = completedCount > 0 ? Math.round(latencySum / completedCount) : 0;
  const overallAvgRps = durationSec > 0 ? Number((completedCount / durationSec).toFixed(1)) : 0;

  // Synthesize developer diagnostic & breaking point
  const analysis = synthesizeStressAnalysis({
    totalCompleted: completedCount,
    successfulCount,
    failedCount,
    avgLatency: finalAvgLatency,
    p50Latency,
    p95Latency,
    p99Latency,
    maxRps: maxObservedRps || overallAvgRps,
    avgRps: overallAvgRps,
    statusCodes,
    breakingPointDetected,
    breakingPointRequestIndex,
    concurrency: activeConcurrency,
    durationSec,
  });

  return {
    targetUrl,
    method,
    plannedTotal,
    completedTotal: completedCount,
    successfulCount,
    failedCount,
    durationSec,
    avgRps: overallAvgRps,
    maxRps: maxObservedRps || overallAvgRps,
    latency: {
      min: minLatency === Infinity ? 0 : Math.round(minLatency),
      max: Math.round(maxLatency),
      avg: finalAvgLatency,
      p50: p50Latency,
      p90: p90Latency,
      p95: p95Latency,
      p99: p99Latency,
    },
    statusCodes,
    errorSamples,
    timeline,
    analysis,
    wasAborted: Boolean(abortSignal && abortSignal.aborted),
  };
}


/**
 * Cooperative Integration: Strix Pentest + Stress Engine
 * Tests the main web target AND discovered vulnerable endpoints under load
 * to calculate real-world blast radius, latency inflation, and Asymmetric DoS vulnerability risk.
 */
export async function runVulnerabilityStressCooperation({
  targetUrl,
  vulnerabilities = [],
  recon = {},
  options = {},
  onProgress = () => {},
}) {
  const requestsPerTarget = Number(options.requestsPerTarget) || 40;
  const concurrency = Number(options.concurrency) || 8;
  const timeoutMs = Number(options.timeoutMs) || 7000;

  // 1. Identify candidate vulnerable endpoints
  const endpointsToTest = [];
  const baseUrl = (targetUrl || '').replace(/\/+$/, '');

  // Extract endpoints from vulnerabilities
  for (const v of vulnerabilities) {
    if (v.endpoint && typeof v.endpoint === 'string' && v.endpoint !== '/' && v.endpoint !== baseUrl) {
      let fullUrl = v.endpoint;
      if (v.endpoint.startsWith('http://') || v.endpoint.startsWith('https://')) {
        fullUrl = v.endpoint;
      } else {
        const cleanPath = v.endpoint.startsWith('/') ? v.endpoint : `/${v.endpoint}`;
        fullUrl = `${baseUrl}${cleanPath}`;
      }

      if (!endpointsToTest.some(e => e.url === fullUrl)) {
        endpointsToTest.push({
          url: fullUrl,
          path: v.endpoint,
          vulnerabilityId: v.id || 'VULN',
          title: v.title || 'Discovered Vulnerability',
          severity: v.severity || 'high',
          method: v.method || 'GET',
          type: 'vulnerability-endpoint'
        });
      }
    }
    if (endpointsToTest.length >= 3) break;
  }

  // Also check discovered admin/exposed endpoints from recon
  if (endpointsToTest.length < 3 && recon.adminEndpoints?.length > 0) {
    for (const adm of recon.adminEndpoints) {
      const fullUrl = `${baseUrl}${adm.path.startsWith('/') ? adm.path : `/${adm.path}`}`;
      if (!endpointsToTest.some(e => e.url === fullUrl)) {
        endpointsToTest.push({
          url: fullUrl,
          path: adm.path,
          vulnerabilityId: 'RECON-ADMIN-EXPOSURE',
          title: `Exposed Administrative Interface (${adm.path})`,
          severity: adm.accessible ? 'critical' : 'medium',
          method: 'GET',
          type: 'recon-exposed-interface'
        });
      }
      if (endpointsToTest.length >= 3) break;
    }
  }

  // Also check login endpoints
  if (endpointsToTest.length < 3 && recon.loginEndpoints?.length > 0) {
    for (const l of recon.loginEndpoints) {
      const fullUrl = `${baseUrl}${l.path.startsWith('/') ? l.path : `/${l.path}`}`;
      if (!endpointsToTest.some(e => e.url === fullUrl)) {
        endpointsToTest.push({
          url: fullUrl,
          path: l.path,
          vulnerabilityId: 'RECON-LOGIN-AUTH',
          title: `Authentication Entrypoint (${l.path})`,
          severity: 'medium',
          method: 'POST',
          type: 'recon-auth-entrypoint'
        });
      }
      if (endpointsToTest.length >= 3) break;
    }
  }

  onProgress({
    phase: 'stress-cooperation',
    message: `Menjalankan Stress Impact Test: Menguji web utama (${baseUrl}) dan ${endpointsToTest.length} celah teridentifikasi...`,
    progress: 75
  });

  // 2. Run Baseline Stress Test on Main Web Target
  let baselineResult = null;
  try {
    baselineResult = await runServerStressTest({
      targetUrl: baseUrl,
      method: 'GET',
      totalRequests: requestsPerTarget,
      concurrency,
      intervalMs: 0,
      timeoutMs,
      useRotatingProxy: false,
      onProgress: () => {},
    });
  } catch (err) {
    baselineResult = {
      targetUrl: baseUrl,
      avgRps: 0,
      latency: { avg: 9999, p95: 9999 },
      failedCount: requestsPerTarget,
      successfulCount: 0,
      statusCodes: { error: requestsPerTarget },
      error: err.message,
    };
  }

  // 3. Run Targeted Stress Test on Discovered Vulnerable Endpoints
  const vulnerableEndpointResults = [];
  for (let i = 0; i < endpointsToTest.length; i++) {
    const ep = endpointsToTest[i];
    onProgress({
      phase: 'stress-cooperation',
      message: `Menguji dampak beban pada celah [${i + 1}/${endpointsToTest.length}]: ${ep.path} (${ep.title})...`,
      progress: Math.round(75 + ((i + 1) / (endpointsToTest.length + 1)) * 18),
    });

    let epResult = null;
    try {
      epResult = await runServerStressTest({
        targetUrl: ep.url,
        method: ep.method || 'GET',
        totalRequests: requestsPerTarget,
        concurrency,
        intervalMs: 0,
        timeoutMs,
        useRotatingProxy: false,
        onProgress: () => {},
      });
    } catch (err) {
      epResult = {
        targetUrl: ep.url,
        avgRps: 0,
        latency: { avg: 9999, p95: 9999 },
        failedCount: requestsPerTarget,
        successfulCount: 0,
        statusCodes: { error: requestsPerTarget },
        error: err.message,
      };
    }

    // Impact analysis for this endpoint
    const baselineLat = baselineResult.latency?.avg || 100;
    const epLat = epResult.latency?.avg || 100;
    const latencyMultiplier = Number((epLat / Math.max(baselineLat, 1)).toFixed(2));
    const epErrorRate = Number(((epResult.failedCount / Math.max(epResult.completedTotal || requestsPerTarget, 1)) * 100).toFixed(1));
    const baselineErrorRate = Number(((baselineResult.failedCount / Math.max(baselineResult.completedTotal || requestsPerTarget, 1)) * 100).toFixed(1));

    let dosVulnerabilityRisk = 'LOW';
    let impactDescription = '';

    if (epErrorRate >= 35 || latencyMultiplier >= 3.5) {
      dosVulnerabilityRisk = 'CRITICAL';
      if (latencyMultiplier >= 2.0 && epErrorRate >= 20) {
        impactDescription = `Sangat Berbahaya (Critical DoS Vector). Menembakkan beban pada endpoint celah ini menyebabkan lonjakan respon ${latencyMultiplier}x lipat lebih lambat dibandingkan web utama, dengan tingkat kegagalan ${epErrorRate}%. Celah ini rentan dieksploitasi untuk melumpuhkan server (Asymmetric Denial of Service).`;
      } else if (latencyMultiplier >= 2.0) {
        impactDescription = `Sangat Berbahaya (Severe Latency Spike). Menembakkan beban pada endpoint celah ini menyebabkan server merespon ${latencyMultiplier}x lipat lebih lambat dibandingkan web utama. Berpotensi menguras pool worker backend.`;
      } else {
        impactDescription = `Sangat Berbahaya (High Failure Rate). Endpoint celah menghasilkan tingkat error ${epErrorRate}% di bawah beban trafik, mengindikasikan server gagal menangani request concurrent pada jalur ini (Crash / Connection Timeout).`;
      }
    } else if (epErrorRate >= 15 || latencyMultiplier >= 2.0) {
      dosVulnerabilityRisk = 'HIGH';
      impactDescription = `Beban Tinggi (High Resource Consumption). Respon ${latencyMultiplier}x lebih lambat atau error rate ${epErrorRate}%. Lonjakan trafik pada celah ini dapat menguras connection pool database atau CPU server.`;
    } else if (latencyMultiplier >= 1.3 || epErrorRate > baselineErrorRate) {
      dosVulnerabilityRisk = 'MODERATE';
      impactDescription = `Degradasi Sedang. Endpoint celah memiliki latensi ${latencyMultiplier}x lipat dari halaman utama (${epLat}ms vs ${baselineLat}ms) saat dibebani trafik bersamaan.`;
    } else {
      dosVulnerabilityRisk = 'LOW';
      impactDescription = `Respon Stabil. Celah tidak menimbulkan lonjakan latensi asimetris ekstrem di bawah beban ${requestsPerTarget} request (Latensi: ${epLat}ms vs Baseline: ${baselineLat}ms).`;
    }

    vulnerableEndpointResults.push({
      ...ep,
      stressMetrics: {
        completedTotal: epResult.completedTotal || requestsPerTarget,
        successfulCount: epResult.successfulCount || 0,
        failedCount: epResult.failedCount || 0,
        avgRps: epResult.avgRps || 0,
        latency: epResult.latency || { avg: 0, min: 0, max: 0, p95: 0 },
        statusCodes: epResult.statusCodes || {},
      },
      comparison: {
        baselineAvgLatency: baselineLat,
        vulnerableAvgLatency: epLat,
        latencyMultiplier,
        baselineErrorRate,
        vulnerableErrorRate: epErrorRate,
        dosVulnerabilityRisk,
        impactDescription,
      }
    });
  }

  // 4. Synthesize Overall Blast Radius
  const hasCriticalDos = vulnerableEndpointResults.some(r => r.comparison.dosVulnerabilityRisk === 'CRITICAL');
  const hasHighDos = vulnerableEndpointResults.some(r => r.comparison.dosVulnerabilityRisk === 'HIGH');
  const maxMultiplier = vulnerableEndpointResults.length > 0 
    ? Math.max(...vulnerableEndpointResults.map(r => r.comparison.latencyMultiplier)) 
    : 1.0;

  const overallDosRisk = hasCriticalDos ? 'CRITICAL' : hasHighDos ? 'HIGH' : vulnerableEndpointResults.length > 0 ? 'MODERATE' : 'LOW';

  const blastRadiusAssessment = {
    overallDosRisk,
    maxLatencyInflation: `${maxMultiplier}x`,
    baselineSummary: {
      url: baseUrl,
      avgLatency: baselineResult.latency?.avg || 0,
      avgRps: baselineResult.avgRps || 0,
      successRate: `${(100 - (baselineResult.failedCount / Math.max(baselineResult.completedTotal || 1, 1)) * 100).toFixed(1)}%`,
    },
    testedVulnerabilitiesCount: vulnerableEndpointResults.length,
    conclusions: hasCriticalDos
      ? 'PERINGATAN KRITIS: Ditemukan celah yang dapat dimanfaatkan untuk Asymmetric Denial-of-Service (DoS). Penyerang dapat membuat server database atau backend lumpuh tanpa memerlukan bandwidth tinggi.'
      : hasHighDos
      ? 'PERINGATAN TINGGI: Celah yang ditemukan memiliki konsumsi komputasi/database asimetris yang signifikan. Beban berulang pada celah ini dapat menurunkan performa seluruh website.'
      : 'EVALUASI BEBAN: Celah yang ditemukan memiliki karakteristik respon sebanding dengan web utama, namun tetap memerlukan proteksi rate limit dan input validation.',
    developerActionItems: [
      'Terapkan Rate Limiting ketat per-IP dan per-Akun pada endpoint yang teridentifikasi rentan.',
      'Gunakan query timeout batas maksimal (misal: 3-5 detik) pada database agar query berat akibat eksploitasi tidak menahan connection pool.',
      'Terapkan Redis caching pada response endpoint yang sering dieksplorasi berulang kali.',
      'Pisahkan thread pool atau autoscaling pod backend untuk jalur publik dan jalur sensitif/administratif.'
    ],
  };

  return {
    executed: true,
    testedAt: new Date().toISOString(),
    baseline: baselineResult,
    vulnerableEndpoints: vulnerableEndpointResults,
    blastRadius: blastRadiusAssessment,
  };
}

