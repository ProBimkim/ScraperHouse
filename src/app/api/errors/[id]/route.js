import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import GlobalErrorLog from '@/models/GlobalErrorLog';

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const { resolved } = await req.json();
    
    await connectToDatabase();
    
    const updated = await GlobalErrorLog.findByIdAndUpdate(
      id,
      { resolved, resolvedAt: resolved ? new Date() : null },
      { new: true }
    );
    
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
