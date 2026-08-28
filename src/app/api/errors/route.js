import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import GlobalErrorLog from '@/models/GlobalErrorLog';

export async function GET() {
  try {
    await connectToDatabase();
    const errors = await GlobalErrorLog.find({ resolved: false })
      .populate('scrapeResultId', 'slug url')
      .sort({ createdAt: -1 });
      
    return NextResponse.json(errors);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
