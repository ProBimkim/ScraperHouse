import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ScrapeResult from '@/models/ScrapeResult';

export async function GET() {
  try {
    await connectToDatabase();
    const history = await ScrapeResult.find({}, 'slug url title status createdAt')
      .sort({ createdAt: -1 })
      .limit(50);
      
    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
