import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ScrapeResult from '@/models/ScrapeResult';
import { runOcrOnQuestions } from '@/lib/ocrEngine';

export async function POST(req, { params }) {
  try {
    const { slug } = await params;
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';

    await connectToDatabase();

    const result = await ScrapeResult.findOne({ slug });
    if (!result) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const ocrStats = await runOcrOnQuestions(result.questions, null, force);
    await ScrapeResult.updateOne(
      { slug },
      { $set: { questions: result.questions } }
    );

    return NextResponse.json({
      success: true,
      processed: ocrStats.processed,
      total: ocrStats.total,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
