import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import QuizizzResult from '@/models/QuizizzResult';

export async function GET(req, { params }) {
  try {
    const { slug } = await params;
    await connectToDatabase();
    
    const result = await QuizizzResult.findOne({ slug });
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
    await connectToDatabase();
    
    const result = await QuizizzResult.findOneAndDelete({ slug });
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    return NextResponse.json({ message: 'Deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
