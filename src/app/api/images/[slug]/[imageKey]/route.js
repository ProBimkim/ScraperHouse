import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import StoredImage from '@/models/StoredImage';

export async function GET(req, { params }) {
  const { slug, imageKey } = await params;

  try {
    await connectToDatabase();

    const imageDoc = await StoredImage.findOne({ slug, imageKey });

    if (!imageDoc || !imageDoc.data) {
      return new NextResponse('Image not found', { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', imageDoc.contentType || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Content-Length', imageDoc.data.length.toString());

    return new NextResponse(imageDoc.data, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error(`Error fetching image ${slug}/${imageKey}:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
