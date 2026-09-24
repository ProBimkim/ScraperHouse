import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ScrapeResult from '@/models/ScrapeResult';
import { runOcrOnQuestions } from '@/lib/ocrEngine';

export const maxDuration = 60;

export async function POST(req, { params }) {
  try {
    const { slug } = await params;
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '5', 10);

    await connectToDatabase();

    const result = await ScrapeResult.findOne({ slug });
    if (!result) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const ocrStats = await runOcrOnQuestions(result.questions, null, force, limit);
    if (ocrStats.processed > 0) {
      await ScrapeResult.updateOne(
        { slug },
        { $set: { questions: result.questions } }
      );
    }

    return NextResponse.json({
      success: true,
      processed: ocrStats.processed,
      total: ocrStats.total,
      remaining: ocrStats.remaining,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
