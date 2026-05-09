// Tiny inline SVG glyphs — no icon library needed.
// Each is 12×12, currentColor, intentionally unfussy (engineering tool aesthetic).

type Props = { size?: number; className?: string };

const wrap = (size: number, className: string | undefined, child: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
    {child}
  </svg>
);

export const Glyph = {
  Trigger: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1" strokeLinecap="square">
      <path d="M2 6 L10 6" />
      <path d="M7 3 L10 6 L7 9" />
    </g>
  ),
  Plan: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1">
      <rect x="2" y="2" width="8" height="8" />
      <path d="M4 5 L8 5 M4 7 L7 7" />
    </g>
  ),
  Sandbox: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1">
      <path d="M2 4 L6 2 L10 4 L10 9 L6 11 L2 9 Z" />
      <path d="M2 4 L6 6 L10 4 M6 6 L6 11" />
    </g>
  ),
  Pr: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1">
      <circle cx="3" cy="3" r="1.2" />
      <circle cx="3" cy="9" r="1.2" />
      <circle cx="9" cy="9" r="1.2" />
      <path d="M3 4 L3 8" />
      <path d="M3 6 Q6 6 9 8" />
    </g>
  ),
  Conflict: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1">
      <path d="M6 1 L11 11 L1 11 Z" />
      <path d="M6 5 L6 8" />
      <circle cx="6" cy="9.5" r="0.4" fill="currentColor" />
    </g>
  ),
  Q: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1">
      <circle cx="6" cy="6" r="4.5" />
      <path d="M5 5 Q5 3.5 6.3 3.5 Q7.5 3.5 7.5 5 Q7.5 5.8 6 6.4 L6 7.5" />
      <circle cx="6" cy="9" r="0.35" fill="currentColor" />
    </g>
  ),
  Override: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1">
      <path d="M6 1 L6 11" />
      <path d="M2 5 L6 1 L10 5" />
      <path d="M3 7 L9 7" />
    </g>
  ),
  Audit: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1">
      <path d="M3 1 L9 1 L9 11 L3 11 Z" />
      <path d="M5 4 L7 4 M5 6 L7 6 M5 8 L7 8" />
    </g>
  ),
  Notion: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1">
      <rect x="2" y="2" width="8" height="8" />
      <path d="M4 4 L4 8 M4 4 L8 8 M8 4 L8 8" />
    </g>
  ),
  Slack: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1">
      <path d="M3 5 L7 5 M3 7 L7 7" />
      <path d="M5 3 L5 7 M7 3 L7 7" />
      <path d="M3 5 L3 9 M5 9 L5 5" />
    </g>
  ),
  Doc: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1">
      <path d="M3 1 L7 1 L9 3 L9 11 L3 11 Z" />
      <path d="M7 1 L7 3 L9 3" />
      <path d="M5 6 L7 6 M5 8 L7 8" />
    </g>
  ),
  Arrow: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1" strokeLinecap="square">
      <path d="M3 9 L9 3" />
      <path d="M5 3 L9 3 L9 7" />
    </g>
  ),
  Dot: ({ size = 12, className }: Props) => wrap(size, className,
    <circle cx="6" cy="6" r="3" fill="currentColor" />
  ),
  Lock: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1">
      <rect x="3" y="5" width="6" height="6" />
      <path d="M4 5 L4 3.5 Q4 1.5 6 1.5 Q8 1.5 8 3.5 L8 5" />
    </g>
  ),
  Check: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="square">
      <path d="M2 6.5 L5 9 L10 3" />
    </g>
  ),
  X: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="square">
      <path d="M3 3 L9 9 M9 3 L3 9" />
    </g>
  ),
  Pencil: ({ size = 12, className }: Props) => wrap(size, className,
    <g stroke="currentColor" strokeWidth="1">
      <path d="M2 10 L4 10 L10 4 L8 2 L2 8 Z" />
    </g>
  ),
};

export type GlyphKey = keyof typeof Glyph;
