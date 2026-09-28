import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ScrapeResult from '@/models/ScrapeResult';
import GlobalErrorLog from '@/models/GlobalErrorLog';
import { runScraper } from '@/lib/scraper';

export const maxDuration = 60; // Allow Vercel to run up to 60s

// Hard timeout: 50s to leave buffer before Vercel's 60s limit kills the function
const SCRAPE_TIMEOUT_MS = 50_000;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Scraping timed out after ${ms / 1000}s. The form may be too large or the server is overloaded.`));
    }, ms);
    promise
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

export async function POST(req) {
  let slug = null;
  let url = null;

  try {
    const body = await req.json();
    url = body.url;
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    await connectToDatabase();

    // Generate unique slug
    const timestamp = Date.now().toString(36);
    slug = `scraper_${timestamp}`;

    // Run scraper with a hard timeout so we can catch hangs
    await withTimeout(runScraper(url, slug), SCRAPE_TIMEOUT_MS);

    return NextResponse.json({ slug, message: 'Scraping finished' });

  } catch (error) {
    console.error('Error in /api/scrape:', error);

    // Safety net: if slug was created, make sure the DB record is not stuck on 'processing'
    if (slug) {
      try {
        await connectToDatabase();
        const doc = await ScrapeResult.findOne({ slug });
        if (doc && doc.status === 'processing') {
          doc.status = 'failed';
          doc.errors.push({
            message: error.message || 'Unknown error in /api/scrape',
            stack: error.stack || '',
          });
          doc.scrapeSteps = doc.scrapeSteps || [];
          doc.scrapeSteps.push({ step: 'api_safety_net', status: 'failed', message: error.message });
          await doc.save();

          // Also log to GlobalErrorLog so it shows up in the Errors page
          await GlobalErrorLog.create({
            scrapeResultId: doc._id,
            url: url || '',
            slug,
            errors: [{
              type: 'UnhandledScrapingError',
              message: error.message || 'Scraping crashed or timed out',
              stack: error.stack || '',
              step: 'api_safety_net',
            }],
          });
        }
      } catch (dbErr) {
        console.error('Failed to update stuck record in safety net:', dbErr);
      }
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
