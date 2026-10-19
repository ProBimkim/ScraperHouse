import connectToDatabase from '@/lib/mongodb';
import SecurityScanResult from '@/models/SecurityScanResult';
import { runServerStressTest } from '@/lib/stressEngine';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request payload' }, { status: 400 });
  }

  const {
    targetUrl = '',
    method = 'GET',
    totalRequests = 100,
    concurrency = 10,
    intervalMs = 0,
    timeoutMs = 10000,
    useRotatingProxy = false,
    customHeaders = {},
    requestBody = '',
  } = body;

  const cleanUrl = typeof targetUrl === 'string' ? targetUrl.trim() : '';
  if (!cleanUrl) {
    return Response.json({ error: 'Target URL is required for stress & load testing.' }, { status: 400 });
  }

  // Validate URL protocol
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return Response.json({ error: 'URL must start with http:// or https://' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: 'Invalid target URL format.' }, { status: 400 });
  }

  const slug = `stress_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const encoder = new TextEncoder();

  // AbortController connected to request abort signal
  const localAbortController = new AbortController();
  if (req.signal) {
    req.signal.addEventListener('abort', () => {
      localAbortController.abort();
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(type, data) {
        try {
          const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (e) {
          console.error('Error enqueuing Stress SSE event:', e);
        }
      }

      try {
        sendEvent('status', {
          phase: 'starting',
          message: `Initializing stress test engine for ${cleanUrl}...`,
          progress: 0,
          slug,
        });

        const stressOutput = await runServerStressTest({
          targetUrl: cleanUrl,
          method,
          totalRequests,
          concurrency,
          intervalMs,
          timeoutMs,
          useRotatingProxy,
          customHeaders,
          body: (method === 'POST' || method === 'PUT') ? requestBody : null,
          abortSignal: localAbortController.signal,
          onProgress: (p) => {
            sendEvent('status', {
              phase: 'running',
              slug,
              ...p,
            });
          },
        });

        // Determine score and rating from stability grade
        const gradeMap = {
          'A+': { score: 5, rating: 'SECURE' },
          'A': { score: 15, rating: 'SECURE' },
          'B': { score: 35, rating: 'LOW' },
          'C': { score: 65, rating: 'MEDIUM' },
          'D': { score: 85, rating: 'HIGH' },
          'F': { score: 100, rating: 'CRITICAL' },
        };
        const mapped = gradeMap[stressOutput.analysis?.grade] || { score: 50, rating: 'MEDIUM' };

        // Save report to MongoDB
        try {
          await connectToDatabase();
          await SecurityScanResult.create({
            slug,
            targetType: 'stress',
            target: cleanUrl,
            targetLabel: `${cleanUrl} (${stressOutput.completedTotal} reqs @ ${concurrency} CCU)`,
            scanMode: concurrency >= 50 ? 'deep' : concurrency >= 20 ? 'standard' : 'quick',
            instruction: `${method} ${cleanUrl} - Volume: ${stressOutput.completedTotal}/${stressOutput.plannedTotal} requests - Concurrency: ${concurrency} CCU - Delay: ${intervalMs}ms`,
            summary: {
              totalVulnerabilities: stressOutput.failedCount,
              critical: stressOutput.analysis?.grade === 'F' ? 1 : 0,
              high: stressOutput.analysis?.grade === 'D' ? 1 : 0,
              medium: stressOutput.analysis?.grade === 'C' ? 1 : 0,
              low: stressOutput.analysis?.grade === 'B' ? 1 : 0,
              info: 0,
              riskScore: mapped.score,
              riskRating: mapped.rating,
            },
            executiveSummary: `Server Performance & Stress Test for ${cleanUrl}: Grade ${stressOutput.analysis?.grade} (${stressOutput.analysis?.statusSummary}). Handled ${stressOutput.completedTotal} requests in ${stressOutput.durationSec}s with avg throughput of ${stressOutput.avgRps} req/sec and avg response time of ${stressOutput.latency?.avg}ms.`,
            stressResult: stressOutput,
            vulnerabilities: [],
            status: 'completed',
          });
          console.log(`[Stress Test Engine] Report saved to database: ${slug}`);
        } catch (dbErr) {
          console.warn('MongoDB save warning for stress test result:', dbErr.message);
        }

        sendEvent('complete', {
          slug,
          ...stressOutput,
        });
      } catch (err) {
        console.error('Stress test error:', err);
        sendEvent('error', {
          message: err.message || 'An unexpected error occurred during stress testing.',
        });
      } finally {
        controller.close();
      }
    },
    cancel() {
      localAbortController.abort();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
