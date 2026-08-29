import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import QuizizzResult from '@/models/QuizizzResult';

export async function GET() {
  try {
    await connectToDatabase();
    const history = await QuizizzResult.find({}, 'slug inputType inputValue title status createdAt')
      .sort({ createdAt: -1 })
      .limit(50);
      
    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
