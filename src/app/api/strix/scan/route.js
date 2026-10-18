import connectToDatabase from '@/lib/mongodb';
import SecurityScanResult from '@/models/SecurityScanResult';
import { runStrixPentest } from '@/lib/strixEngine';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request payload' }, { status: 400 });
  }

  const {
    targetType = 'url',
    target = '',
    codeSnippet = '',
    scanMode = 'standard',
    instruction = '',
    groqApiKey = '',
    githubToken = '',
    stream: shouldStream = true,
  } = body;

  if (!target && !codeSnippet) {
    return Response.json({ error: 'A target (URL or GitHub Repo) or code snippet is required.' }, { status: 400 });
  }

  const slug = `strix_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const effectiveTarget = target || (targetType === 'code' ? 'Custom Code Snippet' : 'Unknown Target');

  // Handle SSE streaming response
  if (shouldStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function sendEvent(type, data) {
          try {
            const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          } catch (e) {
            console.error('Error enqueuing SSE event:', e);
          }
        }

        try {
          sendEvent('status', {
            phase: 'starting',
            message: 'Strix AI Security Engine initialized...',
            progress: 5,
            slug,
          });

          // Run full autonomous pentest
          const scanOutput = await runStrixPentest({
            targetType,
            target: effectiveTarget,
            codeSnippet,
            scanMode,
            instruction,
            groqApiKey,
            githubToken,
            onProgress: (p) => {
              sendEvent('status', { ...p, slug });
            },
          });

          // Save to MongoDB
          try {
            await connectToDatabase();
            const savedDoc = await SecurityScanResult.create({
              slug,
              targetType,
              target: effectiveTarget,
              targetLabel: effectiveTarget,
              scanMode,
              instruction,
              summary: scanOutput.summary,
              executiveSummary: scanOutput.executiveSummary,
              recon: scanOutput.recon,
              vulnerabilities: scanOutput.vulnerabilities,
              sarif: scanOutput.sarif,
              status: 'completed',
            });
            console.log(`Saved Strix scan report: ${savedDoc.slug}`);
          } catch (dbErr) {
            console.warn('MongoDB save error (proceeding with memory result):', dbErr.message);
          }

          sendEvent('complete', {
            slug,
            ...scanOutput,
          });
        } catch (err) {
          console.error('Strix scan error:', err);
          sendEvent('error', {
            message: err.message || 'An unexpected error occurred during security scan.',
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  }

  // Non-streaming fallback
  try {
    const scanOutput = await runStrixPentest({
      targetType,
      target: effectiveTarget,
      codeSnippet,
      scanMode,
      instruction,
      groqApiKey,
      githubToken,
    });

    try {
      await connectToDatabase();
      await SecurityScanResult.create({
        slug,
        targetType,
        target: effectiveTarget,
        targetLabel: effectiveTarget,
        scanMode,
        instruction,
        summary: scanOutput.summary,
        executiveSummary: scanOutput.executiveSummary,
        recon: scanOutput.recon,
        vulnerabilities: scanOutput.vulnerabilities,
        sarif: scanOutput.sarif,
        status: 'completed',
      });
    } catch (dbErr) {
      console.warn('MongoDB save error in non-streaming:', dbErr.message);
    }

    return Response.json({ slug, ...scanOutput });
  } catch (err) {
    return Response.json({ error: err.message || 'Scan failed' }, { status: 500 });
  }
}
