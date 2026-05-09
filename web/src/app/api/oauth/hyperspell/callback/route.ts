// Hyperspell OAuth callback. Records that this user has the provider
// connected by writing an oauth_tokens row (we don't store the upstream
// access token — Hyperspell holds it).
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get('provider') ?? 'unknown';
  const next = req.nextUrl.searchParams.get('next') ?? '/orgs/default/connectors';
  const userId = req.cookies.get('teamhq_hyperspell_uid')?.value;

  if (userId) {
    const URL = process.env.INSFORGE_PROJECT_URL;
    const KEY = process.env.INSFORGE_ACCESS_API_KEY;
    if (URL && KEY) {
      try {
        // Best-effort: insert / update oauth_tokens row.
        await fetch(`${URL}/api/database/records/oauth_tokens`, {
          method: 'POST',
          headers: {
            'x-api-key': KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            user_id: userId,
            provider: provider.toLowerCase(),
            access_token: 'managed-by-hyperspell',
            github_login: null,
            scopes: 'hyperspell-managed',
          }),
        });
      } catch {
        // ignore — UI will reflect state on next refresh anyway
      }
    }
  }

  const dest = new URL(next, req.nextUrl);
  const res = NextResponse.redirect(dest);
  res.cookies.set('teamhq_hyperspell_uid', '', { path: '/', maxAge: 0 });
  return res;
}
