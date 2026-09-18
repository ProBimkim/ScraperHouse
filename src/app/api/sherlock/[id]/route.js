import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import SherlockResult from '@/models/SherlockResult';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    await connectToDatabase();

    let query = { slug: id };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { $or: [{ slug: id }, { _id: id }] };
    }

    const result = await SherlockResult.findOne(query);
    if (!result) {
      return NextResponse.json({ error: 'Search result not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    await connectToDatabase();

    let query = { slug: id };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { $or: [{ slug: id }, { _id: id }] };
    }

    const result = await SherlockResult.findOneAndDelete(query);
    if (!result) {
      return NextResponse.json({ error: 'Search result not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
