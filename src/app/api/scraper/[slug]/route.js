import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ScrapeResult from '@/models/ScrapeResult';

export async function GET(req, { params }) {
  try {
    const { slug } = await params;
    await connectToDatabase();
    
    const result = await ScrapeResult.findOne({ slug });
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { slug } = await params;
    const url = new URL(req.url);
    const password = url.searchParams.get('password');

    if (password !== process.env.APP_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized: Invalid password' }, { status: 401 });
    }

    await connectToDatabase();
    
    const result = await ScrapeResult.findOneAndDelete({ slug });
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    return NextResponse.json({ message: 'Deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
