'use client';

// Clean light-themed login surface. Toggles between sign-in and sign-up.
// Real form behavior: hits /api/auth/signin or /api/auth/signup which set
// HttpOnly cookies. OAuth uses the InsForge SDK in the browser.
import { useState, useEffect, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Mode = 'signin' | 'signup';

function GitHubLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.18c-3.2.7-3.87-1.36-3.87-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.93 10.93 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.3-.1-2.6-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.5 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C40.8 35.7 44 30.3 44 24c0-1.3-.1-2.6-.4-3.5z" />
    </svg>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const err = params.get('err');
    if (err) setError(err);
  }, [params]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const path = mode === 'signin' ? '/api/auth/signin' : '/api/auth/signup';
      const body =
        mode === 'signin' ? { email, password } : { email, password, name };
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.message ?? 'Something went wrong');
        return;
      }
      router.push(data.redirect ?? '/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOAuth(provider: 'github' | 'google') {
    setError(null);
    setSubmitting(true);
    try {
      // Generate PKCE pair (RFC 7636). InsForge's OAuth start endpoint takes
      // a code_challenge and stashes it server-side; on callback we send the
      // code_verifier back via cookie.
      const verifier = crypto.randomUUID() + '-' + crypto.randomUUID();
      const enc = new TextEncoder();
      const buf = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      // Persist verifier in a short-lived cookie that the /auth/callback route reads.
      document.cookie = `teamhq_pkce=${verifier}; Path=/; Max-Age=600; SameSite=Lax`;

      const params = new URLSearchParams({
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: `${window.location.origin}/auth/callback`,
      });

      const r = await fetch(
        `${process.env.NEXT_PUBLIC_INSFORGE_URL}/api/auth/oauth/${provider}?${params}`,
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.authUrl) {
        setError(data.message ?? `${provider} OAuth init failed`);
        setSubmitting(false);
        return;
      }
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth error');
      setSubmitting(false);
    }
  }

  async function handleDemo() {
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona: 'sarah' }),
      });
      if (!r.ok) {
        setError('Demo login failed');
        return;
      }
      router.push('/');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-gray-50 text-gray-900">
      <header className="px-6 sm:px-10 py-6">
        <div className="text-lg font-semibold tracking-tight text-gray-900">
          TeamHQ
        </div>
      </header>

      <main className="flex justify-center px-4 pb-16 pt-8 sm:pt-16">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              {mode === 'signin' ? 'Sign in' : 'Create your account'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {mode === 'signin'
                ? 'Welcome back to your team.'
                : 'A few details and you’re in.'}
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={() => handleOAuth('github')}
                disabled={submitting}
                className="w-full bg-white border border-gray-200 rounded-xl py-3 flex items-center justify-center gap-3 hover:border-gray-300 transition disabled:opacity-50"
              >
                <GitHubLogo />
                <span className="text-sm font-medium text-gray-900">
                  Continue with GitHub
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleOAuth('google')}
                disabled={submitting}
                className="w-full bg-white border border-gray-200 rounded-xl py-3 flex items-center justify-center gap-3 hover:border-gray-300 transition disabled:opacity-50"
              >
                <GoogleLogo />
                <span className="text-sm font-medium text-gray-900">
                  Continue with Google
                </span>
              </button>
            </div>

            <div className="my-6 flex items-center gap-3 text-xs text-gray-400">
              <div className="flex-1 h-px bg-gray-200" />
              <span>or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'signup' && (
                <input
                  type="text"
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
              />

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-gray-900 text-white rounded-xl py-3 font-medium hover:bg-gray-800 active:scale-[.98] transition disabled:opacity-60 disabled:active:scale-100"
              >
                {submitting
                  ? 'One moment…'
                  : mode === 'signin'
                  ? 'Sign in'
                  : 'Create account'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
              }}
              className="mt-4 w-full text-sm text-gray-600 hover:text-gray-900 transition"
            >
              {mode === 'signin'
                ? "Don't have an account? Create one"
                : 'Already have an account? Sign in'}
            </button>

            <div className="mt-8 pt-5 border-t border-gray-100 text-center">
              <button
                type="button"
                onClick={handleDemo}
                disabled={submitting}
                className="text-xs text-gray-500 hover:text-gray-900 hover:underline transition"
              >
                Demo mode: continue as Sarah Chen
              </button>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">
            By continuing you agree to the TeamHQ terms.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
