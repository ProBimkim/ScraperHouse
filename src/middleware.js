import { NextResponse } from 'next/server'

export function middleware(request) {
  const authToken = request.cookies.get('auth_token')?.value
  const { pathname } = request.nextUrl

  // Allow access to login page and authentication API
  if (pathname === '/login' || pathname === '/api/auth/login') {
    if (pathname === '/login' && authToken === 'true') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // Reject unauthenticated requests
  if (!authToken || authToken !== 'true') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static images (svg, png, jpg, jpeg, gif, webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
