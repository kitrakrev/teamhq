// GET/POST /api/auth/signout — clears all session cookies and bounces to /login.
import { NextResponse } from 'next/server';

const COOKIES = [
  'teamhq_session',       // real-auth JWT
  'teamhq_demo_persona',  // demo persona cookie
  'teamhq_org_id',        // session-pinned org
];

function killCookies(res: NextResponse) {
  for (const name of COOKIES) {
    res.cookies.set(name, '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax' });
  }
  return res;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const target = new URL('/login', url.origin);
  return killCookies(NextResponse.redirect(target, { status: 303 }));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = new URL('/login', url.origin);
  return killCookies(NextResponse.redirect(target, { status: 303 }));
}
