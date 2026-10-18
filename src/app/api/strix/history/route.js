import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import SecurityScanResult from '@/models/SecurityScanResult';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectToDatabase();
    const history = await SecurityScanResult.find(
      {},
      'slug targetType target targetLabel scanMode summary status createdAt'
    )
      .sort({ createdAt: -1 })
      .limit(50);

    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
