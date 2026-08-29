import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import QuizizzResult from '@/models/QuizizzResult';
import { runQuizizzScraper } from '@/lib/quizizzScraper';

export const maxDuration = 60; // Allow Vercel to run up to 60s

export async function POST(req) {
  try {
    const { input, inputType } = await req.json();
    if (!input || !inputType) {
      return NextResponse.json({ error: 'Input and inputType are required' }, { status: 400 });
    }

    await connectToDatabase();
    
    // Generate unique slug
    const timestamp = Date.now().toString(36);
    const slug = `quizizz_${timestamp}`;

    // Wait for the scraper to finish so Vercel doesn't kill the lambda
    await runQuizizzScraper(input, inputType, slug);

    return NextResponse.json({ slug, message: 'Scraping finished' });

  } catch (error) {
    console.error('Error in /api/quizizz/scrape:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
