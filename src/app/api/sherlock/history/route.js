import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import SherlockResult from '@/models/SherlockResult';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectToDatabase();
    const history = await SherlockResult.find(
      {},
      'slug username totalSites foundCount notFoundCount errorCount mode status createdAt'
    )
      .sort({ createdAt: -1 })
      .limit(50);

    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
