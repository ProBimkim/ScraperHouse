import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import SherlockResult from '@/models/SherlockResult';
import { huntUsername, getSiteData, POPULAR_SITES } from '@/lib/sherlockEngine';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { username, mode = 'popular' } = await request.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const cleanedUsername = username.trim();
    if (!/^[a-zA-Z0-9._-]{1,60}$/.test(cleanedUsername)) {
      return NextResponse.json(
        { error: 'Invalid username format. Only letters, numbers, dots, hyphens, and underscores are allowed.' },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const slug = `${cleanedUsername.toLowerCase()}-${Date.now()}`;
    const sherlockDoc = await SherlockResult.create({
      slug,
      username: cleanedUsername,
      mode,
      status: 'processing',
      results: [],
    });

    const allSites = getSiteData();
    let totalTargetSites = 0;
    if (mode === 'popular') {
      totalTargetSites = Math.min(50, Object.keys(allSites).length);
    } else {
      totalTargetSites = Object.keys(allSites).length;
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        function sendEvent(data) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Controller might be closed if client disconnected
          }
        }

        // Send initial event
        sendEvent({
          type: 'start',
          slug,
          id: sherlockDoc._id,
          username: cleanedUsername,
          mode,
          totalSites: totalTargetSites,
        });

        let foundCount = 0;
        let notFoundCount = 0;
        let errorCount = 0;

        try {
          const results = await huntUsername(cleanedUsername, {
            mode,
            concurrency: 15,
            onResult: (item, checked, total) => {
              if (item.status === 'found') foundCount++;
              else if (item.status === 'not_found') notFoundCount++;
              else errorCount++;

              sendEvent({
                type: 'result',
                item,
                progress: {
                  checked,
                  total,
                  foundCount,
                  notFoundCount,
                  errorCount,
                },
              });
            },
          });

          // Save final results to MongoDB
          await SherlockResult.findByIdAndUpdate(sherlockDoc._id, {
            totalSites: results.length,
            foundCount,
            notFoundCount,
            errorCount,
            results,
            status: 'completed',
          });

          sendEvent({
            type: 'complete',
            slug,
            id: sherlockDoc._id,
            summary: {
              totalSites: results.length,
              foundCount,
              notFoundCount,
              errorCount,
            },
          });
        } catch (err) {
          console.error('Sherlock hunt error:', err);
          await SherlockResult.findByIdAndUpdate(sherlockDoc._id, {
            status: 'failed',
          });
          sendEvent({
            type: 'error',
            message: err.message || 'Hunting failed unexpectedly',
          });
        } finally {
          try {
            controller.close();
          } catch {}
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
  } catch (error) {
    console.error('Sherlock API Route Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
