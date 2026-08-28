import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request) {
  try {
    const { keyword } = await request.json()
    // Fallback to DEV_BIMKIM if environment variable is undefined (e.g. dev server not restarted)
    const correctPassword = process.env.APP_PASSWORD || 'DEV_BIMKIM'

    if (keyword === correctPassword) {
      cookies().set('auth_token', 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7, // 1 week
        path: '/',
      })
      
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: 'Kata kunci salah' },
      { status: 401 }
    )
  } catch (error) {
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem' },
      { status: 500 }
    )
  }
}
