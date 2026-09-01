import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import GlobalErrorLog from '@/models/GlobalErrorLog';

// GET all unresolved errors
export async function GET(req) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const showAll = searchParams.get('all') === 'true';

    const filter = showAll ? {} : { resolved: false };
    const errors = await GlobalErrorLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(100);

    return NextResponse.json(errors);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH — mark ALL errors as resolved
export async function PATCH() {
  try {
    await connectToDatabase();
    const result = await GlobalErrorLog.updateMany(
      { resolved: false },
      { $set: { resolved: true, resolvedAt: new Date() } }
    );
    return NextResponse.json({ modifiedCount: result.modifiedCount });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — permanently delete ALL error history
export async function DELETE() {
  try {
    await connectToDatabase();
    const result = await GlobalErrorLog.deleteMany({});
    return NextResponse.json({ deletedCount: result.deletedCount });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
