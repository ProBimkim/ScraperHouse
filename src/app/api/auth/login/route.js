import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { signSession, SESSION_TTL_MS } from '@/lib/session'

// shortcut: in-memory IP rate limiter resets on server restart; upgrade to Redis/Upstash for multi-region serverless
const loginAttempts = new Map()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000

export async function POST(request) {
  try {
    // CSRF & Origin Validation
    const origin = request.headers.get('origin')
    const host = request.headers.get('host')
    const secFetchSite = request.headers.get('sec-fetch-site')
    if (secFetchSite === 'cross-site') {
      return NextResponse.json({ error: 'Akses ditolak (Cross-origin forbidden)' }, { status: 403 })
    }
    if (origin) {
      try {
        if (new URL(origin).host !== host) {
          return NextResponse.json({ error: 'Akses ditolak (Cross-origin forbidden)' }, { status: 403 })
        }
      } catch {
        return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
      }
    }

    // IP Extraction & Rate Limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
               request.headers.get('x-real-ip') || 
               '127.0.0.1'

    const now = Date.now()
    const attempt = loginAttempts.get(ip)
    if (attempt && now < attempt.resetAt && attempt.count >= MAX_ATTEMPTS) {
      const waitMinutes = Math.ceil((attempt.resetAt - now) / 60000)
      return NextResponse.json(
        { error: `Terlalu banyak percobaan login. Silakan tunggu ${waitMinutes} menit lagi.` },
        { status: 429, headers: { 'Retry-After': '900' } }
      )
    }

    const { keyword } = await request.json()
    // Fail closed: never fall back to a hardcoded default password
    const correctPassword = process.env.APP_PASSWORD
    if (!correctPassword) {
      return NextResponse.json({ error: 'Konfigurasi server belum lengkap' }, { status: 500 })
    }

    if (keyword === correctPassword) {
      loginAttempts.delete(ip)
      const token = await signSession(SESSION_TTL_MS)
      const cookieStore = await cookies()
      cookieStore.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_TTL_MS / 1000, // 1 week
        path: '/',
      })
      
      return NextResponse.json({ success: true })
    }

    // Track failed attempt
    if (!attempt || now >= attempt.resetAt) {
      loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    } else {
      attempt.count += 1
    }

    const currentCount = loginAttempts.get(ip)?.count || 1
    const remaining = Math.max(0, MAX_ATTEMPTS - currentCount)
    return NextResponse.json(
      { error: `Kata kunci salah${remaining > 0 ? ` (Sisa ${remaining} percobaan)` : ' (Akun terkunci sementara)'}` },
      { status: 401 }
    )
  } catch (error) {
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem' },
      { status: 500 }
    )
  }
}
