// Inline SVG icons used across the light onboarding/connectors surface.
export function GitHubIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5C5.73.5.66 5.57.66 11.84c0 5.02 3.25 9.27 7.77 10.77.57.1.78-.25.78-.55v-1.94c-3.16.69-3.83-1.52-3.83-1.52-.52-1.31-1.27-1.66-1.27-1.66-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.74 2.67 1.24 3.32.95.1-.74.4-1.24.72-1.52-2.52-.29-5.18-1.26-5.18-5.6 0-1.24.44-2.25 1.17-3.05-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.15 1.16a10.95 10.95 0 0 1 5.74 0c2.19-1.47 3.15-1.16 3.15-1.16.62 1.57.23 2.73.11 3.02.73.8 1.17 1.81 1.17 3.05 0 4.36-2.66 5.31-5.2 5.59.41.35.78 1.05.78 2.12v3.14c0 .31.21.66.79.55 4.51-1.5 7.76-5.75 7.76-10.77C23.34 5.57 18.27.5 12 .5Z" />
    </svg>
  );
}

export function SlackIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#E01E5A" d="M5 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5Z" />
      <path fill="#36C5F0" d="M9 5a2 2 0 1 1 2-2v2H9Zm0 1a2 2 0 1 1 0 4H4a2 2 0 1 1 0-4h5Z" />
      <path fill="#2EB67D" d="M19 9a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 1 1-4 0V4a2 2 0 1 1 4 0v5Z" />
      <path fill="#ECB22E" d="M15 19a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5Z" />
    </svg>
  );
}

export function NotionIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="4" fill="#000" />
      <path d="M6 6.5h7l5 5.5v6.5H6V6.5Z" fill="#fff" />
      <path d="M9 9.5v8M9 9.5l6 8M15 9.5v8" stroke="#000" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function LinearIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" fill="#5E6AD2" />
      <path d="M5 13l6 6M5 9l10 10M7 5l12 12M11 5l8 8M15 5l4 4" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function GmailIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" fill="#fff" stroke="#EA4335" strokeWidth="1.5" />
      <path d="M3 6l9 7 9-7" stroke="#EA4335" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export function TeamsIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="6" width="14" height="12" rx="2" fill="#5059C9" />
      <text x="10" y="16" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" fontFamily="system-ui">T</text>
      <circle cx="19" cy="9" r="3" fill="#7B83EB" />
    </svg>
  );
}

export function DriveIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M8 3h8l6 11-4 7H6L2 14 8 3Z" fill="#FFC107" />
      <path d="M8 3l-6 11 4 7 6-11L8 3Z" fill="#1E88E5" />
      <path d="M16 3l-4 7 6 11 4-7L16 3Z" fill="#43A047" />
    </svg>
  );
}

export function CalendarIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" fill="#fff" stroke="#4285F4" strokeWidth="1.5" />
      <path d="M3 9h18" stroke="#4285F4" strokeWidth="1.5" />
      <path d="M8 3v4M16 3v4" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round" />
      <text x="12" y="17" textAnchor="middle" fontSize="7" fontWeight="700" fill="#4285F4" fontFamily="system-ui">31</text>
    </svg>
  );
}

export function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
