import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Auth gate. Runs on every page request. Redirects unauthed users to /login.
// "Authed" means a non-empty `teamhq_token` cookie OR a `teamhq_demo_persona`
// cookie (demo shortcut).
//
// NOTE: in this Next.js version `middleware.ts` is deprecated in favour of
// `proxy.ts`, but the spec explicitly asks for `middleware.ts` and the legacy
// export still works.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths — never gated.
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|map|txt)$/.test(pathname);

  if (isPublic) return NextResponse.next();

  const token = req.cookies.get('teamhq_token')?.value;
  const demo = req.cookies.get('teamhq_demo_persona')?.value;

  if (token || demo) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Match everything except Next internals + static files. Path-level
  // exclusions are also handled defensively in the function above.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
