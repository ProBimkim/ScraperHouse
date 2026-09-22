import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ScrapeResult from '@/models/ScrapeResult';

export async function PUT(req, { params }) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const { questionId, text } = body;

    if (!questionId) {
      return NextResponse.json({ error: 'questionId is required' }, { status: 400 });
    }

    await connectToDatabase();

    // Find the document first
    const doc = await ScrapeResult.findOne({ slug });
    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Check if comment for this questionId already exists
    const commentIndex = doc.comments.findIndex(c => c.questionId === questionId);

    if (commentIndex > -1) {
      // Update existing comment
      doc.comments[commentIndex].text = text || '';
      doc.comments[commentIndex].updatedAt = new Date();
    } else {
      // Add new comment
      doc.comments.push({
        questionId,
        text: text || '',
        updatedAt: new Date()
      });
    }

    await doc.save();

    const updatedComment = doc.comments.find(c => c.questionId === questionId);
    
    return NextResponse.json({ success: true, comment: updatedComment });
  } catch (error) {
    console.error('Comment save error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
