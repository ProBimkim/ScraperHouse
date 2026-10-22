import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ScrapeResult from '@/models/ScrapeResult';
import { getAIAnswers } from '@/lib/groqAgent';

export const maxDuration = 60;

export async function POST(req, { params }) {
  try {
    const { slug } = await params;
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    await connectToDatabase();

    const result = await ScrapeResult.findOne({ slug });
    if (!result) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const questions = result.questions || [];
    if (questions.length === 0) {
      return NextResponse.json({ error: 'Tidak ada soal dalam form ini' }, { status: 400 });
    }

    const existingAnswers = result.aiAnswers || [];

    // Filter questions that need answering
    const pendingQuestions = force
      ? questions
      : questions.filter((q) => !existingAnswers.some((a) => a.questionId === q.id));

    if (pendingQuestions.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        remaining: 0,
        total: questions.length,
        answersCount: existingAnswers.length,
        message: 'Semua soal sudah dijawab oleh AI',
      });
    }

    // Process a batch of questions
    // If questions have images, limit batch size to 5 to avoid image count limits and serverless timeout
    const hasImages = pendingQuestions.some(
      (q) => q.imageUrl || q.originalImageUrl || q.choices?.some((c) => typeof c === 'object' && (c?.imageUrl || c?.originalImageUrl))
    );
    const effectiveLimit = hasImages ? Math.min(limit, 5) : limit;

    const currentBatch = pendingQuestions.slice(0, effectiveLimit);
    const newAnswers = await getAIAnswers(currentBatch, { slug });

    // Merge answers by questionId
    const answerMap = new Map();
    existingAnswers.forEach((a) => {
      if (a && a.questionId) answerMap.set(a.questionId, a);
    });
    newAnswers.forEach((a) => {
      if (a && a.questionId) answerMap.set(a.questionId, a);
    });

    const mergedAnswers = Array.from(answerMap.values());

    await ScrapeResult.updateOne(
      { slug },
      { $set: { aiAnswers: mergedAnswers } }
    );

    const remaining = pendingQuestions.length - currentBatch.length;

    return NextResponse.json({
      success: true,
      processed: newAnswers.length,
      remaining: Math.max(0, remaining),
      total: questions.length,
      answersCount: mergedAnswers.length,
    });
  } catch (error) {
    console.error('Error running AI solver:', error);
    return NextResponse.json({ error: error.message || 'Gagal menjalankan AI solver' }, { status: 500 });
  }
}
