/** Heraldic crest: crossed blades over a shield, drawn inline so it stays crisp. */
export function Crest({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 72"
      className={className}
      role="img"
      aria-label="Albion Platform crest"
    >
      <defs>
        <linearGradient id="crest-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7e7bd" />
          <stop offset="55%" stopColor="#e5c06a" />
          <stop offset="100%" stopColor="#8a6316" />
        </linearGradient>
      </defs>

      {/* shield */}
      <path
        d="M32 2 L60 11 V36 C60 52 47 64 32 70 C17 64 4 52 4 36 V11 Z"
        fill="#12151a"
        stroke="url(#crest-gold)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M32 8 L54 15 V36 C54 48.5 43.5 58.5 32 63.5 C20.5 58.5 10 48.5 10 36 V15 Z"
        fill="none"
        stroke="url(#crest-gold)"
        strokeWidth="0.9"
        opacity="0.5"
      />

      {/* crossed blades */}
      <g stroke="url(#crest-gold)" strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M21 50 L43 22" />
        <path d="M43 50 L21 22" />
      </g>
      <g fill="url(#crest-gold)">
        <circle cx="32" cy="36" r="3.6" />
        <path d="M18 52 l5 -5 3 3 -5 5 z" />
        <path d="M46 52 l-5 -5 -3 3 5 5 z" />
      </g>
    </svg>
  );
}
