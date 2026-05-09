// Logout: clears auth cookies and redirects to /login.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function clearAndRedirect(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set('teamhq_token', '', { path: '/', maxAge: 0 });
  res.cookies.set('teamhq_demo_persona', '', { path: '/', maxAge: 0 });
  return res;
}

export async function POST(req: NextRequest) {
  return clearAndRedirect(req);
}

// Allow GET for plain <a href="/auth/logout"> links too.
export async function GET(req: NextRequest) {
  return clearAndRedirect(req);
}
