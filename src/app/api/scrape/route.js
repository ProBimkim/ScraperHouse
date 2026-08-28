import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ScrapeResult from '@/models/ScrapeResult';
import { runScraper } from '@/lib/scraper';

export async function POST(req) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    await connectToDatabase();
    
    // Generate slug like "scraper1"
    const count = await ScrapeResult.countDocuments();
    const slug = `scraper${count + 1}`;

    // Run scraper asynchronously or wait for it?
    // Since Next.js API route has timeout limits (especially on Vercel),
    // and Puppeteer might take time, we'll start it and return the slug immediately.
    // The frontend can poll or just go to /scraper/[slug] which will show 'processing' state.
    
    // Start scraping in background
    runScraper(url, slug).catch(console.error);

    return NextResponse.json({ slug, message: 'Scraping started' });

  } catch (error) {
    console.error('Error in /api/scrape:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
