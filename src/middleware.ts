import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/home', '/login', '/policy', '/terms', '/api/auth', '/api/webhooks', '/api/stream'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get('__session')?.value;

  if (!session) {
    // Root path → send to homepage; other paths → login with redirect
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/home', request.url));
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|macos-icons|icons|animated-icons).*)'],
};
