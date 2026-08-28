import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ScrapeResult from '@/models/ScrapeResult';
import { runScraper } from '@/lib/scraper';

export const maxDuration = 60; // Allow Vercel to run up to 60s

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

    // Wait for the scraper to finish so Vercel doesn't kill the lambda
    await runScraper(url, slug);

    return NextResponse.json({ slug, message: 'Scraping finished' });

  } catch (error) {
    console.error('Error in /api/scrape:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
