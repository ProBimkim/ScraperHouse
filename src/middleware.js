import { NextResponse } from 'next/server'

export function middleware(request) {
  const authToken = request.cookies.get('auth_token')?.value
  const { pathname } = request.nextUrl

  // Allow access to login page
  if (pathname === '/login') {
    if (authToken === 'true') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // Check auth for other pages
  if (!authToken || authToken !== 'true') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static images (svg, png, jpg, jpeg, gif, webp)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
